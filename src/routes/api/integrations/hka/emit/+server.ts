// src/routes/api/integrations/hka/emit/+server.ts
import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { emitInvoiceHka, type EmitInvoiceInput } from '$lib/server/services/hka';
import { recordEmittedHkaInvoice, findDuplicateHkaInvoice, getInvoicePeriod, formatPeriodName } from '$lib/server/services/hkaTracking';
import { logAction } from '$lib/server/audit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
  const profile = (locals as any).profile;
  if (!profile) {
    return json({ success: false, message: 'No autenticado.' }, { status: 401 });
  }

  const canEmit =
    hasPermission(profile, 'cash_billing', 'create') ||
    hasPermission(profile, 'sec_integrations', 'others') ||
    hasPermission(profile, 'sec_integrations', 'update');

  if (!canEmit) {
    return json(
      { success: false, message: 'No tienes permisos para emitir facturación electrónica (se requiere cash_billing o sec_integrations).' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const input: EmitInvoiceInput = body.input || body;
    const profitDocNum = body.profit_doc_num || body.doc_num || null;
    const force = Boolean(body.force);
    const montoUsd = body.monto_usd !== undefined ? Number(body.monto_usd) : undefined;
    const idServicio = body.id_servicio !== undefined ? body.id_servicio : null;

    if (!input.comprador || !input.items || input.items.length === 0) {
      return json({ success: false, message: 'Estructura inválida: se requiere comprador e items.' }, { status: 400 });
    }

    // 1. Prevención de duplicados por mes
    const periodo = getInvoicePeriod();
    const searchIdentifier = idServicio || input.comprador.numeroIdentificacion;

    if (searchIdentifier && !force) {
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

    // 2. Emisión ante The Factory HKA
    const result = await emitInvoiceHka(input);

    if (result.success && result.resultado) {
      // 3. Registrar trazabilidad
      const r = result.resultado;
      const totalVes = input.items.reduce((acc, it) => acc + (it.cantidad * it.precioUnitario * (1 + (it.tasaIVA || 16) / 100)), 0);
      const baseVes = input.items.reduce((acc, it) => acc + (it.cantidad * it.precioUnitario), 0);
      const ivaVes = totalVes - baseVes;

      const tracked = await recordEmittedHkaInvoice(
        {
          profit_doc_num: profitDocNum,
          id_servicio: idServicio ? Number(idServicio) : null,
          periodo,
          cliente_nombre: input.comprador.razonSocial,
          cliente_cedula: `${input.comprador.tipoIdentificacion}-${input.comprador.numeroIdentificacion}`,
          tipo_identificacion: input.comprador.tipoIdentificacion,
          numero_identificacion: input.comprador.numeroIdentificacion,
          tipo_documento: input.tipoDocumento || '01',
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

      // 4. Registrar en auditoría
      await logAction({
        uid: profile.id,
        user_email: profile.email || 'system',
        action: 'CREATE',
        module: 'hka_electronic_invoices',
        record_id: tracked.numero_documento,
        new_data: {
          numero_documento: tracked.numero_documento,
          numero_control: tracked.numero_control,
          cliente: tracked.cliente_nombre,
          monto_ves: tracked.monto_ves,
          profit_doc_num: profitDocNum
        },
        branch_id: profile.allowed_branches?.[0]?.id || undefined
      });

      return json({
        success: true,
        message: result.mensaje || 'Factura emitida exitosamente ante The Factory HKA',
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

