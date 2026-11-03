// src/lib/server/services/wisphubSync.ts
import { AgentClient } from '$lib/server/agent';
import { parseClientCedula } from './hka';
import { getExchangeRateResolver } from './exchangeRates';
import type { WisphubClient, WisphubInvoice, WisphubPlan } from './wisphub';

export interface CustomerFieldMappings {
  co_cli_source?: 'cedula_or_id' | 'cedula_or_user' | 'id_servicio' | 'usuario';
  cli_des_source?: 'nombre_apellido' | 'razon_social';
  campo1_source?: 'id_servicio' | 'usuario' | 'ip' | 'plan' | 'router' | 'none';
  campo2_source?: 'id_servicio' | 'usuario' | 'ip' | 'plan' | 'router' | 'none';
  campo3_source?: 'id_servicio' | 'usuario' | 'ip' | 'plan' | 'router' | 'none';
}

export interface CustomerSyncOptions {
  sedeId?: string;
  default_cta_ingr_egr?: string; // Por defecto: 'I-001'
  default_zone?: string; // Por defecto: '01'
  default_client_type?: string; // Por defecto: '01'
  default_seller?: string; // Por defecto: '01'
  default_segment?: string; // Por defecto: '01'
  default_currency?: string; // Por defecto: 'US$'
  default_cond?: string; // Por defecto: '01'
  overwrite_existing?: boolean;
  field_mappings?: CustomerFieldMappings;
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

function resolveSourceValue(source: string | undefined, client: WisphubClient): string {
  switch (source) {
    case 'id_servicio':
      return String(client.id_servicio || '');
    case 'usuario':
      return String(client.usuario || '');
    case 'ip':
      return String(client.ip || client.ip_local || '');
    case 'plan':
      return typeof client.plan_internet === 'object'
        ? String(client.plan_internet?.nombre || '')
        : String(client.plan_internet || '');
    case 'router':
      return typeof client.router === 'object'
        ? String(client.router?.nombre || '')
        : String(client.router || '');
    case 'none':
      return '';
    default:
      return '';
  }
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
  co_cta_ingr_egr: string;
  co_ven: string;
  co_seg: string;
  co_mone: string;
  co_cond: string;
  tipo_per: string;
  contribuyente: boolean;
  contribu_e: boolean;
  campo1: string;
  campo2: string;
  campo3: string;
} {
  const cedulaStr = String(client.cedula || client.rfc || '').trim();
  const parsed = parseClientCedula(cedulaStr);

  const mappings = options.field_mappings || {};
  const coCliSource = mappings.co_cli_source || 'cedula_or_id';

  // 1. Resolver Código de Cliente en Profit Plus (co_cli)
  let co_cli = '';
  if (coCliSource === 'id_servicio') {
    co_cli = `WISP-${client.id_servicio}`;
  } else if (coCliSource === 'usuario') {
    co_cli = (client.usuario || `WISP-${client.id_servicio}`).toUpperCase().slice(0, 15);
  } else if (coCliSource === 'cedula_or_user') {
    if (parsed.cleanDoc) {
      co_cli = `${parsed.tipo}${parsed.cleanDoc}`;
    } else if (client.usuario && /^[a-zA-Z0-9_\-]+$/.test(client.usuario)) {
      co_cli = client.usuario.toUpperCase().slice(0, 15);
    } else {
      co_cli = `WISP-${client.id_servicio}`;
    }
  } else {
    // 'cedula_or_id' (Por defecto)
    if (parsed.cleanDoc) {
      co_cli = `${parsed.tipo}${parsed.cleanDoc}`;
    } else {
      co_cli = `WISP-${client.id_servicio}`;
    }
  }

  // 2. Resolver Nombre o Razón Social (cli_des)
  let cli_des = '';
  const nom = (client.nombre || '').trim();
  const ape = (client.apellido || '').trim();
  const nomCompleto = `${nom} ${ape}`.trim().toUpperCase();
  const razonSoc = (client.razon_social || '').trim().toUpperCase();

  if (mappings.cli_des_source === 'razon_social') {
    cli_des = razonSoc || nomCompleto || `CLIENTE WISPHUB ${client.id_servicio}`;
  } else {
    cli_des = nomCompleto || razonSoc || `CLIENTE WISPHUB ${client.id_servicio}`;
  }

  // 3. RIF Formateado
  const rif = parsed.formattedRif || (parsed.cleanDoc ? `${parsed.tipo}-${parsed.cleanDoc}` : co_cli);

  // 4. Tipo de persona y contribuyente según tipo de documento
  const isJuridica = parsed.tipo === 'J' || parsed.tipo === 'G';
  const tipo_per = isJuridica ? '3' : '1'; // 1: Persona Natural, 3: Jurídica Domiciliada
  const contribuyente = isJuridica;

  // 5. Dirección y contacto
  const direc1 = (client.direccion || client.localidad || client.ciudad || 'VALENCIA, VENEZUELA').trim().toUpperCase().slice(0, 100);
  const ciudad = (client.ciudad || 'VALENCIA').trim().toUpperCase().slice(0, 50);
  const telefonos = (client.telefono || '').trim().slice(0, 30);
  const email = (client.email || '').trim().slice(0, 60);

  // 6. Cuenta de Ingreso/Egreso (según sucursal u opciones)
  const co_cta_ingr_egr = (options.default_cta_ingr_egr || 'I-001').trim().slice(0, 20);

  // 7. Catálogos por defecto según sucursal u opciones
  const co_zon = (options.default_zone || '01').trim().slice(0, 6);
  const tip_cli = (options.default_client_type || '01').trim().slice(0, 6);
  const co_ven = (options.default_seller || '01').trim().slice(0, 10);
  const co_seg = (options.default_segment || '01').trim().slice(0, 6);
  const co_mone = (options.default_currency || 'US$').trim().slice(0, 6);
  const co_cond = (options.default_cond || '01').trim().slice(0, 6);

  // 8. Campos adicionales de trazabilidad (campo1, campo2, campo3)
  const campo1 = resolveSourceValue(mappings.campo1_source || 'id_servicio', client) || String(client.id_servicio);
  const campo2 = resolveSourceValue(mappings.campo2_source || 'usuario', client) || String(client.usuario || '');
  const campo3 = resolveSourceValue(mappings.campo3_source || 'ip', client) || String(client.ip || client.ip_local || '');

  return {
    co_cli: co_cli.slice(0, 15),
    cli_des: cli_des.slice(0, 80),
    rif: rif.slice(0, 18),
    telefonos,
    email,
    direc1,
    ciudad,
    co_zon,
    tip_cli,
    co_cta_ingr_egr,
    co_ven,
    co_seg,
    co_mone,
    co_cond,
    tipo_per,
    contribuyente,
    contribu_e: false,
    campo1: campo1.slice(0, 60),
    campo2: campo2.slice(0, 60),
    campo3: campo3.slice(0, 60)
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
    } catch { }

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
