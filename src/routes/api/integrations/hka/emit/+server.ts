// src/routes/api/integrations/hka/emit/+server.ts
import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { getBranchById } from '$lib/server/branches';
import { AgentClient } from '$lib/server/agent';
import { emitInvoiceHka, getHkaConfig, type EmitInvoiceInput } from '$lib/server/services/hka';
import {
  recordEmittedHkaInvoice,
  findDuplicateHkaInvoice,
  getEmittedHkaInvoices,
  getInvoicePeriod,
  formatPeriodName
} from '$lib/server/services/hkaTracking';
import { logAction } from '$lib/server/audit';
import type { RequestHandler } from './$types';

function escapeSql(val: string): string {
  return String(val || '').replace(/'/g, "''").trim();
}

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }

  const canEmit =
    Boolean(profile.is_admin) ||
    hasPermission(profile, 'cash_billing', 'create') ||
    hasPermission(profile, 'cash_credits', 'create') ||
    hasPermission(profile, 'sec_integrations', 'create') ||
    hasPermission(profile, 'sec_integrations', 'others') ||
    hasPermission(profile, 'sec_integrations', 'update');

  if (!canEmit) {
    return json(
      {
        success: false,
        message: 'No tienes permisos para emitir facturación electrónica (se requiere cash_billing, cash_credits o sec_integrations).'
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const requireActive = Boolean(body.require_active);

    if (requireActive) {
      const cfg = await getHkaConfig(fetch);
      if (!cfg.is_active || !cfg.token_empresa || !cfg.token_clave) {
        return json({
          success: false,
          skipped: true,
          message: 'Integración The Factory HKA no está activa o no tiene credenciales configuradas.'
        });
      }
    }

    const baseInput: Partial<EmitInvoiceInput> = body.input ? { ...body.input } : { ...body };
    const input: EmitInvoiceInput = {
      ...baseInput,
      tipoDocumento: (baseInput.tipoDocumento || body.tipoDocumento || '01') as '01' | '02' | '03',
      comprador: baseInput.comprador || {
        tipoIdentificacion: (body.tipoIdentificacion || 'V') as 'V' | 'J' | 'G' | 'E' | 'P',
        numeroIdentificacion: String(body.numeroIdentificacion || '00000000'),
        razonSocial: String(body.razonSocial || 'CLIENTE GENERAL'),
        direccion: String(body.direccion || 'VENEZUELA'),
        telefono: body.telefono ? String(body.telefono) : undefined,
        correo: body.correo ? String(body.correo) : undefined
      },
      items: baseInput.items || body.items || [],
      moneda: baseInput.moneda || body.moneda,
      tipoDePago: baseInput.tipoDePago || body.formaPago || '01',
      formaDePagoDescripcion: baseInput.formaDePagoDescripcion || body.formaDePagoDescripcion,
      observacion: baseInput.observacion || body.observacion,
      numeroDocumentoAfectado: baseInput.numeroDocumentoAfectado || body.numeroDocumentoAfectado,
      motivoModificacion: baseInput.motivoModificacion || body.motivoModificacion,
      numeroFacturaAfectada: baseInput.numeroFacturaAfectada || body.numeroFacturaAfectada,
      serieFacturaAfectada: baseInput.serieFacturaAfectada || body.serieFacturaAfectada,
      fechaFacturaAfectada: baseInput.fechaFacturaAfectada || body.fechaFacturaAfectada,
      montoFacturaAfectada: baseInput.montoFacturaAfectada ?? body.montoFacturaAfectada,
      comentarioFacturaAfectada: baseInput.comentarioFacturaAfectada || body.comentarioFacturaAfectada
    };

    const profitDocNum = body.profit_doc_num || body.doc_num || null;
    const profitNcrNum = body.profit_ncr_num || null;
    const profitFacturaOrigen = body.profit_factura_origen || null;
    const branchId = body.branch_id ? String(body.branch_id) : null;
    const force = Boolean(body.force);
    const montoUsd = body.monto_usd !== undefined ? Number(body.monto_usd) : undefined;
    const idServicio = body.id_servicio !== undefined ? body.id_servicio : null;
    const tipoDoc = input.tipoDocumento || '01';

    if (!input.comprador || !input.items || input.items.length === 0) {
      return json({ success: false, message: 'Estructura inválida: se requiere comprador e items.' }, { status: 400 });
    }

    // 1. Prevención de duplicados y resolución de factura afectada en historial HKA
    const periodo = getInvoicePeriod();
    let emittedHistory: Awaited<ReturnType<typeof getEmittedHkaInvoices>> | null = null;
    const loadHistoryOnce = async () => {
      if (!emittedHistory) {
        emittedHistory = await getEmittedHkaInvoices({ limit: 500 }, fetch);
      }
      return emittedHistory;
    };

    if (!force) {
      if (profitDocNum && !idServicio) {
        const history = await loadHistoryOnce();
        const duplicateDoc = history.find(
          (inv) =>
            String(inv.profit_doc_num || '').trim() === String(profitDocNum).trim() &&
            (inv.tipo_documento || '01') === tipoDoc
        );
        if (duplicateDoc) {
          return json(
            {
              success: false,
              isDuplicate: true,
              message: `El documento Profit N° ${profitDocNum} ya fue emitido en HKA (Doc N° ${duplicateDoc.numero_documento}, Control ${duplicateDoc.numero_control}).`,
              existingInvoice: duplicateDoc
            },
            { status: 409 }
          );
        }
      } else {
        const searchIdentifier = idServicio || input.comprador.numeroIdentificacion;
        if (searchIdentifier) {
          const duplicate = await findDuplicateHkaInvoice(searchIdentifier, periodo, montoUsd);
          if (duplicate) {
            const periodName = formatPeriodName(periodo);
            return json(
              {
                success: false,
                isDuplicate: true,
                message: `Ya existe una factura electrónica emitida para este cliente/servicio en ${periodName} (Doc N° ${duplicate.numero_documento}, Control ${duplicate.numero_control}).`,
                existingInvoice: duplicate
              },
              { status: 409 }
            );
          }
        }
      }
    }

    // Si es Nota de Crédito y viene profit_factura_origen, buscar su correlativo HKA emitido previamente o en Profit SQL
    if ((tipoDoc === '02' || tipoDoc === '03') && profitFacturaOrigen) {
      const history = await loadHistoryOnce();
      const origHka = history.find(
        (inv) =>
          String(inv.profit_doc_num || '').trim() === String(profitFacturaOrigen).trim() &&
          (inv.tipo_documento || '01') === '01'
      );
      if (origHka) {
        input.numeroFacturaAfectada = origHka.numero_documento;
        input.serieFacturaAfectada = origHka.serie ?? '';
        if (!input.fechaFacturaAfectada && origHka.hka_fecha_asignacion) {
          input.fechaFacturaAfectada = origHka.hka_fecha_asignacion;
        }
        if (input.montoFacturaAfectada === undefined && Number(origHka.monto_ves || 0) > 0) {
          input.montoFacturaAfectada = Number(origHka.monto_ves);
        }
      } else {
        const cleanOrig = String(profitFacturaOrigen).trim();
        let resolvedDocNum = cleanOrig.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || cleanOrig;

        if (branchId) {
          try {
            const branch = await getBranchById(branchId, profile.allowed_branches, fetch);
            if (branch && branch.agent_url) {
              const agent = new AgentClient(
                {
                  slug: branch.id,
                  agent_url: branch.agent_url,
                  agent_api_key: branch.agent_token
                },
                profile,
                fetch
              );
              const qOrig = `
                SELECT TOP 1
                  LTRIM(RTRIM(doc_num)) AS doc_num,
                  CONVERT(varchar(10), fec_emis, 103) AS fec_emis_dmy,
                  total_neto,
                  LTRIM(RTRIM(ISNULL(campo3, ''))) AS hka_doc_num
                FROM saFacturaVenta
                WHERE LTRIM(RTRIM(doc_num)) = '${escapeSql(cleanOrig)}'
              `;
              const origRes = await agent.request<any[]>(`/query?sede=${encodeURIComponent(branch.id)}`, {
                method: 'POST',
                body: JSON.stringify({ query: qOrig })
              });
              const row = origRes.success && Array.isArray(origRes.data) ? origRes.data[0] : null;
              if (row) {
                const hkaDocField = String(row.hka_doc_num || '').trim();
                if (/^\d+$/.test(hkaDocField)) {
                  resolvedDocNum = hkaDocField;
                }
                if (!input.fechaFacturaAfectada && row.fec_emis_dmy) {
                  input.fechaFacturaAfectada = String(row.fec_emis_dmy).trim();
                }
                if (input.montoFacturaAfectada === undefined && Number(row.total_neto || 0) > 0) {
                  input.montoFacturaAfectada = Number(row.total_neto);
                }
              }
            }
          } catch (origErr: any) {
            console.warn('[HKA EMIT] Error consultando factura origen en Profit SQL:', origErr?.message || origErr);
          }
        }

        if (!input.numeroFacturaAfectada) {
          input.numeroFacturaAfectada = resolvedDocNum;
        }
      }
    }

    // 2. Emisión ante The Factory HKA
    const result = await emitInvoiceHka(input);

    if (result.success && result.resultado) {
      // 3. Registrar trazabilidad
      const r = result.resultado;
      const baseVes = input.items.reduce((acc, it) => acc + Number(it.cantidad || 1) * Number(it.precioUnitario || 0), 0);
      const ivaVes = input.items.reduce((acc, it) => {
        const tasa = it.codigoImpuesto === 'E' ? 0 : (it.tasaIVA ?? 16);
        return acc + Number(it.cantidad || 1) * Number(it.precioUnitario || 0) * (tasa / 100);
      }, 0);
      const totalVes = baseVes + ivaVes;

      const tracked = await recordEmittedHkaInvoice(
        {
          profit_doc_num: profitDocNum,
          id_servicio: idServicio ? Number(idServicio) : null,
          periodo,
          cliente_nombre: input.comprador.razonSocial,
          cliente_cedula: `${input.comprador.tipoIdentificacion}-${input.comprador.numeroIdentificacion}`,
          tipo_identificacion: input.comprador.tipoIdentificacion,
          numero_identificacion: input.comprador.numeroIdentificacion,
          tipo_documento: tipoDoc,
          serie: r.serie || input.serie || '',
          numero_documento: r.numeroDocumento || String(input.numeroDocumento || ''),
          numero_control: r.numeroControl || '',
          rango_asignado: r.rangoAsignado,
          url_consulta: r.urlConsulta,
          imprenta_digital: r.imprentaDigital,
          monto_usd: montoUsd,
          monto_ves: Number(totalVes.toFixed(2)),
          base_imponible_ves: Number(baseVes.toFixed(2)),
          iva_ves: Number(ivaVes.toFixed(2)),
          hka_codigo: String(result.codigo || '200'),
          hka_mensaje: result.mensaje || 'Emitido exitosamente',
          hka_fecha_asignacion: r.fechaAsignacion,
          hka_hora_asignacion: r.horaAsignacion,
          created_by: profile.email || 'system',
          raw_resultado: r
        },
        fetch
      );

      // 3.1 Actualizar N° de Control y campos HKA en SQL Server (Profit Plus) si aplica
      if (branchId && profitDocNum) {
        try {
          const branch = await getBranchById(branchId, profile.allowed_branches, fetch);
          if (branch && branch.agent_url) {
            const agent = new AgentClient(
              {
                slug: branch.id,
                agent_url: branch.agent_url,
                agent_api_key: branch.agent_token
              },
              profile,
              fetch
            );

            const safeDocNum = escapeSql(String(profitDocNum));
            const safeNcrNum = escapeSql(String(profitNcrNum || profitDocNum));
            const safeControl = escapeSql(String(r.numeroControl || '').slice(0, 20));
            const safeDocHka = escapeSql(String(r.numeroDocumento || '').slice(0, 60));
            const fullSafeUrl = escapeSql(String(r.urlConsulta || ''));
            const safeUrl1 = fullSafeUrl.slice(0, 60);
            const safeUrl2 = fullSafeUrl.slice(60, 120);
            const safeUrl3 = fullSafeUrl.slice(120, 180);

            const urlCamposSql = fullSafeUrl
              ? `,
                    campo4 = '${safeUrl1}',
                    campo5 = '${safeUrl2}',
                    campo6 = '${safeUrl3}'`
              : '';
            const urlFullSql = fullSafeUrl
              ? `${urlCamposSql},
                    dir_ent = '${fullSafeUrl}'`
              : '';

            let sqlUpdate = '';
            if (tipoDoc === '01') {
              sqlUpdate = `
                UPDATE saFacturaVenta
                SET n_control = ${safeControl ? `'${safeControl}'` : 'n_control'},
                    campo1 = 'HKA-EMIT',
                    campo2 = '${safeControl}',
                    campo3 = '${safeDocHka}'${urlFullSql}
                WHERE LTRIM(RTRIM(doc_num)) = '${safeDocNum}';

                UPDATE saDocumentoVenta
                SET n_control = ${safeControl ? `'${safeControl}'` : 'n_control'},
                    campo1 = 'HKA-EMIT',
                    campo2 = '${safeControl}',
                    campo3 = '${safeDocHka}'${urlCamposSql}
                WHERE LTRIM(RTRIM(co_tipo_doc)) = 'FACT' AND LTRIM(RTRIM(nro_doc)) = '${safeDocNum}';
              `;
            } else if (tipoDoc === '02') {
              sqlUpdate = `
                UPDATE saDevolucionCliente
                SET n_control = ${safeControl ? `'${safeControl}'` : 'n_control'},
                    campo1 = 'HKA-EMIT',
                    campo2 = '${safeControl}',
                    campo3 = '${safeDocHka}'${urlFullSql}
                WHERE LTRIM(RTRIM(doc_num)) = '${safeDocNum}';

                UPDATE saDocumentoVenta
                SET n_control = ${safeControl ? `'${safeControl}'` : 'n_control'},
                    campo1 = 'HKA-EMIT',
                    campo2 = '${safeControl}',
                    campo3 = '${safeDocHka}'${urlCamposSql}
                WHERE LTRIM(RTRIM(co_tipo_doc)) IN ('N/CR', 'NCR', 'DEVO')
                  AND (LTRIM(RTRIM(nro_doc)) = '${safeNcrNum}' OR (LTRIM(RTRIM(doc_orig)) = 'DEVO' AND LTRIM(RTRIM(nro_orig)) = '${safeDocNum}'));
              `;
            } else if (tipoDoc === '03') {
              sqlUpdate = `
                UPDATE saDocumentoVenta
                SET n_control = ${safeControl ? `'${safeControl}'` : 'n_control'},
                    campo1 = 'HKA-EMIT',
                    campo2 = '${safeControl}',
                    campo3 = '${safeDocHka}'${urlCamposSql}
                WHERE LTRIM(RTRIM(co_tipo_doc)) IN ('N/DB', 'NDB')
                  AND LTRIM(RTRIM(nro_doc)) = '${safeDocNum}';
              `;
            }

            if (sqlUpdate) {
              await agent.request(`/query?sede=${encodeURIComponent(branch.id)}`, {
                method: 'POST',
                body: JSON.stringify({ query: sqlUpdate })
              });
            }
          }
        } catch (sqlErr: any) {
          console.warn('[HKA EMIT] No se pudo actualizar n_control en Profit SQL:', sqlErr?.message || sqlErr);
        }
      }

      // 4. Registrar en auditoría
      await logAction({
        uid: profile.id,
        user_email: profile.email || 'system',
        action: 'CREATE',
        module: 'hka_electronic_invoices',
        record_id: tracked.numero_documento,
        new_data: {
          tipo_documento: tipoDoc,
          numero_documento: tracked.numero_documento,
          numero_control: tracked.numero_control,
          cliente: tracked.cliente_nombre,
          monto_ves: tracked.monto_ves,
          profit_doc_num: profitDocNum
        },
        branch_id: branchId || profile.allowed_branches?.[0]?.id || undefined
      });

      return json({
        success: true,
        message: result.mensaje || 'Documento emitido exitosamente ante The Factory HKA',
        data: tracked,
        hkaResult: result.resultado
      });
    } else {
      return json(
        {
          success: false,
          message: result.errorMessageFormatted || result.mensaje || 'Error al emitir documento en The Factory HKA',
          codigo: result.codigo,
          validaciones: result.validaciones,
          isDuplicate: result.isDuplicate
        },
        { status: 400 }
      );
    }
  } catch (err: any) {
    return json({ success: false, message: `Error interno de emisión: ${err.message}` }, { status: 500 });
  }
};

