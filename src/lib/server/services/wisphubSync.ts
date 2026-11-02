// src/lib/server/services/wisphubSync.ts
import { AgentClient } from '$lib/server/agent';
import { parseClientCedula } from './hka';
import { getExchangeRateResolver } from './exchangeRates';
import type { WisphubClient, WisphubInvoice, WisphubPlan } from './wisphub';

export interface CustomerSyncOptions {
  sedeId?: string;
  default_zone?: string;
  default_client_type?: string;
  overwrite_existing?: boolean;
}

export interface CustomerSyncResult {
  success: boolean;
  co_cli: string;
  id_servicio: number;
  nombre: string;
  action: 'created' | 'updated' | 'skipped' | 'failed';
  message?: string;
  error?: string;
}

export interface BatchSyncSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: CustomerSyncResult[];
}

/**
 * Normaliza y mapea un cliente de WispHub al esquema de la tabla saCliente de Profit Plus
 */
export function mapWisphubClientToProfit(
  client: WisphubClient,
  options: CustomerSyncOptions = {}
): {
  co_cli: string;
  cli_des: string;
  rif: string;
  telefonos: string;
  email: string;
  direc1: string;
  ciudad: string;
  co_zon: string;
  tip_cli: string;
  tipo_per: string;
  contribuyente: boolean;
  contribu_e: boolean;
  campo1: string; // id_servicio en WispHub
  campo2: string; // usuario en WispHub
  campo3: string; // IP asignada
} {
  const cedulaStr = String(client.cedula || client.rfc || '').trim();
  const parsed = parseClientCedula(cedulaStr);

  // Código de cliente en Profit Plus: Si hay cédula válida se usa ej. V12345678, sino WISP-ID
  let co_cli = '';
  if (parsed.cleanDoc) {
    co_cli = `${parsed.tipo}${parsed.cleanDoc}`;
  } else if (client.usuario && /^[a-zA-Z0-9_\-]+$/.test(client.usuario)) {
    co_cli = client.usuario.toUpperCase().slice(0, 15);
  } else {
    co_cli = `WISP-${client.id_servicio}`;
  }

  // Nombre o Razón Social
  let cli_des = '';
  if (client.razon_social && client.razon_social.trim().length > 2) {
    cli_des = client.razon_social.trim().toUpperCase();
  } else {
    const nom = (client.nombre || '').trim();
    const ape = (client.apellido || '').trim();
    cli_des = `${nom} ${ape}`.trim().toUpperCase() || `CLIENTE WISPHUB ${client.id_servicio}`;
  }

  // RIF Formateado
  const rif = parsed.formattedRif || (parsed.cleanDoc ? `${parsed.tipo}-${parsed.cleanDoc}` : co_cli);

  // Tipo de persona y contribuyente según tipo de documento
  const isJuridica = parsed.tipo === 'J' || parsed.tipo === 'G';
  const tipo_per = isJuridica ? '3' : '1'; // 1: Persona Natural, 3: Jurídica Domiciliada
  const contribuyente = isJuridica;

  // Dirección y contacto
  const direc1 = (client.direccion || client.localidad || client.ciudad || 'VALENCIA, VENEZUELA').trim().toUpperCase().slice(0, 100);
  const ciudad = (client.ciudad || 'VALENCIA').trim().toUpperCase().slice(0, 50);
  const telefonos = (client.telefono || '').trim().slice(0, 30);
  const email = (client.email || '').trim().slice(0, 60);

  return {
    co_cli: co_cli.slice(0, 15),
    cli_des: cli_des.slice(0, 80),
    rif: rif.slice(0, 18),
    telefonos,
    email,
    direc1,
    ciudad,
    co_zon: (options.default_zone || '01').slice(0, 6),
    tip_cli: (options.default_client_type || '01').slice(0, 6),
    tipo_per,
    contribuyente,
    contribu_e: false,
    campo1: String(client.id_servicio),
    campo2: String(client.usuario || ''),
    campo3: String(client.ip || client.ip_local || '')
  };
}

/**
 * Sincroniza un cliente individual de WispHub hacia Profit Plus vía AgentClient
 */
export async function syncWisphubCustomerToProfit(
  client: WisphubClient,
  agentClient: AgentClient,
  options: CustomerSyncOptions = {}
): Promise<CustomerSyncResult> {
  const mapped = mapWisphubClientToProfit(client, options);

  try {
    // 1. Verificar si el cliente ya existe en Profit Plus
    const existing = await agentClient.getCustomer(mapped.co_cli).catch(() => null);
    const clientExists = Boolean(existing && existing.success && existing.data);

    if (clientExists) {
      if (options.overwrite_existing === false) {
        return {
          success: true,
          co_cli: mapped.co_cli,
          id_servicio: client.id_servicio,
          nombre: mapped.cli_des,
          action: 'skipped',
          message: 'Cliente existente omitido por configuración.'
        };
      }

      // 2. Actualizar cliente existente
      const updateRes = await agentClient.saveCustomer(mapped, false, options.sedeId);
      if (updateRes.success) {
        return {
          success: true,
          co_cli: mapped.co_cli,
          id_servicio: client.id_servicio,
          nombre: mapped.cli_des,
          action: 'updated',
          message: 'Cliente actualizado exitosamente en Profit Plus.'
        };
      } else {
        return {
          success: false,
          co_cli: mapped.co_cli,
          id_servicio: client.id_servicio,
          nombre: mapped.cli_des,
          action: 'failed',
          error: updateRes.message || 'Error al actualizar cliente en Profit Plus.'
        };
      }
    } else {
      // 3. Crear cliente nuevo
      const createRes = await agentClient.saveCustomer(mapped, true, options.sedeId);
      if (createRes.success) {
        return {
          success: true,
          co_cli: mapped.co_cli,
          id_servicio: client.id_servicio,
          nombre: mapped.cli_des,
          action: 'created',
          message: 'Cliente creado exitosamente en Profit Plus.'
        };
      } else {
        return {
          success: false,
          co_cli: mapped.co_cli,
          id_servicio: client.id_servicio,
          nombre: mapped.cli_des,
          action: 'failed',
          error: createRes.message || 'Error al crear cliente en Profit Plus.'
        };
      }
    }
  } catch (err: any) {
    return {
      success: false,
      co_cli: mapped.co_cli,
      id_servicio: client.id_servicio,
      nombre: mapped.cli_des,
      action: 'failed',
      error: `Fallo durante sincronización: ${err.message}`
    };
  }
}

/**
 * Sincroniza un lote de clientes de WispHub hacia Profit Plus
 */
export async function syncBatchWisphubCustomers(
  clients: WisphubClient[],
  agentClient: AgentClient,
  options: CustomerSyncOptions = {}
): Promise<BatchSyncSummary> {
  const summary: BatchSyncSummary = {
    total: clients.length,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    results: []
  };

  for (const client of clients) {
    const res = await syncWisphubCustomerToProfit(client, agentClient, options);
    summary.results.push(res);

    if (res.action === 'created') summary.created++;
    else if (res.action === 'updated') summary.updated++;
    else if (res.action === 'skipped') summary.skipped++;
    else if (res.action === 'failed') summary.failed++;
  }

  return summary;
}

/**
 * Mapeo y verificación de Planes de Internet de WispHub contra Artículos de Servicio en Profit Plus
 */
export interface PlanMappingResult {
  id_plan: number;
  nombre_plan: string;
  precio_usd: number;
  profit_co_art?: string;
  profit_art_des?: string;
  profit_exists: boolean;
  suggested_code: string;
}

export async function syncWisphubPlansToProfit(
  plans: WisphubPlan[],
  agentClient: AgentClient
): Promise<{
  success: boolean;
  mappings: PlanMappingResult[];
  unlinkedCount: number;
}> {
  const mappings: PlanMappingResult[] = [];
  let unlinkedCount = 0;

  for (const plan of plans) {
    const suggestedCode = `SRV-WISP-${String(plan.id).padStart(3, '0')}`;
    let matchedArticle: any = null;

    // Intentamos buscar por código sugerido o por descripción en Profit Plus
    try {
      const searchRes = await agentClient.request<any>(
        `/articulos/search?descripcion=${encodeURIComponent(plan.nombre)}&limit=1`
      );
      if (searchRes.success && Array.isArray(searchRes.data) && searchRes.data.length > 0) {
        matchedArticle = searchRes.data[0];
      }
    } catch {}

    if (matchedArticle) {
      mappings.push({
        id_plan: plan.id,
        nombre_plan: plan.nombre,
        precio_usd: plan.precio,
        profit_co_art: matchedArticle.co_art?.trim(),
        profit_art_des: matchedArticle.art_des?.trim(),
        profit_exists: true,
        suggested_code: suggestedCode
      });
    } else {
      unlinkedCount++;
      mappings.push({
        id_plan: plan.id,
        nombre_plan: plan.nombre,
        precio_usd: plan.precio,
        profit_exists: false,
        suggested_code: suggestedCode
      });
    }
  }

  return {
    success: true,
    mappings,
    unlinkedCount
  };
}

/**
 * Prepara los datos de una factura de WispHub para ser emitida a través del conector HKA (SENIAT V2)
 */
export async function mapWisphubInvoiceToHkaEmission(
  invoice: WisphubInvoice,
  client: WisphubClient,
  options: {
    serie?: string;
    correlativo?: string | number;
    exchangeRateOverride?: number;
    billingPeriod?: string;
  } = {}
) {
  const resolveRate = await getExchangeRateResolver('USD');
  const rateInfo = options.exchangeRateOverride
    ? { rate: options.exchangeRateOverride, rate_date: new Date().toISOString().split('T')[0] }
    : resolveRate(invoice.fecha_emision);

  const parsed = parseClientCedula(String(client.cedula || client.rfc || ''));
  const isJuridica = parsed.tipo === 'J' || parsed.tipo === 'G';

  // Montos en USD
  const totalUsd = Number(invoice.total || 0);
  const subtotalUsd = Number(invoice.subtotal || totalUsd);

  // Montos en Bs según tasa
  const totalBs = Number((totalUsd * rateInfo.rate).toFixed(2));
  const subtotalBs = Number((subtotalUsd * rateInfo.rate).toFixed(2));
  const ivaBs = Number((totalBs - subtotalBs).toFixed(2));

  // Renglones de factura
  const items = Array.isArray(invoice.articulos) && invoice.articulos.length > 0
    ? invoice.articulos.map((art, idx) => {
        const itemPriceUsd = Number(art.precio || totalUsd);
        const itemTotalUsd = Number(art.total || itemPriceUsd);
        const itemPriceBs = Number((itemPriceUsd * rateInfo.rate).toFixed(4));
        const itemTotalBs = Number((itemTotalUsd * rateInfo.rate).toFixed(2));

        return {
          numeroLinea: idx + 1,
          indicadorBienoServicio: '2' as const, // Servicio
          descripcion: (art.descripcion || `SERVICIO DE INTERNET - ${client.plan_internet || 'PLAN BÁSICO'}`).toUpperCase().slice(0, 200),
          cantidad: 1,
          unidadMedida: 'UND',
          precioUnitario: itemPriceBs,
          precioUnitarioFinal: itemPriceBs,
          precioItem: itemTotalBs,
          valorTotalItem: itemTotalBs,
          tasaIva: 16,
          montoIva: Number((itemTotalBs * 0.16).toFixed(2)),
          codigoItem: `SRV-${art.servicio?.id_servicio || invoice.id_factura}`
        };
      })
    : [{
        numeroLinea: 1,
        indicadorBienoServicio: '2' as const,
        descripcion: `SERVICIO DE INTERNET - PLAN ${typeof client.plan_internet === 'object' ? client.plan_internet?.nombre : client.plan_internet || 'ISP'}`.toUpperCase().slice(0, 200),
        cantidad: 1,
        unidadMedida: 'UND',
        precioUnitario: Number((subtotalBs).toFixed(4)),
        precioUnitarioFinal: Number((subtotalBs).toFixed(4)),
        precioItem: subtotalBs,
        valorTotalItem: subtotalBs,
        tasaIva: 16,
        montoIva: ivaBs,
        codigoItem: `SRV-FAC-${invoice.id_factura}`
      }];

  const buyerName = (client.razon_social || `${client.nombre || ''} ${client.apellido || ''}`).trim().toUpperCase();

  return {
    documentoElectronico: {
      tipoDocumento: '01',
      serie: options.serie || '',
      numeroDocumento: options.correlativo ? String(options.correlativo) : undefined,
      tipoTransaccion: '01',
      moneda: 'VES',
      fechaEmision: invoice.fecha_emision || new Date().toISOString(),
      cliente: {
        tipoIdentificacion: parsed.tipo || (isJuridica ? 'J' : 'V'),
        numeroIdentificacion: parsed.cleanDoc || '00000000',
        razonSocial: buyerName || 'CLIENTE FINAL',
        direccion: (client.direccion || client.localidad || 'VALENCIA').toUpperCase().slice(0, 100),
        telefono: client.telefono || '',
        correoElectronico: client.email || ''
      },
      totales: {
        totalOperacionesExentas: 0,
        totalBaseImponible: subtotalBs,
        totalImpuesto: ivaBs,
        totalFactura: totalBs
      },
      detalles: items,
      periodo: options.billingPeriod || invoice.fecha_emision?.slice(0, 7) || new Date().toISOString().slice(0, 7)
    },
    meta: {
      wisphub_factura_id: invoice.id_factura,
      wisphub_client_id: client.id_servicio,
      total_usd: totalUsd,
      total_bs: totalBs,
      tasa_bcv: rateInfo.rate,
      tasa_bcv_fecha: rateInfo.rate_date
    }
  };
}
