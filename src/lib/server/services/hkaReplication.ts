// src/lib/server/services/hkaReplication.ts
// Motor de Extracción, Auditoría Previa (Excel / SQL) y Replicación Nativa The Factory HKA -> Profit Plus 2kDoce

import * as XLSX from 'xlsx';
import type { AgentClient } from '$lib/server/agent';
import {
  listHkaAssignments,
  getHkaDocumentStatus,
  downloadHkaFile,
  extractPlanCapacity,
  type HkaConfig,
  type HkaAssignmentItem
} from './hka';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface HkaExtractedItem {
  numeroLinea: number;
  codigoPLU: string;
  coArtSugerido: string;
  indicadorBienoServicio: '1' | '2'; // '1' = Bien, '2' = Servicio
  descripcion: string; // Descripción limpia del artículo/renglón (sin el bloque PERIODO...)
  descripcionOriginal: string; // Descripción completa tal cual viene en HKA
  periodoExtraido: string | null; // Texto desde la palabra PERIODO en adelante (pasa a comentario de factura)
  cantidad: number;
  unidadMedidaHka: string;
  precioUnitario: number;
  descuentoMonto: number;
  precioItem: number; // Base antes de IVA
  codigoImpuesto: string; // 'G'=16%, 'R'=8%, 'A'=31%, 'E'=0%
  tasaIva: number;
  valorIva: number;
  valorTotalItem: number;
}

export interface HkaExtractedDocument {
  tipoDocumento: string; // '01'=FACT, '02'=N/DB, '03'=N/CR
  tipoProfitDoc: 'FACT' | 'N/DB' | 'N/CR';
  serie: string;
  numeroDocumento: string;
  numeroControl: string;
  fechaAsignacion: string;
  fechaEmisionRaw: string; // DD/MM/YYYY
  fechaEmisionIso: string; // YYYY-MM-DD
  horaEmision: string;
  fechaVencimientoIso: string; // YYYY-MM-DD
  estadoFiscal: string;
  anulada: boolean;
  fechaAnulacion?: string;
  motivoAnulacion?: string;
  urlConsulta?: string;
  monedaOriginal: string; // 'VES' | 'BSD' | 'USD'
  tipoCambioHka?: number | null;
  tipoDePago: string;
  formaPagoDescripcion: string;
  comentarioExtraido: string; // Periodo(s) extraído(s) de los ítems + observaciones de cabecera HKA
  numeroFacturaAfectada?: string;
  serieFacturaAfectada?: string;
  comprador: {
    tipoIdentificacion: string;
    numeroIdentificacion: string;
    rifFormateado: string;
    coCliSugerido: string;
    razonSocial: string;
    direccion: string;
    pais: string;
    telefono: string;
    correo: string;
  };
  totales: {
    nroItems: number;
    montoGravado: number;
    montoExento: number;
    subtotal: number;
    totalDescuento: number;
    totalIva: number;
    totalIgtf: number;
    totalIgtfVes: number;
    montoTotalConIva: number;
    totalAPagar: number;
  };
  items: HkaExtractedItem[];
  extractionError?: string;
}

export interface HkaReplicationOptions {
  pad_doc_num?: boolean; // true -> '0000000512' (longitud saSerieTipo), false -> '512'
  doc_num_length?: number; // Por defecto 10 (según saSerieTipo en Profit Plus)
  include_serie_prefix?: boolean; // Si true y serie='A', 'A0000000512'
  moneda_profit?: 'BS' | 'USD'; // 'BS' (tasa 1, nativo VES) o 'USD' (tasa BCV histórica de la fecha)
  moneda_precio_articulo?: 'USD' | 'BS'; // Moneda para registrar Precio 01 en saArtPrecio ('USD' con precioOm=1 por defecto, o 'BS')
  saldo_mode?: 'pendiente' | 'cero'; // 'pendiente' (saldo = total_neto para cruzar cobros) o 'cero'
  skip_zero_amount?: boolean; // true -> omite docs de prueba en 0.00 (CK_saFacturaVentaReng_Prec_Vta)
  include_annulled?: boolean; // true -> inserta anuladas con anulado=1, saldo=0 para Libro de Ventas SENIAT
  force_service_articles?: boolean; // true -> crea artículos nuevos como tipo 'S' (Servicio, sin descontar stock)
  // Defaults de Profit Plus (sucursal Aldanet / Galpe)
  default_sucursal?: string;
  default_warehouse?: string;
  default_zone?: string;
  default_client_type?: string;
  default_cta_ingr_egr?: string;
  default_seller?: string;
  default_segment?: string;
  default_cond?: string;
  default_tran?: string;
  default_lin?: string;
  default_subl?: string;
  default_cat?: string;
  default_color?: string;
  default_ubicacion?: string;
  default_proc?: string;
  default_unit?: string;
}

export interface ProfitAuditContext {
  agentConnected: boolean;
  databaseName: string;
  baseCurrency: string; // 'BS'
  usdCurrencyCode: string; // 'USD' o 'US$'
  serieFactura: {
    co_serie: string;
    co_tipo_serie: string;
    longitud: number;
    prefijo: string;
    sufijo: string;
    prox_n: number;
  };
  serieControl: {
    co_serie: string;
    co_tipo_serie: string;
    prox_n: number;
  };
  catalogs: {
    sucursal: string;
    almacen: string;
    vendedor: string;
    condicionPago: string;
    transporte: string;
    zona: string;
    tipoCliente: string;
    ctaIngrEgr: string;
    segmento: string;
    linea: string;
    sublinea: string;
    categoria: string;
    color: string;
    ubicacion: string;
    procedencia: string;
    unidad: string;
    tipoPrecio: string;
    pais: string;
    salestax: string | null;
  };
  ratesByDate: Array<{ fechaIso: string; tasa_v: number }>;
  existingClientsByCoCli: Map<string, { co_cli: string; rif: string; cli_des: string }>;
  existingClientsByRif: Map<string, { co_cli: string; rif: string; cli_des: string }>;
  existingArticlesByCode: Map<string, { co_art: string; art_des: string; tipo: string; tipo_imp: string; co_uni: string; has_price: boolean }>;
  existingArticlesByDesc: Map<string, { co_art: string; art_des: string; tipo: string; tipo_imp: string; co_uni: string; has_price: boolean }>;
  existingInvoicesByDocNum: Set<string>;
  existingInvoicesByControl: Map<string, string>; // n_control -> doc_num
}

export interface PlannedProfitClient {
  co_cli: string;
  cli_des: string;
  rif: string;
  direc1: string;
  telefonos: string;
  email: string;
  co_zon: string;
  tip_cli: string;
  co_cta_ingr_egr: string;
  co_seg: string;
  co_ven: string;
  co_cond: string;
  co_mone: string;
  tipo_per: string; // '1'=Nat Residente, '2'=Extranjero, '3'=Jurídica Domiciliada
  juridico: boolean;
  contribuyente: boolean;
  exists_in_profit: boolean;
  matched_by?: 'co_cli' | 'rif' | 'new';
  source_invoices: string[];
}

export interface PlannedProfitArticle {
  co_art: string;
  art_des: string;
  tipo: 'S' | 'V';
  tipo_imp: string; // '1'=16%, '2'=8%, '3'=31%, '6'=Exento 0%
  porc_imp: number;
  co_lin: string;
  co_subl: string;
  co_cat: string;
  co_color: string;
  co_ubicacion: string;
  cod_proc: string;
  co_uni: string;
  exists_in_profit: boolean;
  has_price_in_profit: boolean;
  needs_price_sync: boolean;
  matched_by?: 'co_art' | 'art_des' | 'new';
  // Precio 01 para saArtPrecio (tomado de la factura activa más reciente del artículo)
  co_precio: string;
  co_mone_precio: string;
  precio_om: boolean;
  monto_precio_asignar: number;
  latest_price_bs: number;
  latest_price_usd: number;
  latest_price_date: string;
  latest_price_doc: string;
  sample_price_bs: number;
  source_invoices: string[];
}

export interface PlannedProfitRenglon {
  reng_num: number;
  co_art: string;
  des_art: string; // Descripción limpia en saFacturaVentaReng (sin PERIODO...)
  des_art_original_hka: string;
  periodo_extraido: string | null;
  tipo_art: 'S' | 'V';
  co_uni: string;
  co_alma: string;
  co_precio: string;
  tipo_imp: string;
  porc_imp: number;
  cantidad: number;
  prec_vta_bs: number;
  prec_vta_usd: number;
  porc_desc: string | null;
  monto_desc_bs: number;
  reng_neto_bs: number;
  monto_imp_bs: number;
  total_renglon_bs: number;
}

export interface PlannedProfitInvoice {
  // Identificación HKA y Profit
  hka_numero_documento: string;
  hka_serie: string;
  hka_tipo_documento: string;
  tipo_doc_profit: 'FACT' | 'N/DB' | 'N/CR';
  doc_num_profit: string;
  n_control: string;
  nro_doc_afectado?: string | null;
  estado_hka: string;
  anulado: boolean;
  url_consulta?: string;
  // Comentario y banderas fiscales en Profit Plus
  comentario_factura: string; // Contiene "PERIODO ..." extraído desde los ítems
  impresa: boolean; // 1 = emitida fiscalmente
  impfis: string | null; // NULL para Imprenta Digital (solo aplica a Máquina Fiscal física)
  impfisfac: string | null; // NULL para Imprenta Digital
  imp_nro_z: string | null; // NULL para Imprenta Digital (solo Reporte Z de Máquina Fiscal)
  // Fechas
  fec_emis_iso: string;
  hora_emis: string;
  fec_venc_iso: string;
  fec_reg_iso: string; // Igual a fec_emis_iso para ubicación fiscal exacta en Libro de Ventas
  // Cliente
  co_cli: string;
  rif: string;
  cli_des: string;
  contribuyente: boolean;
  // Moneda y Tasa
  moneda_original_hka: string;
  co_mone_profit: string;
  tasa_profit: number;
  tasa_bcv_referencia: number;
  // Montos Base (Bolívares en Profit Plus cuando g_moneda = 'BS')
  monto_gravado_bs: number;
  monto_exento_bs: number;
  total_bruto_bs: number;
  monto_desc_glob_bs: number;
  monto_imp_bs: number;
  igtf_bs: number;
  igtf_base_bs: number;
  total_neto_bs: number;
  saldo_bs: number;
  equivalente_total_usd: number;
  // Catálogos cabecera
  co_sucu: string;
  co_ven: string;
  co_cond: string;
  co_tran: string;
  forma_pago_hka: string;
  // Renglones
  renglones: PlannedProfitRenglon[];
  // Estado de auditoría
  exists_in_profit: boolean;
  existing_match_reason?: string;
  action: 'CREATE' | 'SKIP_EXISTING' | 'SKIP_ZERO_AMOUNT' | 'SKIP_ANNULLED' | 'SKIP_ERROR';
  warnings: string[];
}

export interface HkaReplicationPlan {
  generatedAt: string;
  hkaEnvironment: 'demo' | 'production';
  hkaBaseUrl: string;
  agentConnected: boolean;
  databaseName: string;
  optionsUsed: Required<Pick<HkaReplicationOptions, 'pad_doc_num' | 'doc_num_length' | 'include_serie_prefix' | 'moneda_profit' | 'moneda_precio_articulo' | 'saldo_mode' | 'skip_zero_amount' | 'include_annulled' | 'force_service_articles'>>;
  summary: {
    totalHkaDocuments: number;
    invoicesToCreate: number;
    invoicesAlreadyInProfit: number;
    invoicesSkippedZeroOrError: number;
    annulledInvoicesCount: number;
    totalClientsReferenced: number;
    clientsToCreate: number;
    clientsExisting: number;
    totalArticlesReferenced: number;
    articlesToCreate: number;
    articlesExisting: number;
    articlesMissingPrice: number;
    totalNetoBsToReplicate: number;
    totalIvaBsToReplicate: number;
    totalEquivalentUsdToReplicate: number;
    minControlNumber: string;
    maxControlNumber: string;
    maxDocNumeric: number;
    warningsCount: number;
  };
  clients: PlannedProfitClient[];
  articles: PlannedProfitArticle[];
  invoices: PlannedProfitInvoice[];
  warnings: Array<{ doc_num: string; n_control: string; severity: 'warning' | 'error'; message: string }>;
}

// ============================================================================
// UTILIDADES DE NORMALIZACIÓN
// ============================================================================

function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function round5(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100000) / 100000;
}

function normalizeRifKey(raw?: string | null): string {
  if (!raw) return '';
  return String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseDmyToIso(dmy?: string | null): string {
  if (!dmy) return new Date().toISOString().slice(0, 10);
  const s = String(dmy).trim();
  const mDmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (mDmy) return `${mDmy[3]}-${mDmy[2]}-${mDmy[1]}`;
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  return new Date().toISOString().slice(0, 10);
}

/**
 * Separa la descripción de un ítem extraído de HKA a partir de la palabra "periodo" / "período" (inclusive).
 * Ejemplo:
 *   "RENTA Y MANTENIMIENTO DE LA RED: PLAN 100 FTTH  PERIODO 01/02/2026 AL 28/02/2026"
 *   -> cleanDescription: "RENTA Y MANTENIMIENTO DE LA RED: PLAN 100 FTTH"
 *   -> periodoText: "PERIODO 01/02/2026 AL 28/02/2026"
 */
export function splitDescriptionAndPeriodo(rawDesc?: string | null): {
  cleanDescription: string;
  periodoText: string | null;
} {
  const full = String(rawDesc || '').trim();
  if (!full) {
    return { cleanDescription: 'SERVICIO FACTURADO', periodoText: null };
  }

  const match = full.match(/\bper[ií]odo\b/i);
  if (!match || match.index === undefined) {
    return {
      cleanDescription: full.replace(/\s+/g, ' ').trim(),
      periodoText: null
    };
  }

  const beforeRaw = full
    .slice(0, match.index)
    .replace(/[\s\-–—:|,/(\[]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const tailRaw = full.slice(match.index);
  const openParens = (tailRaw.match(/\(/g) || []).length;
  const closeParens = (tailRaw.match(/\)/g) || []).length;
  const fromPeriodo = (closeParens > openParens ? tailRaw.replace(/\)+$/, '') : tailRaw)
    .replace(/\s+/g, ' ')
    .trim();

  return {
    cleanDescription: beforeRaw || full.replace(/\s+/g, ' ').trim() || 'SERVICIO FACTURADO',
    periodoText: fromPeriodo || null
  };
}

function sanitizeArticleCode(rawPlu?: string | null, descripcion?: string | null, lineIdx = 1): string {
  const cleanPlu = String(rawPlu || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\-_.]/g, '');

  if (cleanPlu && cleanPlu !== 'NULL' && cleanPlu !== '0000' && cleanPlu !== '0') {
    return cleanPlu.slice(0, 30);
  }

  // Si PLU es nulo o genérico ('0000'), derivar código consistente a partir de la descripción
  const desc = String(descripcion || '').trim().toUpperCase();
  if (desc) {
    const cap = extractPlanCapacity(desc);
    if (cap && cap !== 'SRV') {
      return cap.slice(0, 30);
    }
    const slug = desc
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20);
    if (slug) return `SRV-${slug}`.slice(0, 30);
  }

  return `SRV-GEN-${String(lineIdx).padStart(2, '0')}`;
}

function mapHkaTaxToProfit(codigoImpuesto?: string, tasaIva?: number): { tipo_imp: string; porc_imp: number } {
  const code = String(codigoImpuesto || '').trim().toUpperCase();
  const rate = Number(tasaIva ?? 0);

  if (code === 'E' || rate === 0) {
    // En Profit Plus 2kDoce: '6' = Exento en Ventas (0%)
    return { tipo_imp: '6', porc_imp: 0 };
  }
  if (code === 'R' || (rate > 0 && rate <= 10)) {
    // '2' = Alícuota Reducida (8%)
    return { tipo_imp: '2', porc_imp: rate || 8 };
  }
  if (code === 'A' || rate >= 25) {
    // '3' = Alícuota Adicional / Suntuario (31%)
    return { tipo_imp: '3', porc_imp: rate || 31 };
  }
  // '1' = Alícuota General (16%)
  return { tipo_imp: '1', porc_imp: rate || 16 };
}

function formatProfitDocNum(
  rawNum: string,
  serieHka: string,
  padDocNum: boolean,
  length: number,
  seriePrefixProfit: string,
  includeHkaSerie: boolean
): string {
  const cleanRaw = String(rawNum || '').trim();
  if (!padDocNum) {
    return (includeHkaSerie && serieHka ? `${serieHka}${cleanRaw}` : cleanRaw).slice(0, 20);
  }
  const prefix = includeHkaSerie && serieHka ? serieHka.trim().toUpperCase() : seriePrefixProfit.trim().toUpperCase();
  const targetDigits = Math.max(1, length - prefix.length);
  if (/^\d+$/.test(cleanRaw)) {
    return `${prefix}${cleanRaw.padStart(targetDigits, '0')}`.slice(0, 20);
  }
  return `${prefix}${cleanRaw}`.slice(0, 20);
}

// ============================================================================
// 1. EXTRACCIÓN COMPLETA DESDE THE FACTORY HKA
// ============================================================================

export async function extractHkaDocuments(
  filters: {
    serie?: string;
    tipoDocumento?: string;
    numeroDocumentoInicio?: string | number;
    numeroDocumentoFin?: string | number;
    fechaInicio?: string;
    fechaFin?: string;
  } = {},
  configOverride?: Partial<HkaConfig>
): Promise<{
  success: boolean;
  mensaje?: string;
  documents: HkaExtractedDocument[];
}> {
  const listRes = await listHkaAssignments(filters, configOverride);
  if (!listRes.success) {
    return {
      success: false,
      mensaje: listRes.mensaje || 'No se pudo consultar ListadoAsignaciones en HKA.',
      documents: []
    };
  }

  const assignments = listRes.asignaciones;
  if (assignments.length === 0) {
    return {
      success: true,
      mensaje: 'No se encontraron documentos emitidos en HKA para los filtros indicados.',
      documents: []
    };
  }

  const results: HkaExtractedDocument[] = [];
  const CONCURRENCY = 5;

  for (let i = 0; i < assignments.length; i += CONCURRENCY) {
    const batch = assignments.slice(i, i + CONCURRENCY);
    const batchDocs = await Promise.all(
      batch.map((asig) => fetchSingleHkaDocumentDetail(asig, configOverride))
    );
    results.push(...batchDocs);
  }

  return {
    success: true,
    mensaje: `${results.length} documento(s) extraídos exitosamente desde The Factory HKA.`,
    documents: results
  };
}

async function fetchSingleHkaDocumentDetail(
  asig: HkaAssignmentItem,
  configOverride?: Partial<HkaConfig>
): Promise<HkaExtractedDocument> {
  const [statusRes, jsonFileRes] = await Promise.all([
    getHkaDocumentStatus(asig.numeroDocumento, asig.tipoDocumento, asig.serie, configOverride),
    downloadHkaFile(asig.tipoDocumento, asig.serie, asig.numeroDocumento, 'json', configOverride)
  ]);

  const docJson = jsonFileRes.decodedJson?.DocumentoElectronico || jsonFileRes.decodedJson?.documentoElectronico || jsonFileRes.decodedJson || {};
  const enc = docJson.Encabezado || docJson.encabezado || {};
  const idDoc = enc.IdentificacionDocumento || enc.identificacionDocumento || {};
  const comp = enc.Comprador || enc.comprador || {};
  const tot = enc.Totales || enc.totales || {};
  const otraMon = enc.OtraMoneda || enc.otraMoneda || tot.OtraMoneda || tot.otraMoneda || null;
  const rawItems: any[] = Array.isArray(docJson.DetallesItems || docJson.detallesItems)
    ? (docJson.DetallesItems || docJson.detallesItems)
    : [];

  const tipoDoc = String(idDoc.TipoDocumento || idDoc.tipoDocumento || asig.tipoDocumento || '01').trim();
  const tipoProfitDoc: 'FACT' | 'N/DB' | 'N/CR' =
    tipoDoc === '03' ? 'N/CR' : tipoDoc === '02' ? 'N/DB' : 'FACT';

  const fechaEmisionRaw = String(idDoc.FechaEmision || idDoc.fechaEmision || asig.fechaAsignacion || '').trim();
  const fechaEmisionIso = parseDmyToIso(fechaEmisionRaw);
  const fechaVencRaw = String(idDoc.FechaVencimiento || idDoc.fechaVencimiento || '').trim();
  const fechaVencimientoIso = fechaVencRaw ? parseDmyToIso(fechaVencRaw) : fechaEmisionIso;
  const horaEmision = String(idDoc.HoraEmision || idDoc.horaEmision || statusRes.estado?.horaAsignacion || '12:00:00 pm').trim();

  const estadoFiscal = String(
    statusRes.estado?.estadoDocumento || statusRes.estatus || 'Enviada'
  ).trim();
  const anulada =
    estadoFiscal.toLowerCase().includes('anulad') || Boolean(statusRes.estado?.fechaAnulacion);

  // Comprador
  const rawTipoId = String(comp.TipoIdentificacion || comp.tipoIdentificacion || 'V')
    .trim()
    .toUpperCase()
    .replace(/[^VJGEP]/g, '') || 'V';
  const rawNumId = String(comp.NumeroIdentificacion || comp.numeroIdentificacion || '')
    .trim()
    .replace(/[^0-9]/g, '');
  const cleanDigits = rawNumId || '00000000';
  const rifFormateado = `${rawTipoId}-${cleanDigits}`.slice(0, 18);
  const coCliSugerido = `${rawTipoId}${cleanDigits}`.slice(0, 16);

  const telefonosArr = comp.Telefono || comp.telefono;
  const telefono = Array.isArray(telefonosArr)
    ? String(telefonosArr[0] || '').trim()
    : String(telefonosArr || '').trim();

  const correosArr = comp.Correo || comp.correo;
  const correo = Array.isArray(correosArr)
    ? String(correosArr[0] || '').trim()
    : String(correosArr || '').trim();

  const formasPagoArr = tot.FormasPago || tot.formasPago;
  const formaPagoDescripcion =
    Array.isArray(formasPagoArr) && formasPagoArr.length > 0
      ? String(formasPagoArr[0].Descripcion || formasPagoArr[0].descripcion || formasPagoArr[0].Forma || 'CONTADO').trim()
      : 'CONTADO';

  const monedaOriginal = String(idDoc.Moneda || idDoc.moneda || 'VES').trim().toUpperCase();
  const rawTipoCambio = otraMon?.TipoCambio || otraMon?.tipoCambio || null;
  const tipoCambioHka = rawTipoCambio ? Number(rawTipoCambio) : null;

  const items: HkaExtractedItem[] = rawItems.map((it, idx) => {
    const lineNum = Number(it.NumeroLinea || it.numeroLinea || idx + 1);
    const rawDesc = String(it.Descripcion || it.descripcion || 'SERVICIO FACTURADO').trim();
    const { cleanDescription, periodoText } = splitDescriptionAndPeriodo(rawDesc);
    const rawPlu = it.CodigoPLU ?? it.codigoPLU ?? '';
    const coArtSugerido = sanitizeArticleCode(rawPlu, cleanDescription, lineNum);
    const indBS = String(it.IndicadorBienoServicio || it.indicadorBienoServicio || '2').trim() === '1' ? '1' : '2';

    const cantidad = Number(it.Cantidad ?? it.cantidad ?? 1) || 1;
    const precioUnitario = Number(it.PrecioUnitario ?? it.precioUnitario ?? 0);
    const descuentoMonto = Number(it.DescuentoMonto ?? it.descuentoMonto ?? 0);
    const precioItem = Number(it.PrecioItem ?? it.precioItem ?? round2(cantidad * precioUnitario - descuentoMonto));
    const codigoImpuesto = String(it.CodigoImpuesto || it.codigoImpuesto || 'G').trim().toUpperCase();
    const tasaIva = Number(it.TasaIVA ?? it.tasaIVA ?? (codigoImpuesto === 'E' ? 0 : 16));
    const valorIva = Number(it.ValorIVA ?? it.valorIVA ?? 0);
    const valorTotalItem = Number(it.ValorTotalItem ?? it.valorTotalItem ?? round2(precioItem + valorIva));

    return {
      numeroLinea: lineNum,
      codigoPLU: String(rawPlu ?? '').trim(),
      coArtSugerido,
      indicadorBienoServicio: indBS,
      descripcion: cleanDescription,
      descripcionOriginal: rawDesc,
      periodoExtraido: periodoText,
      cantidad,
      unidadMedidaHka: String(it.UnidadMedida || it.unidadMedida || 'UND').trim().toUpperCase(),
      precioUnitario,
      descuentoMonto,
      precioItem,
      codigoImpuesto,
      tasaIva,
      valorIva,
      valorTotalItem
    };
  });

  // Consolidar los textos "PERIODO ..." extraídos de los renglones (sin duplicar si varios ítems comparten el mismo período)
  const uniquePeriodos = Array.from(
    new Set(items.map((it) => it.periodoExtraido).filter((p): p is string => Boolean(p)))
  );
  const comentarioExtraido = uniquePeriodos.join(' | ');

  const subtotal = Number(tot.Subtotal ?? tot.subtotal ?? 0);
  const montoGravado = Number(tot.MontoGravadoTotal ?? tot.montoGravadoTotal ?? 0);
  const montoExento = Number(tot.MontoExentoTotal ?? tot.montoExentoTotal ?? 0);
  const totalDescuento = Number(tot.TotalDescuento ?? tot.totalDescuento ?? 0);
  const totalIva = Number(tot.TotalIVA ?? tot.totalIVA ?? 0);
  const totalIgtf = Number(tot.TotalIGTF ?? tot.totalIGTF ?? 0);
  const totalIgtfVes = Number(tot.TotalIGTF_VES ?? tot.totalIGTF_VES ?? 0);
  const montoTotalConIva = Number(tot.MontoTotalConIVA ?? tot.montoTotalConIVA ?? round2(subtotal + totalIva));
  const totalAPagar = Number(tot.TotalAPagar ?? tot.totalAPagar ?? montoTotalConIva);

  return {
    tipoDocumento: tipoDoc,
    tipoProfitDoc,
    serie: asig.serie,
    numeroDocumento: asig.numeroDocumento,
    numeroControl: statusRes.estado?.numeroControl || asig.numeroControl,
    fechaAsignacion: asig.fechaAsignacion,
    fechaEmisionRaw: fechaEmisionRaw || asig.fechaAsignacion,
    fechaEmisionIso,
    horaEmision,
    fechaVencimientoIso: fechaVencimientoIso < fechaEmisionIso ? fechaEmisionIso : fechaVencimientoIso,
    estadoFiscal,
    anulada,
    fechaAnulacion: statusRes.estado?.fechaAnulacion || undefined,
    motivoAnulacion: statusRes.estado?.motivo || undefined,
    urlConsulta: statusRes.estado?.urlConsulta || undefined,
    monedaOriginal,
    tipoCambioHka: tipoCambioHka && !isNaN(tipoCambioHka) ? tipoCambioHka : null,
    tipoDePago: String(idDoc.TipoDePago || idDoc.tipoDePago || '01').trim(),
    formaPagoDescripcion,
    comentarioExtraido,
    numeroFacturaAfectada: idDoc.NumeroFacturaAfectada || idDoc.numeroFacturaAfectada || undefined,
    serieFacturaAfectada: idDoc.SerieFacturaAfectada || idDoc.serieFacturaAfectada || undefined,
    comprador: {
      tipoIdentificacion: rawTipoId,
      numeroIdentificacion: cleanDigits,
      rifFormateado,
      coCliSugerido,
      razonSocial: String(comp.RazonSocial || comp.razonSocial || 'CLIENTE GENERAL').trim(),
      direccion: String(comp.Direccion || comp.direccion || 'VENEZUELA').trim(),
      pais: String(comp.Pais || comp.pais || 'VE').trim().toUpperCase(),
      telefono,
      correo
    },
    totales: {
      nroItems: Number(tot.NroItems ?? tot.nroItems ?? items.length),
      montoGravado,
      montoExento,
      subtotal,
      totalDescuento,
      totalIva,
      totalIgtf,
      totalIgtfVes,
      montoTotalConIva,
      totalAPagar
    },
    items,
    extractionError: !jsonFileRes.success ? jsonFileRes.mensaje : undefined
  };
}

// ============================================================================
// 2. AUDITORÍA CONTRA BASE DE DATOS PROFIT PLUS LOCAL (VÍA AGENTE)
// ============================================================================

export async function loadProfitAuditContext(
  agentClient: AgentClient | null,
  sedeId?: string | null,
  defaults: HkaReplicationOptions = {}
): Promise<ProfitAuditContext> {
  const ctx: ProfitAuditContext = {
    agentConnected: false,
    databaseName: 'ALDANET',
    baseCurrency: 'BS',
    usdCurrencyCode: 'USD',
    serieFactura: {
      co_serie: 'V001-1',
      co_tipo_serie: 'V001',
      longitud: defaults.doc_num_length || 10,
      prefijo: '',
      sufijo: '',
      prox_n: 0
    },
    serieControl: {
      co_serie: 'V002-1',
      co_tipo_serie: 'V002',
      prox_n: 0
    },
    catalogs: {
      sucursal: defaults.default_sucursal || '01',
      almacen: defaults.default_warehouse || '01',
      vendedor: defaults.default_seller || '01',
      condicionPago: defaults.default_cond || '01',
      transporte: defaults.default_tran || '01',
      zona: defaults.default_zone || '004',
      tipoCliente: defaults.default_client_type || 'DET',
      ctaIngrEgr: defaults.default_cta_ingr_egr || 'I-001',
      segmento: defaults.default_segment || '01',
      linea: defaults.default_lin || '09',
      sublinea: defaults.default_subl || '0901',
      categoria: defaults.default_cat || '101001',
      color: defaults.default_color || '01',
      ubicacion: defaults.default_ubicacion || '00001',
      procedencia: defaults.default_proc || '01',
      unidad: defaults.default_unit || 'UNI',
      tipoPrecio: '01',
      pais: 'VE',
      salestax: null
    },
    ratesByDate: [],
    existingClientsByCoCli: new Map(),
    existingClientsByRif: new Map(),
    existingArticlesByCode: new Map(),
    existingArticlesByDesc: new Map(),
    existingInvoicesByDocNum: new Set(),
    existingInvoicesByControl: new Map()
  };

  if (!agentClient) return ctx;

  const qs = sedeId ? `?sede=${encodeURIComponent(sedeId)}` : '';
  const runQuery = async (sqlText: string): Promise<any[]> => {
    const res = await agentClient.request<any[]>(`/query${qs}`, {
      method: 'POST',
      body: JSON.stringify({ query: sqlText })
    });
    if (res.success && Array.isArray(res.data)) return res.data;
    throw new Error(res.message || 'Error ejecutando consulta en Agente');
  };

  try {
    const [
      metaRows,
      serieRows,
      tasaRows,
      cliRows,
      artRows,
      factRows
    ] = await Promise.all([
      runQuery(`
        SELECT
          DB_NAME() AS db_name,
          (SELECT TOP 1 RTRIM(g_moneda) FROM par_emp) AS base_moneda,
          (SELECT TOP 1 RTRIM(co_mone) FROM saMoneda WHERE RTRIM(co_mone) IN ('USD','US$','DOL') OR mone_des LIKE '%Dolar%') AS usd_moneda,
          (SELECT TOP 1 RTRIM(co_sucur) FROM saSucursal ORDER BY CASE WHEN RTRIM(co_sucur) = '${ctx.catalogs.sucursal}' THEN 0 WHEN RTRIM(co_sucur) = '01' THEN 1 ELSE 2 END) AS sucursal,
          (SELECT TOP 1 RTRIM(co_alma) FROM saAlmacen ORDER BY CASE WHEN RTRIM(co_alma) = '${ctx.catalogs.almacen}' THEN 0 WHEN RTRIM(co_alma) = '01' THEN 1 ELSE 2 END) AS almacen,
          (SELECT TOP 1 RTRIM(co_ven) FROM saVendedor WHERE inactivo = 0 ORDER BY CASE WHEN RTRIM(co_ven) = '${ctx.catalogs.vendedor}' THEN 0 WHEN RTRIM(co_ven) = '01' THEN 1 ELSE 2 END) AS vendedor,
          (SELECT TOP 1 RTRIM(co_cond) FROM saCondicionPago ORDER BY CASE WHEN RTRIM(co_cond) = '${ctx.catalogs.condicionPago}' THEN 0 WHEN RTRIM(co_cond) = '01' THEN 1 ELSE 2 END) AS cond_pago,
          (SELECT TOP 1 RTRIM(co_tran) FROM saTransporte ORDER BY CASE WHEN RTRIM(co_tran) = '${ctx.catalogs.transporte}' THEN 0 WHEN RTRIM(co_tran) = '01' THEN 1 ELSE 2 END) AS transporte,
          (SELECT TOP 1 RTRIM(co_zon) FROM saZona ORDER BY CASE WHEN RTRIM(co_zon) = '${ctx.catalogs.zona}' THEN 0 WHEN RTRIM(co_zon) = '004' THEN 1 WHEN RTRIM(co_zon) = '01' THEN 2 ELSE 3 END) AS zona,
          (SELECT TOP 1 RTRIM(tip_cli) FROM saTipoCliente ORDER BY CASE WHEN RTRIM(tip_cli) = '${ctx.catalogs.tipoCliente}' THEN 0 WHEN RTRIM(tip_cli) = 'DET' THEN 1 WHEN RTRIM(tip_cli) = '01' THEN 2 ELSE 3 END) AS tipo_cli,
          (SELECT TOP 1 RTRIM(co_cta_ingr_egr) FROM saCuentaIngEgr ORDER BY CASE WHEN RTRIM(co_cta_ingr_egr) = '${ctx.catalogs.ctaIngrEgr}' THEN 0 WHEN RTRIM(co_cta_ingr_egr) = 'I-001' THEN 1 ELSE 2 END) AS cta_ie,
          (SELECT TOP 1 RTRIM(co_seg) FROM saSegmento ORDER BY CASE WHEN RTRIM(co_seg) = '${ctx.catalogs.segmento}' THEN 0 WHEN RTRIM(co_seg) = '01' THEN 1 ELSE 2 END) AS segmento,
          (SELECT TOP 1 RTRIM(co_lin) FROM saLineaArticulo ORDER BY CASE WHEN RTRIM(co_lin) = '${ctx.catalogs.linea}' THEN 0 WHEN RTRIM(co_lin) = '09' THEN 1 WHEN RTRIM(co_lin) = '01' THEN 2 ELSE 3 END) AS linea,
          (SELECT TOP 1 RTRIM(co_subl) FROM saSubLinea ORDER BY CASE WHEN RTRIM(co_subl) = '${ctx.catalogs.sublinea}' THEN 0 WHEN RTRIM(co_subl) = '0901' THEN 1 WHEN RTRIM(co_subl) = '0101' THEN 2 ELSE 3 END) AS sublinea,
          (SELECT TOP 1 RTRIM(co_cat) FROM saCatArticulo ORDER BY CASE WHEN RTRIM(co_cat) = '${ctx.catalogs.categoria}' THEN 0 WHEN RTRIM(co_cat) = '101001' THEN 1 ELSE 2 END) AS categoria,
          (SELECT TOP 1 RTRIM(co_color) FROM saColor ORDER BY CASE WHEN RTRIM(co_color) = '01' THEN 0 ELSE 1 END) AS color,
          (SELECT TOP 1 RTRIM(co_ubicacion) FROM saUbicacion ORDER BY CASE WHEN RTRIM(co_ubicacion) = '00001' THEN 0 ELSE 1 END) AS ubicacion,
          (SELECT TOP 1 RTRIM(cod_proc) FROM saProcedencia ORDER BY CASE WHEN RTRIM(cod_proc) = '01' THEN 0 ELSE 1 END) AS procedencia,
          (SELECT TOP 1 RTRIM(co_uni) FROM saUnidad ORDER BY CASE WHEN RTRIM(co_uni) = 'UNI' THEN 0 WHEN RTRIM(co_uni) = 'UND' THEN 1 WHEN RTRIM(co_uni) = '01' THEN 2 ELSE 3 END) AS unidad,
          (SELECT TOP 1 RTRIM(co_precio) FROM saTipoPrecio ORDER BY CASE WHEN RTRIM(co_precio) = '01' THEN 0 WHEN RTRIM(co_precio) = '1' THEN 1 ELSE 2 END, co_precio) AS tipo_precio,
          (SELECT TOP 1 RTRIM(co_pais) FROM saPais ORDER BY CASE WHEN RTRIM(co_pais) IN ('VE','VEN') THEN 0 ELSE 1 END) AS pais,
          (SELECT TOP 1 RTRIM(tax_id) FROM saTax) AS salestax
      `),
      runQuery(`
        SELECT
          RTRIM(c.co_consecutivo) AS co_consecutivo,
          RTRIM(s.co_serie) AS co_serie,
          RTRIM(s.co_tipo_serie) AS co_tipo_serie,
          ISNULL(s.prox_n, 0) AS prox_n,
          ISNULL(st.longitud, 10) AS longitud,
          RTRIM(ISNULL(st.prefijo, '')) AS prefijo,
          RTRIM(ISNULL(st.sufijo, '')) AS sufijo
        FROM saConsecutivo c
        INNER JOIN saSerie s ON c.co_serie = s.co_serie
        INNER JOIN saSerieTipo st ON s.co_tipo_serie = st.co_tipo_serie
        WHERE RTRIM(c.co_consecutivo) IN ('DOC_VEN_FACT', 'FACT_VTA_N_CON')
      `),
      runQuery(`
        SELECT CONVERT(VARCHAR(10), fecha, 23) AS fecha_iso, tasa_v
        FROM saTasa
        WHERE RTRIM(co_mone) IN ('USD', 'US$', 'DOL')
        ORDER BY fecha ASC
      `),
      runQuery(`
        SELECT RTRIM(co_cli) AS co_cli, RTRIM(ISNULL(rif, '')) AS rif, RTRIM(cli_des) AS cli_des
        FROM saCliente
      `),
      runQuery(`
        SELECT
          RTRIM(a.co_art) AS co_art,
          RTRIM(a.art_des) AS art_des,
          RTRIM(a.tipo) AS tipo,
          RTRIM(a.tipo_imp) AS tipo_imp,
          ISNULL((SELECT TOP 1 RTRIM(u.co_uni) FROM saArtUnidad u WHERE u.co_art = a.co_art ORDER BY u.uni_principal DESC), 'UNI') AS co_uni,
          CASE WHEN EXISTS (
            SELECT 1 FROM saArtPrecio ap
            WHERE ap.co_art = a.co_art AND ap.Inactivo = 0 AND ap.monto > 0
          ) THEN 1 ELSE 0 END AS tiene_precio
        FROM saArticulo a
      `),
      runQuery(`
        SELECT LTRIM(RTRIM(doc_num)) AS doc_num, LTRIM(RTRIM(ISNULL(n_control, ''))) AS n_control
        FROM saFacturaVenta
        UNION
        SELECT LTRIM(RTRIM(nro_doc)) AS doc_num, LTRIM(RTRIM(ISNULL(n_control, ''))) AS n_control
        FROM saDocumentoVenta
        WHERE RTRIM(co_tipo_doc) IN ('FACT', 'N/CR', 'N/DB')
      `)
    ]);

    ctx.agentConnected = true;

    if (metaRows[0]) {
      const m = metaRows[0];
      ctx.databaseName = m.db_name || ctx.databaseName;
      ctx.baseCurrency = m.base_moneda || 'BS';
      ctx.usdCurrencyCode = m.usd_moneda || 'USD';
      ctx.catalogs = {
        sucursal: m.sucursal || ctx.catalogs.sucursal,
        almacen: m.almacen || ctx.catalogs.almacen,
        vendedor: m.vendedor || ctx.catalogs.vendedor,
        condicionPago: m.cond_pago || ctx.catalogs.condicionPago,
        transporte: m.transporte || ctx.catalogs.transporte,
        zona: m.zona || ctx.catalogs.zona,
        tipoCliente: m.tipo_cli || ctx.catalogs.tipoCliente,
        ctaIngrEgr: m.cta_ie || ctx.catalogs.ctaIngrEgr,
        segmento: m.segmento || ctx.catalogs.segmento,
        linea: m.linea || ctx.catalogs.linea,
        sublinea: m.sublinea || ctx.catalogs.sublinea,
        categoria: m.categoria || ctx.catalogs.categoria,
        color: m.color || ctx.catalogs.color,
        ubicacion: m.ubicacion || ctx.catalogs.ubicacion,
        procedencia: m.procedencia || ctx.catalogs.procedencia,
        unidad: m.unidad || ctx.catalogs.unidad,
        tipoPrecio: m.tipo_precio || '01',
        pais: m.pais || 'VE',
        salestax: m.salestax ? String(m.salestax).trim() : null
      };
    }

    for (const sr of serieRows) {
      if (sr.co_consecutivo === 'DOC_VEN_FACT') {
        ctx.serieFactura = {
          co_serie: sr.co_serie,
          co_tipo_serie: sr.co_tipo_serie,
          longitud: Number(sr.longitud) || 10,
          prefijo: sr.prefijo || '',
          sufijo: sr.sufijo || '',
          prox_n: Number(sr.prox_n) || 0
        };
      } else if (sr.co_consecutivo === 'FACT_VTA_N_CON') {
        ctx.serieControl = {
          co_serie: sr.co_serie,
          co_tipo_serie: sr.co_tipo_serie,
          prox_n: Number(sr.prox_n) || 0
        };
      }
    }

    // Consolidar tasas BCV por fecha (última tasa registrada de cada día)
    const rateMap = new Map<string, number>();
    for (const tr of tasaRows) {
      if (tr.fecha_iso && Number(tr.tasa_v) > 0) {
        rateMap.set(tr.fecha_iso, Number(tr.tasa_v));
      }
    }
    ctx.ratesByDate = Array.from(rateMap.entries())
      .map(([fechaIso, tasa_v]) => ({ fechaIso, tasa_v }))
      .sort((a, b) => a.fechaIso.localeCompare(b.fechaIso));

    for (const c of cliRows) {
      const cleanCo = String(c.co_cli || '').trim().toUpperCase();
      const cleanRif = normalizeRifKey(c.rif);
      const entry = { co_cli: cleanCo, rif: String(c.rif || '').trim(), cli_des: String(c.cli_des || '').trim() };
      if (cleanCo) ctx.existingClientsByCoCli.set(cleanCo, entry);
      if (cleanRif) ctx.existingClientsByRif.set(cleanRif, entry);
    }

    for (const a of artRows) {
      const cleanArt = String(a.co_art || '').trim().toUpperCase();
      const cleanDesc = String(a.art_des || '').trim().toUpperCase();
      const entry = {
        co_art: cleanArt,
        art_des: String(a.art_des || '').trim(),
        tipo: String(a.tipo || 'S').trim(),
        tipo_imp: String(a.tipo_imp || '1').trim(),
        co_uni: String(a.co_uni || ctx.catalogs.unidad || 'UNI').trim(),
        has_price: Number(a.tiene_precio) === 1
      };
      if (cleanArt) ctx.existingArticlesByCode.set(cleanArt, entry);
      if (cleanDesc && !ctx.existingArticlesByDesc.has(cleanDesc)) {
        ctx.existingArticlesByDesc.set(cleanDesc, entry);
      }
    }

    for (const f of factRows) {
      const dn = String(f.doc_num || '').trim().toUpperCase();
      const nc = String(f.n_control || '').trim().toUpperCase();
      if (dn) ctx.existingInvoicesByDocNum.add(dn);
      if (nc) ctx.existingInvoicesByControl.set(nc, dn);
    }
  } catch (err: any) {
    console.warn('[HKA-REPLICATION] No se pudo cargar auditoría en vivo desde el Agente SQL:', err.message);
  }

  return ctx;
}

/**
 * Resuelve la tasa BCV histórica en saTasa para una fecha YYYY-MM-DD (la vigente en o antes de la fecha).
 * Si la tasa anterior proviene de una semilla antigua de plantilla (>180 días atrás) y existe una tasa moderna más cercana, usa la más cercana.
 */
export function resolveHistoricalBcvRate(fechaIso: string, ratesByDate: Array<{ fechaIso: string; tasa_v: number }>): number {
  if (!ratesByDate.length) return 1;
  const targetMs = Date.parse(`${fechaIso}T00:00:00Z`);
  let chosen = ratesByDate[0];
  let nextAfter: { fechaIso: string; tasa_v: number } | null = null;
  for (const r of ratesByDate) {
    if (r.fechaIso <= fechaIso) {
      chosen = r;
    } else {
      nextAfter = r;
      break;
    }
  }
  if (nextAfter && !isNaN(targetMs)) {
    const chosenMs = Date.parse(`${chosen.fechaIso}T00:00:00Z`);
    const nextMs = Date.parse(`${nextAfter.fechaIso}T00:00:00Z`);
    const daysSinceChosen = (targetMs - chosenMs) / 86400000;
    const daysUntilNext = (nextMs - targetMs) / 86400000;
    if (daysSinceChosen > 180 && daysUntilNext >= 0 && daysUntilNext < daysSinceChosen) {
      return nextAfter.tasa_v > 0 ? nextAfter.tasa_v : 1;
    }
  }
  return chosen.tasa_v > 0 ? chosen.tasa_v : 1;
}

// ============================================================================
// 3. CONSTRUCCIÓN DEL PLAN DE REPLICACIÓN HACIA PROFIT PLUS
// ============================================================================

export function buildHkaReplicationPlan(
  hkaDocs: HkaExtractedDocument[],
  ctx: ProfitAuditContext,
  hkaMeta: { environment: 'demo' | 'production'; baseUrl: string },
  options: HkaReplicationOptions = {}
): HkaReplicationPlan {
  const opts = {
    pad_doc_num: options.pad_doc_num ?? true,
    doc_num_length: options.doc_num_length ?? (ctx.serieFactura.longitud || 10),
    include_serie_prefix: options.include_serie_prefix ?? false,
    moneda_profit: options.moneda_profit ?? 'BS',
    moneda_precio_articulo: options.moneda_precio_articulo ?? 'USD',
    saldo_mode: options.saldo_mode ?? 'pendiente',
    skip_zero_amount: options.skip_zero_amount ?? true,
    include_annulled: options.include_annulled ?? true,
    force_service_articles: options.force_service_articles ?? true
  };

  const clientsMap = new Map<string, PlannedProfitClient>();
  const articlesMap = new Map<string, PlannedProfitArticle>();
  const plannedInvoices: PlannedProfitInvoice[] = [];
  const globalWarnings: Array<{ doc_num: string; n_control: string; severity: 'warning' | 'error'; message: string }> = [];

  let maxDocNumeric = 0;

  for (const doc of hkaDocs) {
    const docWarnings: string[] = [];
    const numNumeric = Number(doc.numeroDocumento);
    if (!isNaN(numNumeric) && numNumeric > maxDocNumeric) {
      maxDocNumeric = numNumeric;
    }

    const docNumProfit = formatProfitDocNum(
      doc.numeroDocumento,
      doc.serie,
      opts.pad_doc_num,
      opts.doc_num_length,
      ctx.serieFactura.prefijo,
      opts.include_serie_prefix
    );

    const nroDocAfectado = doc.numeroFacturaAfectada
      ? formatProfitDocNum(
          doc.numeroFacturaAfectada,
          doc.serieFacturaAfectada || doc.serie,
          opts.pad_doc_num,
          opts.doc_num_length,
          ctx.serieFactura.prefijo,
          opts.include_serie_prefix
        )
      : null;

    if (doc.extractionError) {
      const msg = `No se pudo descargar el JSON completo desde HKA: ${doc.extractionError}`;
      docWarnings.push(msg);
      globalWarnings.push({ doc_num: docNumProfit, n_control: doc.numeroControl, severity: 'error', message: msg });
    }

    // 1. Resolver Cliente en Profit Plus (por RIF normalizado o por co_cli)
    const rifKey = normalizeRifKey(doc.comprador.rifFormateado);
    const existingByRif = rifKey ? ctx.existingClientsByRif.get(rifKey) : undefined;
    const existingByCoCli = ctx.existingClientsByCoCli.get(doc.comprador.coCliSugerido.toUpperCase());
    const matchedClient = existingByRif || existingByCoCli;

    const finalCoCli = matchedClient ? matchedClient.co_cli : doc.comprador.coCliSugerido.toUpperCase();
    const isJuridico = doc.comprador.tipoIdentificacion === 'J' || doc.comprador.tipoIdentificacion === 'G';
    const tipoPer = isJuridico ? '3' : doc.comprador.tipoIdentificacion === 'E' || doc.comprador.tipoIdentificacion === 'P' ? '2' : '1';

    if (doc.comprador.numeroIdentificacion === '00000000' || doc.comprador.numeroIdentificacion.length < 5) {
      const w = `RIF/Cédula inusual en comprador (${doc.comprador.rifFormateado} - ${doc.comprador.razonSocial}). Verifique si es un documento de prueba.`;
      docWarnings.push(w);
      globalWarnings.push({ doc_num: docNumProfit, n_control: doc.numeroControl, severity: 'warning', message: w });
    }

    if (!clientsMap.has(finalCoCli)) {
      clientsMap.set(finalCoCli, {
        co_cli: finalCoCli,
        cli_des: (matchedClient?.cli_des || doc.comprador.razonSocial || 'CLIENTE GENERAL').slice(0, 100),
        rif: matchedClient?.rif || doc.comprador.rifFormateado,
        direc1: (doc.comprador.direccion || 'VENEZUELA').slice(0, 250),
        telefonos: (doc.comprador.telefono || '').slice(0, 60),
        email: (doc.comprador.correo || '').slice(0, 60),
        co_zon: ctx.catalogs.zona,
        tip_cli: ctx.catalogs.tipoCliente,
        co_cta_ingr_egr: ctx.catalogs.ctaIngrEgr,
        co_seg: ctx.catalogs.segmento,
        co_ven: ctx.catalogs.vendedor,
        co_cond: ctx.catalogs.condicionPago,
        co_mone: opts.moneda_profit === 'USD' ? ctx.usdCurrencyCode : ctx.baseCurrency,
        tipo_per: tipoPer,
        juridico: isJuridico,
        contribuyente: true,
        exists_in_profit: Boolean(matchedClient),
        matched_by: existingByRif ? 'rif' : existingByCoCli ? 'co_cli' : 'new',
        source_invoices: [docNumProfit]
      });
    } else {
      clientsMap.get(finalCoCli)!.source_invoices.push(docNumProfit);
    }

    // 2. Resolver Tasa de Cambio BCV y Moneda
    const bcvRate = resolveHistoricalBcvRate(doc.fechaEmisionIso, ctx.ratesByDate);
    const isOriginallyUsd = doc.monedaOriginal === 'USD' || doc.monedaOriginal === 'US$';
    const effectiveUsdRate = (doc.tipoCambioHka && doc.tipoCambioHka > 1) ? doc.tipoCambioHka : bcvRate;

    const coMoneProfit =
      isOriginallyUsd || opts.moneda_profit === 'USD' ? ctx.usdCurrencyCode : ctx.baseCurrency;
    const tasaProfit = coMoneProfit === ctx.baseCurrency ? 1 : effectiveUsdRate;

    // Factor para llevar montos del documento HKA a Bolívares base de Profit Plus (g_moneda = 'BS')
    const toBsFactor = isOriginallyUsd ? effectiveUsdRate : 1;

    // 3. Resolver Renglones y Artículos
    const plannedRenglones: PlannedProfitRenglon[] = [];

    for (let idx = 0; idx < doc.items.length; idx++) {
      const it = doc.items[idx];
      const existingArtByCode = ctx.existingArticlesByCode.get(it.coArtSugerido.toUpperCase());
      const existingArtByDesc =
        ctx.existingArticlesByDesc.get(it.descripcion.trim().toUpperCase()) ||
        (it.descripcionOriginal
          ? ctx.existingArticlesByDesc.get(it.descripcionOriginal.trim().toUpperCase())
          : undefined);
      const matchedArt = existingArtByCode || existingArtByDesc;

      const finalCoArt = matchedArt ? matchedArt.co_art : it.coArtSugerido.toUpperCase();
      const taxInfo = mapHkaTaxToProfit(it.codigoImpuesto, it.tasaIva);
      const tipoArt: 'S' | 'V' = matchedArt
        ? (matchedArt.tipo === 'V' ? 'V' : 'S')
        : opts.force_service_articles
          ? 'S'
          : it.indicadorBienoServicio === '1'
            ? 'V'
            : 'S';
      const coUni = matchedArt ? matchedArt.co_uni : ctx.catalogs.unidad;

      let precVtaBs = round5(it.precioUnitario * toBsFactor);
      let montoDescBs = round5(it.descuentoMonto * toBsFactor);
      let porcDesc: string | null = null;
      const rengNetoBs = round2(it.precioItem * toBsFactor);
      const montoImpBs = round2(it.valorIva * toBsFactor);

      // Protección contra CK_saFacturaVentaReng_Prec_Vta ([prec_vta] > 0)
      if (precVtaBs <= 0) {
        const w = `Ítem #${idx + 1} (${finalCoArt}) tiene PrecioUnitario = 0.00 en HKA (incompatible con restricción CK_saFacturaVentaReng_Prec_Vta > 0 de Profit Plus).`;
        docWarnings.push(w);
        globalWarnings.push({ doc_num: docNumProfit, n_control: doc.numeroControl, severity: 'warning', message: w });
        if (!opts.skip_zero_amount) {
          // Representar bonificación 100% válida para Profit Plus
          precVtaBs = 0.01;
          porcDesc = '100';
          montoDescBs = round5(0.01 * it.cantidad);
        }
      } else if (montoDescBs > 0) {
        const pct = round2((montoDescBs / (precVtaBs * it.cantidad)) * 100);
        porcDesc = String(pct);
      }

      const precVtaUsd = effectiveUsdRate > 0 ? round5(precVtaBs / effectiveUsdRate) : precVtaBs;
      const useUsdPrice = opts.moneda_precio_articulo === 'USD';
      const coMonePrecio = useUsdPrice ? ctx.usdCurrencyCode : ctx.baseCurrency;
      const hasValidPriceSample = !doc.anulada && Number(it.precioUnitario) > 0 && precVtaBs > 0;
      const candidateMonto = useUsdPrice ? precVtaUsd : precVtaBs;

      if (!articlesMap.has(finalCoArt)) {
        const hasPriceInProfit = Boolean(matchedArt?.has_price);
        const initialMonto = hasValidPriceSample ? candidateMonto : 0;
        articlesMap.set(finalCoArt, {
          co_art: finalCoArt,
          art_des: (matchedArt?.art_des || it.descripcion || finalCoArt).slice(0, 120),
          tipo: tipoArt,
          tipo_imp: matchedArt?.tipo_imp || taxInfo.tipo_imp,
          porc_imp: taxInfo.porc_imp,
          co_lin: ctx.catalogs.linea,
          co_subl: ctx.catalogs.sublinea,
          co_cat: ctx.catalogs.categoria,
          co_color: ctx.catalogs.color,
          co_ubicacion: ctx.catalogs.ubicacion,
          cod_proc: ctx.catalogs.procedencia,
          co_uni: coUni,
          exists_in_profit: Boolean(matchedArt),
          has_price_in_profit: hasPriceInProfit,
          needs_price_sync: (!matchedArt || !hasPriceInProfit) && initialMonto > 0,
          matched_by: existingArtByCode ? 'co_art' : existingArtByDesc ? 'art_des' : 'new',
          co_precio: ctx.catalogs.tipoPrecio || '01',
          co_mone_precio: coMonePrecio,
          precio_om: useUsdPrice,
          monto_precio_asignar: initialMonto,
          latest_price_bs: hasValidPriceSample ? precVtaBs : 0,
          latest_price_usd: hasValidPriceSample ? precVtaUsd : 0,
          latest_price_date: hasValidPriceSample ? doc.fechaEmisionIso : '',
          latest_price_doc: hasValidPriceSample ? docNumProfit : '',
          sample_price_bs: precVtaBs,
          source_invoices: [docNumProfit]
        });
      } else {
        const artEntry = articlesMap.get(finalCoArt)!;
        if (!artEntry.source_invoices.includes(docNumProfit)) {
          artEntry.source_invoices.push(docNumProfit);
        }
        // Siempre conservar el precio de la factura activa MÁS RECIENTE para Precio 01 en saArtPrecio
        if (hasValidPriceSample) {
          const prevNum = Number(String(artEntry.latest_price_doc).replace(/\D/g, '')) || 0;
          const currNum = Number(doc.numeroDocumento) || 0;
          const isNewer =
            !artEntry.latest_price_date ||
            doc.fechaEmisionIso > artEntry.latest_price_date ||
            (doc.fechaEmisionIso === artEntry.latest_price_date && currNum >= prevNum);
          if (isNewer) {
            artEntry.latest_price_bs = precVtaBs;
            artEntry.latest_price_usd = precVtaUsd;
            artEntry.latest_price_date = doc.fechaEmisionIso;
            artEntry.latest_price_doc = docNumProfit;
            artEntry.monto_precio_asignar = candidateMonto;
            artEntry.sample_price_bs = precVtaBs;
            artEntry.needs_price_sync =
              (!artEntry.exists_in_profit || !artEntry.has_price_in_profit) && candidateMonto > 0;
          }
        }
      }

      plannedRenglones.push({
        reng_num: idx + 1,
        co_art: finalCoArt,
        des_art: (
          it.descripcion ||
          (matchedArt?.art_des ? splitDescriptionAndPeriodo(matchedArt.art_des).cleanDescription : '') ||
          finalCoArt
        ).slice(0, 120),
        des_art_original_hka: it.descripcionOriginal || it.descripcion,
        periodo_extraido: it.periodoExtraido,
        tipo_art: tipoArt,
        co_uni: coUni,
        co_alma: ctx.catalogs.almacen,
        co_precio: '01',
        tipo_imp: taxInfo.tipo_imp,
        porc_imp: taxInfo.porc_imp,
        cantidad: it.cantidad,
        prec_vta_bs: precVtaBs,
        prec_vta_usd: precVtaUsd,
        porc_desc: porcDesc,
        monto_desc_bs: montoDescBs,
        reng_neto_bs: rengNetoBs,
        monto_imp_bs: montoImpBs,
        total_renglon_bs: round2(rengNetoBs + montoImpBs)
      });
    }

    // 4. Totales de cabecera en Bs
    const montoGravadoBs = round2(doc.totales.montoGravado * toBsFactor);
    const montoExentoBs = round2(doc.totales.montoExento * toBsFactor);
    const totalBrutoBs = round2(doc.totales.subtotal * toBsFactor);
    const montoDescGlobBs = round2(doc.totales.totalDescuento * toBsFactor);
    const montoImpBs = round2(doc.totales.totalIva * toBsFactor);
    const igtfBs = doc.totales.totalIgtfVes > 0
      ? round2(doc.totales.totalIgtfVes)
      : round2(doc.totales.totalIgtf * toBsFactor);
    const igtfBaseBs = igtfBs > 0 ? round2(igtfBs / 0.03) : 0;
    const totalNetoBs = round2(totalBrutoBs + montoImpBs + igtfBs);
    const saldoBs = doc.anulada || opts.saldo_mode === 'cero' ? 0 : totalNetoBs;
    const equivalenteTotalUsd = effectiveUsdRate > 0 ? round2(totalNetoBs / effectiveUsdRate) : totalNetoBs;

    // 5. Verificar si ya existe en Profit Plus
    const existsByDoc =
      ctx.existingInvoicesByDocNum.has(docNumProfit.toUpperCase()) ||
      ctx.existingInvoicesByDocNum.has(doc.numeroDocumento.trim().toUpperCase());
    const existingControlOwner = doc.numeroControl
      ? ctx.existingInvoicesByControl.get(doc.numeroControl.trim().toUpperCase())
      : undefined;
    const existsInProfit = Boolean(existsByDoc || existingControlOwner);

    let existingReason: string | undefined;
    if (existsByDoc) existingReason = `doc_num ${docNumProfit} ya registrado en Profit Plus`;
    else if (existingControlOwner) existingReason = `n_control ${doc.numeroControl} ya asignado a doc ${existingControlOwner}`;

    const hasZeroPriceLine = doc.items.length === 0 || doc.items.some((it) => Number(it.precioUnitario) <= 0);

    let action: PlannedProfitInvoice['action'] = 'CREATE';
    if (doc.extractionError || plannedRenglones.length === 0) {
      action = 'SKIP_ERROR';
    } else if (existsInProfit) {
      action = 'SKIP_EXISTING';
    } else if (doc.anulada && !opts.include_annulled) {
      action = 'SKIP_ANNULLED';
    } else if ((totalNetoBs <= 0 || hasZeroPriceLine) && opts.skip_zero_amount) {
      action = 'SKIP_ZERO_AMOUNT';
    }

    plannedInvoices.push({
      hka_numero_documento: doc.numeroDocumento,
      hka_serie: doc.serie,
      hka_tipo_documento: doc.tipoDocumento,
      tipo_doc_profit: doc.tipoProfitDoc,
      doc_num_profit: docNumProfit,
      n_control: doc.numeroControl,
      nro_doc_afectado: nroDocAfectado,
      estado_hka: doc.estadoFiscal,
      anulado: doc.anulada,
      url_consulta: doc.urlConsulta,
      comentario_factura: doc.comentarioExtraido || '',
      impresa: true,
      impfis: null,
      impfisfac: null,
      imp_nro_z: null,
      fec_emis_iso: doc.fechaEmisionIso,
      hora_emis: doc.horaEmision,
      fec_venc_iso: doc.fechaVencimientoIso,
      fec_reg_iso: doc.fechaEmisionIso,
      co_cli: finalCoCli,
      rif: clientsMap.get(finalCoCli)?.rif || doc.comprador.rifFormateado,
      cli_des: clientsMap.get(finalCoCli)?.cli_des || doc.comprador.razonSocial,
      contribuyente: true,
      moneda_original_hka: doc.monedaOriginal,
      co_mone_profit: coMoneProfit,
      tasa_profit: tasaProfit,
      tasa_bcv_referencia: effectiveUsdRate,
      monto_gravado_bs: montoGravadoBs,
      monto_exento_bs: montoExentoBs,
      total_bruto_bs: totalBrutoBs,
      monto_desc_glob_bs: montoDescGlobBs,
      monto_imp_bs: montoImpBs,
      igtf_bs: igtfBs,
      igtf_base_bs: igtfBaseBs,
      total_neto_bs: totalNetoBs,
      saldo_bs: saldoBs,
      equivalente_total_usd: equivalenteTotalUsd,
      co_sucu: ctx.catalogs.sucursal,
      co_ven: ctx.catalogs.vendedor,
      co_cond: ctx.catalogs.condicionPago,
      co_tran: ctx.catalogs.transporte,
      forma_pago_hka: doc.formaPagoDescripcion,
      renglones: plannedRenglones,
      exists_in_profit: existsInProfit,
      existing_match_reason: existingReason,
      action,
      warnings: docWarnings
    });
  }

  // Filtrar clientes/artículos que realmente pertenecen a facturas activas o mostrar todos en auditoría
  const allClients = Array.from(clientsMap.values());
  const allArticles = Array.from(articlesMap.values());
  const toCreateInvoices = plannedInvoices.filter((i) => i.action === 'CREATE');

  const controls = plannedInvoices.map((i) => i.n_control).filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    hkaEnvironment: hkaMeta.environment,
    hkaBaseUrl: hkaMeta.baseUrl,
    agentConnected: ctx.agentConnected,
    databaseName: ctx.databaseName,
    optionsUsed: opts,
    summary: {
      totalHkaDocuments: plannedInvoices.length,
      invoicesToCreate: toCreateInvoices.length,
      invoicesAlreadyInProfit: plannedInvoices.filter((i) => i.action === 'SKIP_EXISTING').length,
      invoicesSkippedZeroOrError: plannedInvoices.filter(
        (i) => i.action === 'SKIP_ZERO_AMOUNT' || i.action === 'SKIP_ERROR' || i.action === 'SKIP_ANNULLED'
      ).length,
      annulledInvoicesCount: plannedInvoices.filter((i) => i.anulado).length,
      totalClientsReferenced: allClients.length,
      clientsToCreate: allClients.filter((c) => !c.exists_in_profit).length,
      clientsExisting: allClients.filter((c) => c.exists_in_profit).length,
      totalArticlesReferenced: allArticles.length,
      articlesToCreate: allArticles.filter((a) => !a.exists_in_profit).length,
      articlesExisting: allArticles.filter((a) => a.exists_in_profit).length,
      articlesMissingPrice: allArticles.filter((a) => a.needs_price_sync).length,
      totalNetoBsToReplicate: round2(
        toCreateInvoices.filter((i) => !i.anulado).reduce((acc, i) => acc + i.total_neto_bs, 0)
      ),
      totalIvaBsToReplicate: round2(
        toCreateInvoices.filter((i) => !i.anulado).reduce((acc, i) => acc + i.monto_imp_bs, 0)
      ),
      totalEquivalentUsdToReplicate: round2(
        toCreateInvoices.filter((i) => !i.anulado).reduce((acc, i) => acc + i.equivalente_total_usd, 0)
      ),
      minControlNumber: controls[0] || '',
      maxControlNumber: controls[controls.length - 1] || '',
      maxDocNumeric,
      warningsCount: globalWarnings.length
    },
    clients: allClients,
    articles: allArticles,
    invoices: plannedInvoices,
    warnings: globalWarnings
  };
}

// ============================================================================
// 4. GENERADOR DE SCRIPT T-SQL TRANSACCIONAL E IDEMPOTENTE PARA PROFIT PLUS
// ============================================================================

function sqlStr(val: string | null | undefined, maxLen?: number): string {
  if (val === null || val === undefined) return 'NULL';
  let s = String(val);
  if (maxLen !== undefined) s = s.slice(0, maxLen);
  return `'${s.replace(/'/g, "''")}'`;
}

function sqlDec(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || isNaN(Number(val))) return '0';
  return Number(val).toFixed(decimals);
}

export function generateHkaReplicationSql(plan: HkaReplicationPlan, ctx?: ProfitAuditContext): string {
  const invoicesToRun = plan.invoices.filter((inv) => inv.action === 'CREATE');
  const activeClientCodes = new Set(invoicesToRun.map((i) => i.co_cli));
  const activeArticleCodes = new Set(
    invoicesToRun.flatMap((i) => i.renglones.map((r) => r.co_art))
  );

  // Incluir clientes y artículos requeridos por las facturas a crear + artículos sin precio en saArtPrecio
  const clientsToEnsure = plan.clients.filter((c) => activeClientCodes.has(c.co_cli));
  const articlesToEnsure = plan.articles.filter(
    (a) => activeArticleCodes.has(a.co_art) || (a.needs_price_sync && a.monto_precio_asignar > 0)
  );
  const pricesToSyncCount = articlesToEnsure.filter((a) => a.needs_price_sync && a.monto_precio_asignar > 0).length;

  const lines: string[] = [];
  lines.push(`-- =====================================================================================`);
  lines.push(`-- SCRIPT DE REPLICACIÓN FISCAL: THE FACTORY HKA -> PROFIT PLUS 2kDoce (${plan.databaseName})`);
  lines.push(`-- Generado el: ${plan.generatedAt}`);
  lines.push(`-- Entorno HKA: ${plan.hkaEnvironment.toUpperCase()} (${plan.hkaBaseUrl})`);
  lines.push(`-- Facturas a insertar: ${invoicesToRun.length} (de ${plan.summary.totalHkaDocuments} extraídas)`);
  lines.push(`-- Clientes involucrados: ${clientsToEnsure.length} (${clientsToEnsure.filter((c) => !c.exists_in_profit).length} nuevos)`);
  lines.push(`-- Artículos involucrados: ${articlesToEnsure.length} (${articlesToEnsure.filter((a) => !a.exists_in_profit).length} nuevos, ${pricesToSyncCount} precios saArtPrecio)`);
  lines.push(`-- Total Neto activo a replicar (Bs): ${plan.summary.totalNetoBsToReplicate.toFixed(2)}`);
  lines.push(`-- =====================================================================================`);
  lines.push(``);
  lines.push(`SET NOCOUNT ON;`);
  lines.push(`SET XACT_ABORT ON;`);
  lines.push(``);
  lines.push(`BEGIN TRY`);
  lines.push(`    BEGIN TRANSACTION;`);
  lines.push(``);
  lines.push(`    DECLARE @dtNow SMALLDATETIME = GETDATE();`);
  lines.push(`    DECLARE @sPaisDefault CHAR(6) = ISNULL((SELECT TOP 1 RTRIM(co_pais) FROM dbo.saPais ORDER BY CASE WHEN RTRIM(co_pais) IN ('VE','VEN') THEN 0 ELSE 1 END), 'VE');`);
  lines.push(`    DECLARE @sTaxDefault CHAR(8) = (SELECT TOP 1 RTRIM(tax_id) FROM dbo.saTax);`);
  lines.push(`    DECLARE @sCoPrecio01 CHAR(6) = ISNULL((SELECT TOP 1 RTRIM(co_precio) FROM dbo.saTipoPrecio WHERE RTRIM(co_precio) IN ('01','1') ORDER BY CASE WHEN RTRIM(co_precio) = '01' THEN 0 ELSE 1 END), (SELECT TOP 1 RTRIM(co_precio) FROM dbo.saTipoPrecio ORDER BY co_precio));`);
  lines.push(`    DECLARE @gDocRowguid UNIQUEIDENTIFIER;`);
  lines.push(``);

  // ── SECCIÓN 1: CLIENTES (saCliente vía pInsertarCliente) ──
  lines.push(`    -- =========================================================================`);
  lines.push(`    -- PASO 1: RECREACIÓN IDEMPOTENTE DE CLIENTES FALTANTES (saCliente)`);
  lines.push(`    -- =========================================================================`);
  for (const cli of clientsToEnsure) {
    const disCenXml = `<InformacionContable><Carpeta01><CuentaContable>1.1.05.001</CuentaContable></Carpeta01></InformacionContable>`;
    lines.push(`    IF NOT EXISTS (SELECT 1 FROM dbo.saCliente WHERE LTRIM(RTRIM(co_cli)) = ${sqlStr(cli.co_cli, 16)})`);
    lines.push(`    BEGIN`);
    lines.push(`        EXEC dbo.pInsertarCliente`);
    lines.push(`            @sCo_Cli = ${sqlStr(cli.co_cli, 16)},`);
    lines.push(`            @sLogin = '',`);
    lines.push(`            @sPassword = '',`);
    lines.push(`            @sSalesTax = NULL,`);
    lines.push(`            @sCli_Des = ${sqlStr(cli.cli_des, 100)},`);
    lines.push(`            @sCo_seg = ${sqlStr(cli.co_seg, 6)},`);
    lines.push(`            @sCo_zon = ${sqlStr(cli.co_zon, 6)},`);
    lines.push(`            @sCo_Ven = ${sqlStr(cli.co_ven, 6)},`);
    lines.push(`            @sEstado = '1',`);
    lines.push(`            @bInactivo = 0,`);
    lines.push(`            @bValido = 0,`);
    lines.push(`            @bSinCredito = 0,`);
    lines.push(`            @bLunes = 0, @bMartes = 0, @bMiercoles = 0, @bJueves = 0, @bViernes = 0, @bSabado = 0, @bDomingo = 0,`);
    lines.push(`            @sDirec1 = ${sqlStr(cli.direc1, 250)},`);
    lines.push(`            @sDirec2 = '', @sDir_Ent2 = '', @sHorar_Caja = '', @sFrecu_Vist = '',`);
    lines.push(`            @sTelefonos = ${sqlStr(cli.telefonos, 60)},`);
    lines.push(`            @sFax = '', @sRespons = '',`);
    lines.push(`            @sdFecha_reg = @dtNow,`);
    lines.push(`            @sTip_Cli = ${sqlStr(cli.tip_cli, 6)},`);
    lines.push(`            @sSerialP = '', @iPuntaje = 0, @iId = 0, @deMont_cre = 0,`);
    lines.push(`            @sCo_mone = ${sqlStr(cli.co_mone, 6)},`);
    lines.push(`            @sCond_Pag = ${sqlStr(cli.co_cond, 6)},`);
    lines.push(`            @iPlaz_pag = 0, @deDesc_ppago = 0, @deDesc_Glob = 0,`);
    lines.push(`            @sTipo_Iva = '1', @deIva = 0,`);
    lines.push(`            @sRif = ${sqlStr(cli.rif, 18)},`);
    lines.push(`            @bContrib = ${cli.contribuyente ? 1 : 0},`);
    lines.push(`            @sDis_cen = ${sqlStr(disCenXml)},`);
    lines.push(`            @sNit = '',`);
    lines.push(`            @sEmail = ${sqlStr(cli.email, 60)},`);
    lines.push(`            @sCo_Cta_Ingr_Egr = ${sqlStr(cli.co_cta_ingr_egr, 20)},`);
    lines.push(`            @sComentario = 'Cliente recreado desde facturación HKA',`);
    lines.push(`            @sCampo1 = 'HKA-SYNC', @sCampo2 = '', @sCampo3 = '', @sCampo4 = '',`);
    lines.push(`            @sCampo5 = '', @sCampo6 = '', @sCampo7 = '', @sCampo8 = '',`);
    lines.push(`            @sCo_Us_In = 'PROFIT',`);
    lines.push(`            @sMaquina = 'SYNC2K-HKA',`);
    lines.push(`            @sRevisado = '0',`);
    lines.push(`            @sTrasnfe = '0',`);
    lines.push(`            @sCo_Sucu_In = ${sqlStr(ctx?.catalogs.sucursal || '01', 6)},`);
    lines.push(`            @bJuridico = ${cli.juridico ? 1 : 0},`);
    lines.push(`            @iTipo_Adi = 1,`);
    lines.push(`            @sMatriz = NULL, @sCo_Tab = NULL,`);
    lines.push(`            @sTipo_Per = ${sqlStr(cli.tipo_per, 1)},`);
    lines.push(`            @sCo_pais = @sPaisDefault,`);
    lines.push(`            @sCiudad = '', @sZip = '', @sWebSite = '',`);
    lines.push(`            @bContribu_E = 0, @bRete_Regis_Doc = 0, @dePorc_Esp = 0,`);
    lines.push(`            @sN_cr = NULL, @sN_db = NULL, @sTComp = NULL, @sEmail_alterno = '';`);
    lines.push(`    END;`);
    lines.push(``);
  }

  // ── SECCIÓN 2: ARTÍCULOS, UNIDADES Y PRECIOS DE VENTA (saArticulo + saArtUnidad + saArtPrecio) ──
  lines.push(`    -- =========================================================================`);
  lines.push(`    -- PASO 2: RECREACIÓN IDEMPOTENTE DE ARTÍCULOS, UNIDADES Y PRECIOS (saArticulo / saArtUnidad / saArtPrecio)`);
  lines.push(`    -- =========================================================================`);
  for (const art of articlesToEnsure) {
    lines.push(`    IF NOT EXISTS (SELECT 1 FROM dbo.saUnidad WHERE LTRIM(RTRIM(co_uni)) = ${sqlStr(art.co_uni, 6)})`);
    lines.push(`    BEGIN`);
    lines.push(`        INSERT INTO dbo.saUnidad (co_uni, des_uni, co_us_in, fe_us_in, co_sucu_in, co_us_mo, fe_us_mo, co_sucu_mo, rowguid)`);
    lines.push(`        VALUES (${sqlStr(art.co_uni, 6)}, ${sqlStr(art.co_uni, 60)}, 'PROFIT', GETDATE(), ${sqlStr(ctx?.catalogs.sucursal || '01', 6)}, 'PROFIT', GETDATE(), ${sqlStr(ctx?.catalogs.sucursal || '01', 6)}, NEWID());`);
    lines.push(`    END;`);
    lines.push(``);
    lines.push(`    IF NOT EXISTS (SELECT 1 FROM dbo.saArticulo WHERE LTRIM(RTRIM(co_art)) = ${sqlStr(art.co_art, 30)})`);
    lines.push(`    BEGIN`);
    lines.push(`        EXEC dbo.pInsertarArticulo`);
    lines.push(`            @sCo_Art = ${sqlStr(art.co_art, 30)},`);
    lines.push(`            @sdFecha_Reg = @dtNow,`);
    lines.push(`            @sArt_Des = ${sqlStr(art.art_des, 120)},`);
    lines.push(`            @sTipo = ${sqlStr(art.tipo, 1)},`);
    lines.push(`            @bAnulado = 0,`);
    lines.push(`            @sdFecha_Inac = NULL,`);
    lines.push(`            @sCo_Lin = ${sqlStr(art.co_lin, 6)},`);
    lines.push(`            @sCo_Subl = ${sqlStr(art.co_subl, 6)},`);
    lines.push(`            @sCo_Cat = ${sqlStr(art.co_cat, 6)},`);
    lines.push(`            @sCo_Color = ${sqlStr(art.co_color, 6)},`);
    lines.push(`            @sCo_Ubicacion = ${sqlStr(art.co_ubicacion, 6)},`);
    lines.push(`            @sItem = NULL, @sModelo = '', @sRef = NULL,`);
    lines.push(`            @bGenerico = 0, @bManeja_Serial = 0, @bManeja_Lote = 0, @bManeja_Lote_Venc = 0,`);
    lines.push(`            @deMargen_Min = 0, @deMargen_Max = 0,`);
    lines.push(`            @sTipo_Imp = ${sqlStr(art.tipo_imp, 1)},`);
    lines.push(`            @sTipo_Imp2 = NULL, @sTipo_Imp3 = NULL, @sCo_Reten = NULL,`);
    lines.push(`            @sCod_Proc = ${sqlStr(art.cod_proc, 6)},`);
    lines.push(`            @sGarantia = '',`);
    lines.push(`            @deVolumen = 0, @dePeso = 0, @deStock_Min = 0, @deStock_Max = 0, @deStock_Pedido = 0,`);
    lines.push(`            @iRelac_Unidad = 1,`);
    lines.push(`            @dePunt_Ven = 0, @dePunt_Cli = 0, @deLic_Mon_Ilc = 0, @deLic_Capacidad = 0, @deLic_Grado_Al = 0,`);
    lines.push(`            @sLic_Tipo = NULL, @bPrec_Om = ${art.precio_om ? 1 : 0},`);
    lines.push(`            @sComentario = 'Artículo recreado desde facturación HKA',`);
    lines.push(`            @sTipo_Cos = '1',`);
    lines.push(`            @dePorc_Margen_Minimo = 0, @dePorc_Margen_Maximo = 0, @deMont_Comi = 0, @dePorc_Arancel = 0,`);
    lines.push(`            @sI_Art_Des = NULL, @sDis_Cen = NULL, @sReten_Iva_Tercero = NULL,`);
    lines.push(`            @sCampo1 = 'HKA-SYNC', @sCampo2 = NULL, @sCampo3 = NULL, @sCampo4 = NULL,`);
    lines.push(`            @sCampo5 = NULL, @sCampo6 = NULL, @sCampo7 = NULL, @sCampo8 = NULL,`);
    lines.push(`            @sCo_Us_In = 'PROFIT',`);
    lines.push(`            @sCo_Sucu_In = ${sqlStr(ctx?.catalogs.sucursal || '01', 6)},`);
    lines.push(`            @sMaquina = 'SYNC2K-HKA',`);
    lines.push(`            @sRevisado = NULL, @sTrasnfe = NULL;`);
    lines.push(`    END;`);
    lines.push(``);
    lines.push(`    IF NOT EXISTS (SELECT 1 FROM dbo.saArtUnidad WHERE LTRIM(RTRIM(co_art)) = ${sqlStr(art.co_art, 30)} AND LTRIM(RTRIM(co_uni)) = ${sqlStr(art.co_uni, 6)})`);
    lines.push(`    BEGIN`);
    lines.push(`        INSERT INTO dbo.saArtUnidad (`);
    lines.push(`            co_art, co_uni, relacion, equivalencia, uso_venta, uso_compra,`);
    lines.push(`            uni_principal, uso_principal, uni_secundaria, uso_secundaria, uso_numDecimales, num_decimales,`);
    lines.push(`            co_us_in, co_sucu_in, fe_us_in, co_us_mo, co_sucu_mo, fe_us_mo, rowguid`);
    lines.push(`        ) VALUES (`);
    lines.push(`            ${sqlStr(art.co_art, 30)}, ${sqlStr(art.co_uni, 6)}, 0, 1.00000, 1, 1,`);
    lines.push(`            1, 1, 0, 0, 0, 0,`);
    lines.push(`            'PROFIT', ${sqlStr(ctx?.catalogs.sucursal || '01', 6)}, GETDATE(), 'PROFIT', ${sqlStr(ctx?.catalogs.sucursal || '01', 6)}, GETDATE(), NEWID()`);
    lines.push(`        );`);
    lines.push(`    END;`);
    lines.push(``);
    lines.push(`    -- Asegurar registro en saStockAlmacen para el almacén por defecto`);
    lines.push(`    IF NOT EXISTS (`);
    lines.push(`        SELECT 1 FROM dbo.saStockAlmacen`);
    lines.push(`        WHERE LTRIM(RTRIM(co_art)) = ${sqlStr(art.co_art, 30)}`);
    lines.push(`          AND LTRIM(RTRIM(co_alma)) = ${sqlStr(ctx?.catalogs.almacen || '01', 6)}`);
    lines.push(`          AND tipo = 'ACT'`);
    lines.push(`    )`);
    lines.push(`    BEGIN`);
    lines.push(`        INSERT INTO dbo.saStockAlmacen (co_alma, co_art, tipo, stock, revisado, trasnfe)`);
    lines.push(`        VALUES `);
    lines.push(`            (${sqlStr(ctx?.catalogs.almacen || '01', 6)}, ${sqlStr(art.co_art, 30)}, 'ACT', 0.00000, NULL, NULL),`);
    lines.push(`            (${sqlStr(ctx?.catalogs.almacen || '01', 6)}, ${sqlStr(art.co_art, 30)}, 'COM', 0.00000, NULL, NULL),`);
    lines.push(`            (${sqlStr(ctx?.catalogs.almacen || '01', 6)}, ${sqlStr(art.co_art, 30)}, 'DES', 0.00000, NULL, NULL),`);
    lines.push(`            (${sqlStr(ctx?.catalogs.almacen || '01', 6)}, ${sqlStr(art.co_art, 30)}, 'LLE', 0.00000, NULL, NULL);`);
    lines.push(`    END;`);
    lines.push(``);
    if (art.monto_precio_asignar > 0) {
      lines.push(`    -- Precio 01 en saArtPrecio (co_alma = NULL -> co_alma_calculado = 'TODOS'; ref doc ${art.latest_price_doc || '-'} del ${art.latest_price_date || '-'})`);
      lines.push(`    IF NOT EXISTS (`);
      lines.push(`        SELECT 1 FROM dbo.saArtPrecio`);
      lines.push(`        WHERE LTRIM(RTRIM(co_art)) = ${sqlStr(art.co_art, 30)}`);
      lines.push(`          AND LTRIM(RTRIM(co_precio)) = RTRIM(@sCoPrecio01)`);
      lines.push(`          AND Inactivo = 0`);
      lines.push(`          AND monto > 0`);
      lines.push(`    )`);
      lines.push(`    BEGIN`);
      lines.push(`        UPDATE dbo.saArticulo`);
      lines.push(`        SET prec_om = ${art.precio_om ? 1 : 0}, fe_us_mo = GETDATE(), co_us_mo = 'PROFIT'`);
      lines.push(`        WHERE LTRIM(RTRIM(co_art)) = ${sqlStr(art.co_art, 30)};`);
      lines.push(``);
      lines.push(`        DELETE FROM dbo.saArtPrecio`);
      lines.push(`        WHERE LTRIM(RTRIM(co_art)) = ${sqlStr(art.co_art, 30)} AND LTRIM(RTRIM(co_precio)) = RTRIM(@sCoPrecio01);`);
      lines.push(``);
      lines.push(`        INSERT INTO dbo.saArtPrecio (`);
      lines.push(`            co_art, co_precio, co_alma, desde, hasta,`);
      lines.push(`            monto, montoadi1, montoadi2, montoadi3, montoadi4, montoadi5,`);
      lines.push(`            precioOm, co_mone, Inactivo,`);
      lines.push(`            co_us_in, co_sucu_in, fe_us_in, co_us_mo, co_sucu_mo, fe_us_mo,`);
      lines.push(`            revisado, trasnfe, rowguid`);
      lines.push(`        ) VALUES (`);
      lines.push(`            ${sqlStr(art.co_art, 30)}, @sCoPrecio01, NULL, CAST('20250101' AS SMALLDATETIME), NULL,`);
      lines.push(`            ${sqlDec(art.monto_precio_asignar, 5)}, 0, 0, 0, 0, 0,`);
      lines.push(`            ${art.precio_om ? 1 : 0}, ${sqlStr(art.co_mone_precio, 6)}, 0,`);
      lines.push(`            'PROFIT', ${sqlStr(ctx?.catalogs.sucursal || '01', 6)}, GETDATE(), 'PROFIT', ${sqlStr(ctx?.catalogs.sucursal || '01', 6)}, GETDATE(),`);
      lines.push(`            NULL, NULL, NEWID()`);
      lines.push(`        );`);
      lines.push(`    END;`);
      lines.push(``);
    }
  }

  // ── SECCIÓN 3: FACTURAS, RENGLONES Y DOCUMENTOS DE VENTA ──
  lines.push(`    -- =========================================================================`);
  lines.push(`    -- PASO 3: INSERCIÓN DE FACTURAS, RENGLONES Y DOCUMENTOS DE VENTA (CxC / LIBRO DE VENTAS)`);
  lines.push(`    -- =========================================================================`);

  for (const inv of invoicesToRun) {
    const descrip = `FACT HKA #${inv.hka_numero_documento} CTRL ${inv.n_control}`.slice(0, 60);
    // El campo comentario de saFacturaVenta lleva exclusivamente el período extraído ("PERIODO ...")
    const comentario = inv.comentario_factura || '';
    const observaDocVenta = comentario ? `${descrip} - ${comentario}` : descrip;
    const sqlImpfis = inv.impfis ? sqlStr(inv.impfis, 20) : 'NULL';
    const sqlImpfisfacFact = inv.impfisfac ? sqlStr(inv.impfisfac, 20) : 'NULL';
    const sqlImpfisfacDoc = inv.impfisfac ? sqlStr(inv.impfisfac, 15) : 'NULL';
    const sqlImpNroZ = inv.imp_nro_z ? sqlStr(inv.imp_nro_z, 15) : 'NULL';

    const headerTipoImp = inv.renglones[0]?.tipo_imp || '1';
    const headerPorcImp = inv.renglones[0]?.porc_imp ?? 16;

    lines.push(`    -- Documento ${inv.tipo_doc_profit} ${inv.doc_num_profit} | Control: ${inv.n_control} | Fecha: ${inv.fec_emis_iso} | Cliente: ${inv.co_cli}`);
    if (inv.tipo_doc_profit === 'FACT') {
      lines.push(`    IF NOT EXISTS (SELECT 1 FROM dbo.saFacturaVenta WHERE LTRIM(RTRIM(doc_num)) = ${sqlStr(inv.doc_num_profit, 20)})`);
      lines.push(`       AND NOT EXISTS (SELECT 1 FROM dbo.saDocumentoVenta WHERE RTRIM(co_tipo_doc) = 'FACT' AND LTRIM(RTRIM(nro_doc)) = ${sqlStr(inv.doc_num_profit, 20)})`);
      lines.push(`    BEGIN`);
      lines.push(`        EXEC dbo.pInsertarFacturaVenta`);
      lines.push(`            @sDoc_Num = ${sqlStr(inv.doc_num_profit, 20)},`);
      lines.push(`            @sDescrip = ${sqlStr(descrip, 60)},`);
      lines.push(`            @sCo_Cli = ${sqlStr(inv.co_cli, 16)},`);
      lines.push(`            @sCo_Tran = ${sqlStr(inv.co_tran, 6)},`);
      lines.push(`            @sCo_Mone = ${sqlStr(inv.co_mone_profit, 6)},`);
      lines.push(`            @sCo_Cta_Ingr_Egr = NULL,`);
      lines.push(`            @sCo_Ven = ${sqlStr(inv.co_ven, 6)},`);
      lines.push(`            @sCo_Cond = ${sqlStr(inv.co_cond, 6)},`);
      lines.push(`            @sdFec_Emis = ${sqlStr(inv.fec_emis_iso)},`);
      lines.push(`            @sdFec_Venc = ${sqlStr(inv.fec_venc_iso)},`);
      lines.push(`            @sdFec_Reg = ${sqlStr(inv.fec_reg_iso)},`);
      lines.push(`            @bAnulado = ${inv.anulado ? 1 : 0},`);
      lines.push(`            @sStatus = '0',`);
      lines.push(`            @deTasa = ${sqlDec(inv.tasa_profit, 8)},`);
      lines.push(`            @sN_Control = ${sqlStr(inv.n_control, 20)},`);
      lines.push(`            @sPorc_Desc_Glob = NULL,`);
      lines.push(`            @deMonto_Desc_Glob = ${sqlDec(inv.monto_desc_glob_bs, 2)},`);
      lines.push(`            @sPorc_Reca = NULL,`);
      lines.push(`            @deMonto_Reca = 0.00,`);
      lines.push(`            @deSaldo = ${sqlDec(inv.saldo_bs, 2)},`);
      lines.push(`            @deTotal_Bruto = ${sqlDec(inv.total_bruto_bs, 2)},`);
      lines.push(`            @deMonto_Imp = ${sqlDec(inv.monto_imp_bs, 2)},`);
      lines.push(`            @deMonto_Imp2 = 0.00,`);
      lines.push(`            @deMonto_Imp3 = 0.00,`);
      lines.push(`            @deOtros1 = ${sqlDec(inv.igtf_bs, 2)},`);
      lines.push(`            @deOtros2 = 0.00,`);
      lines.push(`            @deOtros3 = 0.00,`);
      lines.push(`            @deTotal_Neto = ${sqlDec(inv.total_neto_bs, 2)},`);
      lines.push(`            @sDis_Cen = NULL,`);
      lines.push(`            @sComentario = ${sqlStr(comentario)},`);
      lines.push(`            @sDir_Ent = NULL,`);
      lines.push(`            @bContrib = ${inv.contribuyente ? 1 : 0},`);
      lines.push(`            @bImpresa = ${inv.impresa ? 1 : 0},`);
      lines.push(`            @sSalestax = @sTaxDefault,`);
      lines.push(`            @sImpfis = ${sqlImpfis},`);
      lines.push(`            @sImpfisfac = ${sqlImpfisfacFact},`);
      lines.push(`            @sImp_nro_z = ${sqlImpNroZ},`);
      lines.push(`            @bVen_Ter = 0,`);
      lines.push(`            @sCampo1 = 'HKA-SYNC',`);
      lines.push(`            @sCampo2 = ${sqlStr(inv.n_control, 60)},`);
      lines.push(`            @sCampo3 = ${sqlStr(inv.estado_hka, 60)},`);
      lines.push(`            @sCampo4 = ${inv.url_consulta ? sqlStr(inv.url_consulta, 60) : 'NULL'}, @sCampo5 = NULL, @sCampo6 = NULL, @sCampo7 = NULL, @sCampo8 = NULL,`);
      lines.push(`            @sCo_Us_In = 'PROFIT',`);
      lines.push(`            @sCo_Sucu_In = ${sqlStr(inv.co_sucu, 6)},`);
      lines.push(`            @sRevisado = NULL, @sTrasnfe = NULL,`);
      lines.push(`            @sMaquina = 'SYNC2K-HKA';`);
      lines.push(``);

      // Renglones
      for (const r of inv.renglones) {
        lines.push(`        EXEC dbo.pInsertarRenglonesFacturaVenta`);
        lines.push(`            @iReng_Num = ${r.reng_num},`);
        lines.push(`            @sDoc_Num = ${sqlStr(inv.doc_num_profit, 20)},`);
        lines.push(`            @sCo_Art = ${sqlStr(r.co_art, 30)},`);
        lines.push(`            @sDes_Art = ${sqlStr(r.des_art, 120)},`);
        lines.push(`            @sCo_Uni = ${sqlStr(r.co_uni, 6)},`);
        lines.push(`            @sSco_Uni = NULL,`);
        lines.push(`            @sCo_Alma = ${sqlStr(r.co_alma, 6)},`);
        lines.push(`            @sCo_Precio = ${sqlStr(r.co_precio, 6)},`);
        lines.push(`            @sTipo_Imp = ${sqlStr(r.tipo_imp, 1)},`);
        lines.push(`            @sTipo_Imp2 = NULL, @sTipo_Imp3 = NULL,`);
        lines.push(`            @deTotal_Art = ${sqlDec(r.cantidad, 5)},`);
        lines.push(`            @deSTotal_Art = 0,`);
        lines.push(`            @dePrec_Vta = ${sqlDec(r.prec_vta_bs, 5)},`);
        lines.push(`            @sPorc_Desc = ${r.porc_desc ? sqlStr(r.porc_desc, 15) : 'NULL'},`);
        lines.push(`            @deMonto_Desc = ${sqlDec(r.monto_desc_bs, 5)},`);
        lines.push(`            @deReng_Neto = ${sqlDec(r.reng_neto_bs, 2)},`);
        lines.push(`            @dePendiente = ${r.tipo_art === 'S' ? '0' : sqlDec(r.cantidad, 5)},`);
        lines.push(`            @dePendiente2 = 0,`);
        lines.push(`            @deMonto_Desc_Glob = 0, @deMonto_reca_Glob = 0,`);
        lines.push(`            @deOtros1_glob = 0, @deOtros2_glob = 0, @deOtros3_glob = 0,`);
        lines.push(`            @deMonto_imp_afec_glob = 0, @deMonto_imp2_afec_glob = 0, @deMonto_imp3_afec_glob = 0,`);
        lines.push(`            @sTipo_Doc = NULL, @gRowguid_Doc = NULL, @sNum_Doc = NULL,`);
        lines.push(`            @dePorc_Imp = ${sqlDec(r.porc_imp, 5)},`);
        lines.push(`            @dePorc_Imp2 = 0, @dePorc_Imp3 = 0,`);
        lines.push(`            @deMonto_Imp = ${sqlDec(r.monto_imp_bs, 5)},`);
        lines.push(`            @deMonto_Imp2 = 0, @deMonto_Imp3 = 0,`);
        lines.push(`            @deOtros = 0, @deTotal_Dev = 0, @deMonto_Dev = 0,`);
        lines.push(`            @sComentario = '', @sDis_Cen = NULL,`);
        lines.push(`            @sCo_Sucu_In = ${sqlStr(inv.co_sucu, 6)},`);
        lines.push(`            @sCo_Us_In = 'PROFIT',`);
        lines.push(`            @sREVISADO = NULL, @sTRASNFE = NULL,`);
        lines.push(`            @sMaquina = 'SYNC2K-HKA';`);
        lines.push(``);
        lines.push(`        UPDATE dbo.saFacturaVentaReng`);
        lines.push(`        SET prec_vta_om = ${sqlDec(r.prec_vta_usd, 5)}`);
        lines.push(`        WHERE LTRIM(RTRIM(doc_num)) = ${sqlStr(inv.doc_num_profit, 20)} AND reng_num = ${r.reng_num};`);
        lines.push(``);

        if (!inv.anulado && r.tipo_art === 'V') {
          lines.push(`        EXEC dbo.pStockActualizar @sCo_Alma = ${sqlStr(r.co_alma, 6)}, @sCo_Art = ${sqlStr(r.co_art, 30)}, @sCo_Uni = ${sqlStr(r.co_uni, 6)}, @deCantidad = ${sqlDec(r.cantidad, 5)}, @sTipoStock = 'ACT', @bSumarStock = 0, @bPermiteStockNegativo = 1;`);
          lines.push(`        EXEC dbo.pStockActualizar @sCo_Alma = ${sqlStr(r.co_alma, 6)}, @sCo_Art = ${sqlStr(r.co_art, 30)}, @sCo_Uni = ${sqlStr(r.co_uni, 6)}, @deCantidad = ${sqlDec(r.cantidad, 5)}, @sTipoStock = 'DES', @bSumarStock = 1, @bPermiteStockNegativo = 1;`);
        }
      }
    } else {
      // N/CR o N/DB directo en saDocumentoVenta (aut = 0 para Libro de Ventas SENIAT)
      lines.push(`    IF NOT EXISTS (SELECT 1 FROM dbo.saDocumentoVenta WHERE RTRIM(co_tipo_doc) = ${sqlStr(inv.tipo_doc_profit, 6)} AND LTRIM(RTRIM(nro_doc)) = ${sqlStr(inv.doc_num_profit, 20)})`);
      lines.push(`    BEGIN`);
    }

    // saDocumentoVenta (obligatorio tanto para FACT como para N/CR y N/DB)
    const isAut = inv.tipo_doc_profit === 'FACT' ? 1 : 0;
    const docOrig = inv.tipo_doc_profit === 'FACT' ? 'FACT' : (inv.nro_doc_afectado ? 'FACT' : inv.tipo_doc_profit);
    const nroOrig = inv.tipo_doc_profit === 'FACT' ? inv.doc_num_profit : (inv.nro_doc_afectado || inv.doc_num_profit);

    lines.push(`        EXEC dbo.pInsertarDocumentoVenta`);
    lines.push(`            @sCo_Tipo_Doc = ${sqlStr(inv.tipo_doc_profit, 6)},`);
    lines.push(`            @sNro_Doc = ${sqlStr(inv.doc_num_profit, 20)},`);
    lines.push(`            @sCo_Cli = ${sqlStr(inv.co_cli, 16)},`);
    lines.push(`            @sCo_Ven = ${sqlStr(inv.co_ven, 6)},`);
    lines.push(`            @sCo_Mone = ${sqlStr(inv.co_mone_profit, 6)},`);
    lines.push(`            @sMov_Ban = NULL,`);
    lines.push(`            @sCo_Cta_Ingr_Egr = NULL,`);
    lines.push(`            @deTasa = ${sqlDec(inv.tasa_profit, 8)},`);
    lines.push(`            @sObserva = ${sqlStr(observaDocVenta, 120)},`);
    lines.push(`            @sdFec_Reg = ${sqlStr(inv.fec_reg_iso)},`);
    lines.push(`            @sdFec_Emis = ${sqlStr(inv.fec_emis_iso)},`);
    lines.push(`            @sdFec_Venc = ${sqlStr(inv.fec_venc_iso)},`);
    lines.push(`            @bAnulado = ${inv.anulado ? 1 : 0},`);
    lines.push(`            @bAut = ${isAut},`);
    lines.push(`            @bContrib = ${inv.contribuyente ? 1 : 0},`);
    lines.push(`            @sDoc_Orig = ${sqlStr(docOrig, 6)},`);
    lines.push(`            @sNro_Orig = ${sqlStr(nroOrig, 20)},`);
    lines.push(`            @sNro_Che = NULL,`);
    lines.push(`            @deMonto_Imp = ${sqlDec(inv.monto_imp_bs, 2)},`);
    lines.push(`            @deSaldo = ${sqlDec(inv.saldo_bs, 2)},`);
    lines.push(`            @deTotal_Bruto = ${sqlDec(inv.total_bruto_bs, 2)},`);
    lines.push(`            @deMonto_Desc_Glob = ${sqlDec(inv.monto_desc_glob_bs, 2)},`);
    lines.push(`            @sPorc_Desc_Glob = NULL,`);
    lines.push(`            @sPorc_Reca = NULL,`);
    lines.push(`            @deMonto_Reca = 0.00,`);
    lines.push(`            @deTotal_Neto = ${sqlDec(inv.total_neto_bs, 2)},`);
    lines.push(`            @deMonto_Imp2 = 0.00,`);
    lines.push(`            @deMonto_Imp3 = 0.00,`);
    lines.push(`            @sTipo_Imp = ${sqlStr(headerTipoImp, 1)},`);
    lines.push(`            @iTipo_Origen = NULL,`);
    lines.push(`            @dePorc_Imp = ${sqlDec(headerPorcImp, 5)},`);
    lines.push(`            @dePorc_Imp2 = 0,`);
    lines.push(`            @dePorc_Imp3 = 0,`);
    lines.push(`            @sNum_Comprobante = NULL,`);
    lines.push(`            @sN_Control = ${sqlStr(inv.n_control, 20)},`);
    lines.push(`            @sDis_Cen = NULL,`);
    lines.push(`            @deComis1 = 0, @deComis2 = 0, @deComis3 = 0, @deComis4 = 0, @deComis5 = 0, @deComis6 = 0,`);
    lines.push(`            @deAdicional = 0,`);
    lines.push(`            @sSalestax = @sTaxDefault,`);
    lines.push(`            @bVen_Ter = 0,`);
    lines.push(`            @sImpfis = ${sqlImpfis}, @sImpfisfac = ${sqlImpfisfacDoc}, @sImp_nro_z = ${sqlImpNroZ},`);
    lines.push(`            @deOtros1 = ${sqlDec(inv.igtf_bs, 2)},`);
    lines.push(`            @deOtros2 = 0.00, @deOtros3 = 0.00,`);
    lines.push(`            @sCampo1 = 'HKA-SYNC',`);
    lines.push(`            @sCampo2 = ${sqlStr(inv.n_control, 60)},`);
    lines.push(`            @sCampo3 = ${sqlStr(inv.estado_hka, 60)},`);
    lines.push(`            @sCampo4 = ${inv.url_consulta ? sqlStr(inv.url_consulta, 60) : 'NULL'}, @sCampo5 = NULL, @sCampo6 = NULL, @sCampo7 = NULL, @sCampo8 = NULL,`);
    lines.push(`            @sRevisado = NULL, @sTrasnfe = NULL,`);
    lines.push(`            @sCo_Sucu_In = ${sqlStr(inv.co_sucu, 6)},`);
    lines.push(`            @sCo_Us_In = 'PROFIT',`);
    lines.push(`            @sMaquina = 'SYNC2K-HKA';`);

    if (inv.igtf_bs > 0) {
      lines.push(``);
      lines.push(`        SELECT @gDocRowguid = rowguid FROM dbo.saDocumentoVenta WHERE RTRIM(co_tipo_doc) = ${sqlStr(inv.tipo_doc_profit, 6)} AND LTRIM(RTRIM(nro_doc)) = ${sqlStr(inv.doc_num_profit, 20)};`);
      lines.push(`        IF @gDocRowguid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.saDocumentoVentaInfoIGTF WHERE rowguid = @gDocRowguid)`);
      lines.push(`        BEGIN`);
      lines.push(`            INSERT INTO dbo.saDocumentoVentaInfoIGTF (rowguid, base_imponible, porc_aplic)`);
      lines.push(`            VALUES (@gDocRowguid, ${sqlDec(inv.igtf_base_bs, 2)}, 3.00);`);
      lines.push(`        END;`);
    }

    lines.push(`    END;`);
    lines.push(``);
  }

  // ── SECCIÓN 4: ACTUALIZAR CORRELATIVOS EN saSerie ──
  if (invoicesToRun.length > 0 && plan.summary.maxDocNumeric > 0) {
    lines.push(`    -- =========================================================================`);
    lines.push(`    -- PASO 4: SINCRONIZACIÓN DE PRÓXIMO CORRELATIVO EN saSerie (V001)`);
    lines.push(`    -- =========================================================================`);
    lines.push(`    UPDATE s`);
    lines.push(`    SET s.prox_n = CASE WHEN ISNULL(TRY_CAST(s.prox_n AS BIGINT), 0) < ${plan.summary.maxDocNumeric} THEN CAST(${plan.summary.maxDocNumeric} AS VARCHAR(20)) ELSE s.prox_n END,`);
    lines.push(`        s.fe_us_mo = GETDATE()`);
    lines.push(`    FROM dbo.saSerie s`);
    lines.push(`    WHERE s.co_serie IN (`);
    lines.push(`        SELECT c.co_serie FROM dbo.saConsecutivo c WHERE RTRIM(c.co_consecutivo) = 'DOC_VEN_FACT' AND c.co_serie IS NOT NULL`);
    lines.push(`    );`);
    lines.push(``);
  }

  lines.push(`    COMMIT TRANSACTION;`);
  lines.push(`    SELECT 'OK' AS resultado, ${invoicesToRun.length} AS facturas_procesadas, ${clientsToEnsure.length} AS clientes_verificados, ${articlesToEnsure.length} AS articulos_verificados, ${pricesToSyncCount} AS precios_sincronizados;`);
  lines.push(`END TRY`);
  lines.push(`BEGIN CATCH`);
  lines.push(`    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;`);
  lines.push(`    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();`);
  lines.push(`    DECLARE @ErrLine INT = ERROR_LINE();`);
  lines.push(`    RAISERROR('Error replicando facturas HKA en línea %d: %s', 16, 1, @ErrLine, @ErrMsg);`);
  lines.push(`END CATCH;`);

  return lines.join('\n');
}

// ============================================================================
// 5. GENERADOR DE ARCHIVO EXCEL (.XLSX) MULTI-HOJA PARA AUDITORÍA PREVIA
// ============================================================================

export function generateHkaAuditExcelBuffer(plan: HkaReplicationPlan): Buffer {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Resumen Ejecutivo
  const resumenRows = [
    { Parametro: 'Fecha de Extracción', Valor: plan.generatedAt },
    { Parametro: 'Entorno HKA Consultado', Valor: `${plan.hkaEnvironment.toUpperCase()} (${plan.hkaBaseUrl})` },
    { Parametro: 'Base de Datos Profit Plus Destino', Valor: `${plan.databaseName} (${plan.agentConnected ? 'Conectada en vivo' : 'Sin conexión al agente - usando defaults'})` },
    { Parametro: 'Formato doc_num en Profit', Valor: plan.optionsUsed.pad_doc_num ? `Relleno a ${plan.optionsUsed.doc_num_length} dígitos` : 'Tal cual HKA (sin ceros)' },
    { Parametro: 'Moneda de Registro en Profit', Valor: plan.optionsUsed.moneda_profit },
    { Parametro: 'Moneda Precio 01 Artículos (saArtPrecio)', Valor: plan.optionsUsed.moneda_precio_articulo === 'USD' ? 'USD (Otra Moneda prec_om=1, tasa BCV dinámica)' : 'BS (Moneda Base prec_om=0)' },
    { Parametro: 'Modo de Saldo CxC', Valor: plan.optionsUsed.saldo_mode === 'pendiente' ? 'Saldo Pendiente (= Total Neto)' : 'Saldo Cero (0.00)' },
    { Parametro: 'Total Documentos Extraídos de HKA', Valor: plan.summary.totalHkaDocuments },
    { Parametro: 'Facturas Listas para Crear en Profit', Valor: plan.summary.invoicesToCreate },
    { Parametro: 'Facturas Ya Existentes en Profit (Omitidas)', Valor: plan.summary.invoicesAlreadyInProfit },
    { Parametro: 'Facturas Omitidas (Monto 0.00 / Prueba / Error)', Valor: plan.summary.invoicesSkippedZeroOrError },
    { Parametro: 'Documentos Anulados en HKA', Valor: plan.summary.annulledInvoicesCount },
    { Parametro: 'Rango N° Control SENIAT', Valor: `${plan.summary.minControlNumber} -> ${plan.summary.maxControlNumber}` },
    { Parametro: 'Máximo Correlativo Numérico (saSerie.prox_n)', Valor: plan.summary.maxDocNumeric },
    { Parametro: 'Clientes Involucrados (Nuevos / Existentes)', Valor: `${plan.summary.totalClientsReferenced} (${plan.summary.clientsToCreate} nuevos / ${plan.summary.clientsExisting} existentes)` },
    { Parametro: 'Artículos Involucrados (Nuevos / Existentes)', Valor: `${plan.summary.totalArticlesReferenced} (${plan.summary.articlesToCreate} nuevos / ${plan.summary.articlesExisting} existentes)` },
    { Parametro: 'Artículos Sin Precio en Profit (se asignará Precio 01)', Valor: plan.summary.articlesMissingPrice },
    { Parametro: 'Total Neto Activo a Replicar (Bs)', Valor: plan.summary.totalNetoBsToReplicate },
    { Parametro: 'Total IVA Activo a Replicar (Bs)', Valor: plan.summary.totalIvaBsToReplicate },
    { Parametro: 'Equivalente Referencial Total (USD BCV)', Valor: plan.summary.totalEquivalentUsdToReplicate },
    { Parametro: 'Advertencias Detectadas', Valor: plan.summary.warningsCount }
  ];
  const wsResumen = XLSX.utils.json_to_sheet(resumenRows);
  wsResumen['!cols'] = [{ wch: 48 }, { wch: 62 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  // Hoja 2: Facturas Cabecera
  const facturasRows = plan.invoices.map((i) => ({
    Accion_Profit: i.action,
    Tipo_Doc: i.tipo_doc_profit,
    Doc_Num_Profit: i.doc_num_profit,
    Numero_HKA: i.hka_numero_documento,
    Serie_HKA: i.hka_serie || '(sin serie)',
    N_Control_SENIAT: i.n_control,
    Estado_HKA: i.estado_hka,
    Anulado: i.anulado ? 'SI' : 'NO',
    Fecha_Emision: i.fec_emis_iso,
    Hora_Emision: i.hora_emis,
    Fecha_Vencimiento: i.fec_venc_iso,
    Fecha_Registro_Libro: i.fec_reg_iso,
    Co_Cli_Profit: i.co_cli,
    RIF_Cliente: i.rif,
    Razon_Social: i.cli_des,
    Comentario_Factura: i.comentario_factura || '',
    Impresa: i.impresa ? '1 (SI)' : '0 (NO)',
    Impfis: i.impfis ?? 'NULL',
    Impfisfac: i.impfisfac ?? 'NULL',
    Imp_Nro_Z: i.imp_nro_z ?? 'NULL',
    Moneda_HKA: i.moneda_original_hka,
    Moneda_Profit: i.co_mone_profit,
    Tasa_Profit: i.tasa_profit,
    Tasa_BCV_Fecha: i.tasa_bcv_referencia,
    Gravado_Bs: i.monto_gravado_bs,
    Exento_Bs: i.monto_exento_bs,
    Subtotal_Bruto_Bs: i.total_bruto_bs,
    IVA_Bs: i.monto_imp_bs,
    IGTF_Bs: i.igtf_bs,
    Total_Neto_Bs: i.total_neto_bs,
    Saldo_Profit_Bs: i.saldo_bs,
    Equivalente_USD: i.equivalente_total_usd,
    Forma_Pago: i.forma_pago_hka,
    Sucursal: i.co_sucu,
    Vendedor: i.co_ven,
    Cond_Pago: i.co_cond,
    Existe_En_Profit: i.exists_in_profit ? 'SI' : 'NO',
    Detalle_Existencia_O_Alertas: [i.existing_match_reason, ...i.warnings].filter(Boolean).join(' | '),
    URL_Consulta_SENIAT: i.url_consulta || ''
  }));
  const wsFacturas = XLSX.utils.json_to_sheet(facturasRows);
  wsFacturas['!cols'] = [
    { wch: 18 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
    { wch: 12 }, { wch: 9 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 14 },
    { wch: 15 }, { wch: 15 }, { wch: 36 }, { wch: 36 }, { wch: 11 }, { wch: 10 },
    { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 13 }, { wch: 12 },
    { wch: 14 }, { wch: 15 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
    { wch: 16 }, { wch: 16 }, { wch: 15 }, { wch: 24 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 14 }, { wch: 45 }, { wch: 50 }
  ];
  XLSX.utils.book_append_sheet(wb, wsFacturas, 'Facturas_Cabecera');

  // Hoja 3: Renglones Detalle
  const renglonesRows = plan.invoices.flatMap((inv) =>
    inv.renglones.map((r) => ({
      Accion_Factura: inv.action,
      Doc_Num_Profit: inv.doc_num_profit,
      N_Control_SENIAT: inv.n_control,
      Fecha_Emision: inv.fec_emis_iso,
      Reng_Num: r.reng_num,
      Co_Art_Profit: r.co_art,
      Descripcion_Renglon: r.des_art,
      Periodo_En_Comentario_Factura: r.periodo_extraido || '',
      Descripcion_Original_HKA: r.des_art_original_hka || r.des_art,
      Tipo_Art: r.tipo_art === 'S' ? 'Servicio (S)' : 'Bien (V)',
      Unidad: r.co_uni,
      Almacen: r.co_alma,
      Cantidad: r.cantidad,
      Precio_Unit_Bs: r.prec_vta_bs,
      Precio_Unit_USD_OM: r.prec_vta_usd,
      Porc_Desc: r.porc_desc || '0',
      Monto_Desc_Bs: r.monto_desc_bs,
      Subtotal_Reng_Bs: r.reng_neto_bs,
      Tipo_Imp_Profit: r.tipo_imp,
      Porc_IVA: r.porc_imp,
      Monto_IVA_Bs: r.monto_imp_bs,
      Total_Renglon_Bs: r.total_renglon_bs
    }))
  );
  const wsRenglones = XLSX.utils.json_to_sheet(renglonesRows);
  wsRenglones['!cols'] = [
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 13 }, { wch: 10 }, { wch: 18 },
    { wch: 44 }, { wch: 34 }, { wch: 56 }, { wch: 13 }, { wch: 9 }, { wch: 9 },
    { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 16 },
    { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 16 }
  ];
  XLSX.utils.book_append_sheet(wb, wsRenglones, 'Renglones_Detalle');

  // Hoja 4: Clientes Profit (saCliente)
  const clientesRows = plan.clients.map((c) => ({
    Estado_En_Profit: c.exists_in_profit ? `EXISTENTE (${c.matched_by})` : 'NUEVO A CREAR',
    Co_Cli: c.co_cli,
    RIF: c.rif,
    Razon_Social: c.cli_des,
    Tipo_Persona: c.tipo_per === '3' ? '3 - Jurídica' : c.tipo_per === '2' ? '2 - Extranjero' : '1 - Natural',
    Juridico: c.juridico ? 'SI' : 'NO',
    Zona: c.co_zon,
    Tipo_Cliente: c.tip_cli,
    Cuenta_Ingr_Egr: c.co_cta_ingr_egr,
    Segmento: c.co_seg,
    Vendedor: c.co_ven,
    Cond_Pago: c.co_cond,
    Moneda: c.co_mone,
    Telefono: c.telefonos,
    Email: c.email,
    Direccion: c.direc1,
    Facturas_Asociadas: c.source_invoices.join(', ')
  }));
  const wsClientes = XLSX.utils.json_to_sheet(clientesRows);
  wsClientes['!cols'] = [
    { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 38 }, { wch: 16 }, { wch: 10 },
    { wch: 8 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 18 }, { wch: 28 }, { wch: 45 }, { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(wb, wsClientes, 'Clientes_Profit');

  // Hoja 5: Artículos y Precios Profit (saArticulo + saArtPrecio)
  const articulosRows = plan.articles.map((a) => ({
    Estado_En_Profit: a.exists_in_profit
      ? a.has_price_in_profit
        ? `EXISTENTE CON PRECIO (${a.matched_by})`
        : `EXISTENTE SIN PRECIO (${a.matched_by})`
      : 'NUEVO A CREAR',
    Accion_Precio_01: a.needs_price_sync
      ? `ASIGNAR PRECIO 01 (${a.co_mone_precio})`
      : a.has_price_in_profit
      ? 'CONSERVAR PRECIO ACTUAL'
      : 'SIN MUESTRA > 0',
    Co_Art: a.co_art,
    Descripcion: a.art_des,
    Tipo: a.tipo === 'S' ? 'S - Servicio' : 'V - Bien',
    Unidad_Principal: a.co_uni,
    Tipo_Impuesto: a.tipo_imp,
    Porc_IVA: a.porc_imp,
    Moneda_Precio_01: a.co_mone_precio,
    Precio_OM: a.precio_om ? '1 (SI)' : '0 (NO)',
    Precio_01_Asignar: a.monto_precio_asignar,
    Ult_Precio_Base_USD: a.latest_price_usd,
    Ref_Con_IVA_USD: round2(a.latest_price_usd * (1 + a.porc_imp / 100)),
    Ult_Precio_Base_Bs: a.latest_price_bs,
    Fecha_Ult_Factura: a.latest_price_date || '-',
    Doc_Ult_Factura: a.latest_price_doc || '-',
    Linea: a.co_lin,
    Sublinea: a.co_subl,
    Categoria: a.co_cat,
    Color: a.co_color,
    Ubicacion: a.co_ubicacion,
    Procedencia: a.cod_proc,
    Facturas_Asociadas: a.source_invoices.join(', ')
  }));
  const wsArticulos = XLSX.utils.json_to_sheet(articulosRows);
  wsArticulos['!cols'] = [
    { wch: 28 }, { wch: 24 }, { wch: 18 }, { wch: 42 }, { wch: 14 }, { wch: 15 },
    { wch: 13 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 18 },
    { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 10 },
    { wch: 11 }, { wch: 8 }, { wch: 11 }, { wch: 12 }, { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(wb, wsArticulos, 'Articulos_Profit');

  // Hoja 6: Advertencias y Validaciones
  const warnRows =
    plan.warnings.length > 0
      ? plan.warnings.map((w) => ({
          Severidad: w.severity.toUpperCase(),
          Doc_Num_Profit: w.doc_num,
          N_Control_SENIAT: w.n_control,
          Mensaje: w.message
        }))
      : [{ Severidad: 'OK', Doc_Num_Profit: '-', N_Control_SENIAT: '-', Mensaje: 'Sin advertencias de validación.' }];
  const wsWarns = XLSX.utils.json_to_sheet(warnRows);
  wsWarns['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 85 }];
  XLSX.utils.book_append_sheet(wb, wsWarns, 'Validaciones');

  const arrayBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(arrayBuffer);
}

// ============================================================================
// 6. EJECUCIÓN TRANSACCIONAL EN PROFIT PLUS VÍA AGENTE SYNC2K
// ============================================================================

export async function executeHkaReplicationInProfit(
  plan: HkaReplicationPlan,
  ctx: ProfitAuditContext,
  agentClient: AgentClient,
  sedeId?: string | null
): Promise<{
  success: boolean;
  message: string;
  sqlExecuted: string;
  details?: any;
}> {
  const invoicesToRun = plan.invoices.filter((i) => i.action === 'CREATE');
  const pricesToSync = plan.articles.filter((a) => a.needs_price_sync && a.monto_precio_asignar > 0);
  if (invoicesToRun.length === 0 && pricesToSync.length === 0) {
    return {
      success: true,
      message: 'No hay facturas nuevas ni precios de artículos pendientes por sincronizar en Profit Plus.',
      sqlExecuted: '-- Sin facturas ni precios pendientes por insertar.'
    };
  }

  const sqlScript = generateHkaReplicationSql(plan, ctx);
  const qs = sedeId ? `?sede=${encodeURIComponent(sedeId)}` : '';

  const execRes = await agentClient.request<any>(`/query${qs}`, {
    method: 'POST',
    body: JSON.stringify({ query: sqlScript }),
    ...({ timeout: 120000 } as any)
  });

  if (!execRes.success) {
    return {
      success: false,
      message: execRes.message || 'Error al ejecutar la transacción de replicación en SQL Server.',
      sqlExecuted: sqlScript,
      details: execRes.details
    };
  }

  const summaryMsg =
    invoicesToRun.length > 0
      ? `Replicación completada exitosamente en ${plan.databaseName}: ${invoicesToRun.length} factura(s) insertadas, ${pricesToSync.length} precio(s) en saArtPrecio registrados y correlativos sincronizados.`
      : `Precios actualizados exitosamente en ${plan.databaseName}: se registró Precio 01 en saArtPrecio para ${pricesToSync.length} artículo(s).`;

  return {
    success: true,
    message: summaryMsg,
    sqlExecuted: sqlScript,
    details: execRes.data
  };
}

// ============================================================================
// 7. COMPLETAR PRECIOS FALTANTES (saArtPrecio) DESDE FACTURAS YA EN PROFIT PLUS
// ============================================================================

export interface MissingArticlePriceCandidate {
  co_art: string;
  art_des: string;
  tipo: string;
  tipo_imp: string;
  porc_imp: number;
  campo1: string;
  co_precio: string;
  co_mone_precio: string;
  precio_om: boolean;
  monto_asignar: number;
  latest_price_bs: number;
  latest_price_usd: number;
  ref_con_iva_usd: number;
  tasa_bcv_fecha: number;
  latest_doc_num: string;
  latest_fec_emis: string;
}

export async function backfillMissingArticlePricesFromProfit(
  agentClient: AgentClient,
  sedeId: string | null | undefined,
  options: { moneda_precio_articulo?: 'USD' | 'BS'; dry_run?: boolean } = {}
): Promise<{
  success: boolean;
  dryRun: boolean;
  databaseName: string;
  monedaPrecio: 'USD' | 'BS';
  count: number;
  articles: MissingArticlePriceCandidate[];
  sqlScript: string;
  message: string;
  details?: any;
}> {
  const dryRun = options.dry_run !== false;
  const monedaPrecio: 'USD' | 'BS' = options.moneda_precio_articulo === 'BS' ? 'BS' : 'USD';

  const ctx = await loadProfitAuditContext(agentClient, sedeId, {
    moneda_precio_articulo: monedaPrecio
  });

  if (!ctx.agentConnected) {
    return {
      success: false,
      dryRun,
      databaseName: ctx.databaseName,
      monedaPrecio,
      count: 0,
      articles: [],
      sqlScript: '',
      message: 'El Agente Sync2K de la sucursal no respondió en vivo. Verifique su conexión con SQL Server.'
    };
  }

  const qs = sedeId ? `?sede=${encodeURIComponent(sedeId)}` : '';
  const findMissingQuery = `
    ;WITH UltimoRenglon AS (
        SELECT
            LTRIM(RTRIM(r.co_art)) AS co_art,
            CAST(r.prec_vta AS FLOAT) AS prec_vta_bs,
            CAST(ISNULL(r.porc_imp, 0) AS FLOAT) AS porc_imp,
            CAST(ISNULL(f.tasa, 1) AS FLOAT) AS tasa_fact,
            LTRIM(RTRIM(ISNULL(f.co_mone, ''))) AS co_mone_fact,
            CONVERT(VARCHAR(10), f.fec_emis, 23) AS fec_emis_iso,
            LTRIM(RTRIM(f.doc_num)) AS doc_num,
            ROW_NUMBER() OVER (
                PARTITION BY LTRIM(RTRIM(r.co_art))
                ORDER BY f.fec_emis DESC, TRY_CAST(LTRIM(RTRIM(f.doc_num)) AS BIGINT) DESC, f.doc_num DESC, r.reng_num DESC
            ) AS rn
        FROM dbo.saFacturaVentaReng r
        INNER JOIN dbo.saFacturaVenta f ON LTRIM(RTRIM(f.doc_num)) = LTRIM(RTRIM(r.doc_num))
        WHERE f.anulado = 0 AND r.prec_vta > 0
    )
    SELECT
        LTRIM(RTRIM(a.co_art)) AS co_art,
        LTRIM(RTRIM(a.art_des)) AS art_des,
        LTRIM(RTRIM(a.tipo)) AS tipo,
        LTRIM(RTRIM(a.tipo_imp)) AS tipo_imp,
        ISNULL(LTRIM(RTRIM(a.campo1)), '') AS campo1,
        u.prec_vta_bs,
        u.porc_imp,
        u.tasa_fact,
        u.co_mone_fact,
        u.fec_emis_iso,
        u.doc_num
    FROM dbo.saArticulo a
    INNER JOIN UltimoRenglon u ON u.co_art = LTRIM(RTRIM(a.co_art)) AND u.rn = 1
    WHERE a.anulado = 0
      AND NOT EXISTS (
          SELECT 1 FROM dbo.saArtPrecio ap
          WHERE LTRIM(RTRIM(ap.co_art)) = LTRIM(RTRIM(a.co_art))
            AND ap.Inactivo = 0
            AND ap.monto > 0
      )
    ORDER BY LTRIM(RTRIM(a.co_art));
  `;

  const queryRes = await agentClient.request<any>(`/query${qs}`, {
    method: 'POST',
    body: JSON.stringify({ query: findMissingQuery }),
    ...({ timeout: 30000 } as any)
  });

  if (!queryRes.success) {
    return {
      success: false,
      dryRun,
      databaseName: ctx.databaseName,
      monedaPrecio,
      count: 0,
      articles: [],
      sqlScript: '',
      message: queryRes.message || 'Error al consultar artículos sin precio en Profit Plus.',
      details: queryRes.details
    };
  }

  const rows: any[] = Array.isArray(queryRes.data) ? queryRes.data : [];
  const useUsd = monedaPrecio === 'USD';
  const coMonePrecio = useUsd ? ctx.usdCurrencyCode : ctx.baseCurrency;
  const coPrecio = ctx.catalogs.tipoPrecio || '01';

  const candidates: MissingArticlePriceCandidate[] = rows.map((row) => {
    const fecIso = String(row.fec_emis_iso || '').trim();
    const bcvRate = resolveHistoricalBcvRate(fecIso, ctx.ratesByDate);
    const tasaFact = Number(row.tasa_fact || 1);
    const coMoneFact = String(row.co_mone_fact || '').toUpperCase();
    const rawPrecVta = Number(row.prec_vta_bs || 0);

    // En Profit Plus, si la factura fue registrada en USD con tasa > 1, prec_vta ya viene en Bs en 2kDoce salvo casos especiales;
    // siempre calculamos Bs y USD contra la tasa BCV histórica verificada de la fecha.
    const effectiveRate = tasaFact > 1 && coMoneFact.includes('US') ? tasaFact : bcvRate;
    const priceBs = round5(rawPrecVta);
    const priceUsd = effectiveRate > 0 ? round5(priceBs / effectiveRate) : priceBs;
    const porcImp = Number(row.porc_imp || 0);
    const montoAsignar = useUsd ? priceUsd : priceBs;

    return {
      co_art: String(row.co_art || '').trim(),
      art_des: String(row.art_des || '').trim(),
      tipo: String(row.tipo || 'S').trim(),
      tipo_imp: String(row.tipo_imp || '1').trim(),
      porc_imp: porcImp,
      campo1: String(row.campo1 || '').trim(),
      co_precio: coPrecio,
      co_mone_precio: coMonePrecio,
      precio_om: useUsd,
      monto_asignar: montoAsignar,
      latest_price_bs: priceBs,
      latest_price_usd: priceUsd,
      ref_con_iva_usd: round2(priceUsd * (1 + porcImp / 100)),
      tasa_bcv_fecha: effectiveRate,
      latest_doc_num: String(row.doc_num || '').trim(),
      latest_fec_emis: fecIso
    };
  }).filter((c) => c.monto_asignar > 0);

  if (candidates.length === 0) {
    return {
      success: true,
      dryRun,
      databaseName: ctx.databaseName,
      monedaPrecio,
      count: 0,
      articles: [],
      sqlScript: `-- Todos los artículos facturados en ${ctx.databaseName} ya poseen un precio activo > 0 en dbo.saArtPrecio.`,
      message: `Todos los artículos facturados en ${ctx.databaseName} ya tienen su precio registrado en saArtPrecio.`
    };
  }

  const sqlLines: string[] = [];
  sqlLines.push(`-- =====================================================================================`);
  sqlLines.push(`-- CARGA DE PRECIOS FALTANTES EN dbo.saArtPrecio (${ctx.databaseName})`);
  sqlLines.push(`-- Generado el: ${new Date().toISOString()}`);
  sqlLines.push(`-- Artículos a actualizar: ${candidates.length} | Moneda Precio 01: ${coMonePrecio} (precioOm = ${useUsd ? 1 : 0})`);
  sqlLines.push(`-- =====================================================================================`);
  sqlLines.push(`SET NOCOUNT ON;`);
  sqlLines.push(`SET XACT_ABORT ON;`);
  sqlLines.push(`BEGIN TRY`);
  sqlLines.push(`    BEGIN TRANSACTION;`);
  sqlLines.push(`    DECLARE @sCoPrecio01 CHAR(6) = ISNULL((SELECT TOP 1 RTRIM(co_precio) FROM dbo.saTipoPrecio WHERE RTRIM(co_precio) IN ('01','1') ORDER BY CASE WHEN RTRIM(co_precio) = '01' THEN 0 ELSE 1 END), (SELECT TOP 1 RTRIM(co_precio) FROM dbo.saTipoPrecio ORDER BY co_precio));`);
  sqlLines.push(``);

  for (const c of candidates) {
    sqlLines.push(`    -- ${c.co_art}: ${c.art_des} (Últ. Fact: ${c.latest_doc_num} del ${c.latest_fec_emis} | Base USD: ${c.latest_price_usd} | Ref c/IVA: $${c.ref_con_iva_usd})`);
    sqlLines.push(`    IF NOT EXISTS (`);
    sqlLines.push(`        SELECT 1 FROM dbo.saArtPrecio`);
    sqlLines.push(`        WHERE LTRIM(RTRIM(co_art)) = ${sqlStr(c.co_art, 30)}`);
    sqlLines.push(`          AND LTRIM(RTRIM(co_precio)) = RTRIM(@sCoPrecio01)`);
    sqlLines.push(`          AND Inactivo = 0`);
    sqlLines.push(`          AND monto > 0`);
    sqlLines.push(`    )`);
    sqlLines.push(`    BEGIN`);
    sqlLines.push(`        UPDATE dbo.saArticulo`);
    sqlLines.push(`        SET prec_om = ${c.precio_om ? 1 : 0}, fe_us_mo = GETDATE(), co_us_mo = 'PROFIT'`);
    sqlLines.push(`        WHERE LTRIM(RTRIM(co_art)) = ${sqlStr(c.co_art, 30)};`);
    sqlLines.push(``);
    sqlLines.push(`        DELETE FROM dbo.saArtPrecio`);
    sqlLines.push(`        WHERE LTRIM(RTRIM(co_art)) = ${sqlStr(c.co_art, 30)} AND LTRIM(RTRIM(co_precio)) = RTRIM(@sCoPrecio01);`);
    sqlLines.push(``);
    sqlLines.push(`        INSERT INTO dbo.saArtPrecio (`);
    sqlLines.push(`            co_art, co_precio, co_alma, desde, hasta,`);
    sqlLines.push(`            monto, montoadi1, montoadi2, montoadi3, montoadi4, montoadi5,`);
    sqlLines.push(`            precioOm, co_mone, Inactivo,`);
    sqlLines.push(`            co_us_in, co_sucu_in, fe_us_in, co_us_mo, co_sucu_mo, fe_us_mo,`);
    sqlLines.push(`            revisado, trasnfe, rowguid`);
    sqlLines.push(`        ) VALUES (`);
    sqlLines.push(`            ${sqlStr(c.co_art, 30)}, @sCoPrecio01, NULL, CAST('20250101' AS SMALLDATETIME), NULL,`);
    sqlLines.push(`            ${sqlDec(c.monto_asignar, 5)}, 0, 0, 0, 0, 0,`);
    sqlLines.push(`            ${c.precio_om ? 1 : 0}, ${sqlStr(c.co_mone_precio, 6)}, 0,`);
    sqlLines.push(`            'PROFIT', ${sqlStr(ctx.catalogs.sucursal || '01', 6)}, GETDATE(), 'PROFIT', ${sqlStr(ctx.catalogs.sucursal || '01', 6)}, GETDATE(),`);
    sqlLines.push(`            NULL, NULL, NEWID()`);
    sqlLines.push(`        );`);
    sqlLines.push(`    END;`);
    sqlLines.push(``);
  }

  sqlLines.push(`    COMMIT TRANSACTION;`);
  sqlLines.push(`    SELECT 'OK' AS resultado, ${candidates.length} AS precios_insertados;`);
  sqlLines.push(`END TRY`);
  sqlLines.push(`BEGIN CATCH`);
  sqlLines.push(`    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;`);
  sqlLines.push(`    DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();`);
  sqlLines.push(`    DECLARE @ErrLine INT = ERROR_LINE();`);
  sqlLines.push(`    RAISERROR('Error insertando precios en saArtPrecio (línea %d): %s', 16, 1, @ErrLine, @ErrMsg);`);
  sqlLines.push(`END CATCH;`);

  const sqlScript = sqlLines.join('\n');

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      databaseName: ctx.databaseName,
      monedaPrecio,
      count: candidates.length,
      articles: candidates,
      sqlScript,
      message: `Se detectaron ${candidates.length} artículo(s) en ${ctx.databaseName} sin precio en saArtPrecio listos para asignar Precio 01 (${coMonePrecio}).`
    };
  }

  const execRes = await agentClient.request<any>(`/query${qs}`, {
    method: 'POST',
    body: JSON.stringify({ query: sqlScript }),
    ...({ timeout: 60000 } as any)
  });

  if (!execRes.success) {
    return {
      success: false,
      dryRun: false,
      databaseName: ctx.databaseName,
      monedaPrecio,
      count: candidates.length,
      articles: candidates,
      sqlScript,
      message: execRes.message || 'Error al insertar precios en dbo.saArtPrecio.',
      details: execRes.details
    };
  }

  return {
    success: true,
    dryRun: false,
    databaseName: ctx.databaseName,
    monedaPrecio,
    count: candidates.length,
    articles: candidates,
    sqlScript,
    message: `Se registraron exitosamente los precios (Precio 01 en ${coMonePrecio}) en saArtPrecio para ${candidates.length} artículo(s) en ${ctx.databaseName}.`,
    details: execRes.data
  };
}
