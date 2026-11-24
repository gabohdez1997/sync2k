// src/lib/server/services/hka.ts
// Conector oficial The Factory HKA (TFHKA) para Facturación Electrónica SENIAT V2
// Compatible con Sync2K ERP, Profit Plus 2kDoce y verticales ISP (Aldanet)

import { getIntegration, saveIntegration, type IntegrationConfig } from '$lib/server/integrations';
import { logAction } from '$lib/server/audit';

export interface HkaConfig {
  id: string;
  provider: 'the_factory_hka';
  token_empresa: string;
  token_clave: string;
  environment: 'demo' | 'production';
  base_url: string;
  emisor_rif: string;
  emisor_nombre: string;
  emisor_direccion: string;
  emisor_telefono: string;
  emisor_correo: string;
  correo_adicional?: string;
  serie_default: string;
  moneda_default: string;
  is_active: boolean;
  last_tested_at?: string | null;
  last_test_status?: 'success' | 'failed' | null;
  last_test_message?: string | null;
  updated_at?: string;
}

export const DEFAULT_HKA_CONFIG: HkaConfig = {
  id: 'the_factory_hka',
  provider: 'the_factory_hka',
  token_empresa: '',
  token_clave: '',
  environment: 'demo',
  base_url: 'https://demoemision.thefactoryhka.com.ve',
  emisor_rif: 'J-504441244',
  emisor_nombre: 'ALDANET, C.A',
  emisor_direccion: 'CALLE SUCRE CASA NRO 68 SECTOR CASCO CENTRAL EL CONSEJO ARAGUA ZONA POSTAL 2118',
  emisor_telefono: '02129000000',
  emisor_correo: 'FACTURACION@ALDANET.COM.VE',
  correo_adicional: '',
  serie_default: '',
  moneda_default: 'VES',
  is_active: true
};

/**
 * Obtiene la configuración activa de The Factory HKA desde el Módulo de Integraciones
 */
export async function getHkaConfig(fetchFn?: typeof fetch): Promise<HkaConfig> {
  const integration = await getIntegration('the_factory_hka', fetchFn);
  if (!integration) {
    return { ...DEFAULT_HKA_CONFIG };
  }

  const creds = integration.credentials || {};
  const opts = integration.options || {};

  return {
    id: 'the_factory_hka',
    provider: 'the_factory_hka',
    token_empresa: String(creds.token_empresa || '').trim(),
    token_clave: String(creds.token_clave || '').trim(),
    environment: (integration.environment === 'production' ? 'production' : 'demo') as 'demo' | 'production',
    base_url: String(integration.base_url || DEFAULT_HKA_CONFIG.base_url).trim(),
    emisor_rif: String(opts.emisor_rif || DEFAULT_HKA_CONFIG.emisor_rif).trim(),
    emisor_nombre: String(opts.emisor_nombre || DEFAULT_HKA_CONFIG.emisor_nombre).trim(),
    emisor_direccion: String(opts.emisor_direccion || DEFAULT_HKA_CONFIG.emisor_direccion).trim(),
    emisor_telefono: String(opts.emisor_telefono || DEFAULT_HKA_CONFIG.emisor_telefono).trim(),
    emisor_correo: String(opts.emisor_correo || DEFAULT_HKA_CONFIG.emisor_correo).trim(),
    correo_adicional: String(opts.correo_adicional || '').trim(),
    serie_default:
      opts.serie_default !== undefined && opts.serie_default !== null
        ? String(opts.serie_default).trim()
        : DEFAULT_HKA_CONFIG.serie_default,
    moneda_default: String(opts.moneda_default || DEFAULT_HKA_CONFIG.moneda_default).trim(),
    is_active: Boolean(integration.is_active),
    last_tested_at: integration.last_tested_at,
    last_test_status: integration.last_test_status,
    last_test_message: integration.last_test_message,
    updated_at: integration.updated_at
  };
}

/**
 * Guarda o actualiza la configuración de The Factory HKA en el Módulo de Integraciones
 */
export async function saveHkaConfig(updates: Partial<HkaConfig>, fetchFn?: typeof fetch): Promise<HkaConfig> {
  const current = await getHkaConfig(fetchFn);
  const merged: HkaConfig = { ...current, ...updates };

  await saveIntegration(
    'the_factory_hka',
    {
      environment: merged.environment,
      base_url: merged.base_url,
      is_active: merged.is_active,
      credentials: {
        token_empresa: merged.token_empresa,
        token_clave: merged.token_clave
      },
      options: {
        emisor_rif: merged.emisor_rif,
        emisor_nombre: merged.emisor_nombre,
        emisor_direccion: merged.emisor_direccion,
        emisor_telefono: merged.emisor_telefono,
        emisor_correo: merged.emisor_correo,
        correo_adicional: merged.correo_adicional,
        serie_default: merged.serie_default,
        moneda_default: merged.moneda_default
      },
      last_tested_at: merged.last_tested_at,
      last_test_status: merged.last_test_status,
      last_test_message: merged.last_test_message
    },
    fetchFn
  );

  return merged;
}

/**
 * Caché en memoria para el token JWT de HKA (evita reautenticar en cada petición)
 */
interface CachedToken {
  token: string;
  expiracion: number;
}
let tokenCache: CachedToken | null = null;
const lastDocNumberCache = new Map<string, number>();

interface CachedAssignmentsEntry {
  items: HkaAssignmentItem[];
  fetchedAt: number;
}
const assignmentsWindowCache = new Map<string, CachedAssignmentsEntry>();
const ASSIGNMENTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Formatea fecha y hora según los regex estrictos de The Factory HKA (.swaggerHKA)
 * Fecha: DD/MM/YYYY
 * Hora: hh:mm:ss am/pm
 */
export function formatHkaDateTime(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const fechaEmision = `${day}/${month}/${year}`;

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');
  const horaEmision = `${strHours}:${minutes}:${seconds} ${ampm}`;

  return { fechaEmision, horaEmision };
}

/**
 * Autentica contra The Factory HKA: POST /api/Autenticacion
 * Devuelve el JWT Bearer Token y los datos de expiración
 */
export async function authenticateHka(
  configOverride?: Partial<HkaConfig>,
  forceFresh = false
): Promise<{
  success: boolean;
  token?: string;
  expiracion?: string;
  codigo?: number;
  mensaje?: string;
  latencyMs: number;
  raw?: any;
}> {
  const cfg = configOverride ? { ...(await getHkaConfig()), ...configOverride } : await getHkaConfig();

  // Verificar si hay token cacheado y válido por al menos 5 minutos más
  const now = Date.now();
  if (!forceFresh && !configOverride && tokenCache && tokenCache.expiracion > now + 300000) {
    return {
      success: true,
      token: tokenCache.token,
      codigo: 200,
      mensaje: 'Token reutilizado de caché en memoria',
      latencyMs: 0
    };
  }

  const baseUrl = (cfg.base_url || 'https://demoemision.thefactoryhka.com.ve').replace(/\/+$/, '');
  const url = `${baseUrl}/api/Autenticacion`;

  if (!cfg.token_empresa || !cfg.token_clave) {
    return {
      success: false,
      codigo: 400,
      mensaje: 'Token Empresa o Token Clave no configurados.',
      latencyMs: 0
    };
  }

  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        usuario: cfg.token_empresa.trim(),
        clave: cfg.token_clave.trim()
      })
    });

    const latencyMs = Date.now() - startTime;
    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = { rawText: await response.text() };
    }

    if (response.ok && data?.token) {
      // Guardar token en memoria
      const expiresAt = data.expiracion ? new Date(data.expiracion).getTime() : now + 3600000;
      tokenCache = {
        token: data.token,
        expiracion: isNaN(expiresAt) ? now + 3600000 : expiresAt
      };

      return {
        success: true,
        token: data.token,
        expiracion: data.expiracion,
        codigo: data.codigo || 200,
        mensaje: data.mensaje || 'Autenticación exitosa',
        latencyMs,
        raw: data
      };
    } else {
      tokenCache = null;
      return {
        success: false,
        codigo: data?.codigo || response.status,
        mensaje: data?.mensaje || response.statusText || 'Error de credenciales o autenticación HKA',
        latencyMs,
        raw: data
      };
    }
  } catch (err: any) {
    tokenCache = null;
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      codigo: 500,
      mensaje: `Fallo de conexión hacia ${baseUrl}: ${err.message}`,
      latencyMs
    };
  }
}

/**
 * Realiza un test de conexión completo y actualiza el estado de diagnóstico en el sistema
 */
export async function testHkaConnection(customConfig?: Partial<HkaConfig>) {
  const result = await authenticateHka(customConfig, true);
  const now = new Date().toISOString();

  await saveHkaConfig({
    ...(customConfig?.token_empresa ? { token_empresa: customConfig.token_empresa } : {}),
    ...(customConfig?.token_clave ? { token_clave: customConfig.token_clave } : {}),
    ...(customConfig?.environment ? { environment: customConfig.environment } : {}),
    ...(customConfig?.base_url ? { base_url: customConfig.base_url } : {}),
    last_tested_at: now,
    last_test_status: result.success ? 'success' : 'failed',
    last_test_message: result.mensaje || (result.success ? 'Conexión verificada exitosamente' : 'Error en la conexión')
  });

  return result;
}

export interface InvoiceItemInput {
  codigo?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  tasaIVA?: number; // 16, 8 o 0
  codigoImpuesto?: 'G' | 'R' | 'A' | 'E'; // 'G' = General 16%, 'E' = Exento
  unidadMedida?: string; // 'UND', 'MTS', 'KG', etc.
}

export interface InvoiceClientInput {
  tipoIdentificacion: 'V' | 'J' | 'G' | 'E' | 'P';
  numeroIdentificacion: string;
  razonSocial: string;
  direccion: string;
  pais?: string;
  telefono?: string;
  correo?: string;
  notificar?: 'Si' | 'No';
}

export interface EmitInvoiceInput {
  tipoDocumento?: '01' | '02' | '03'; // '01' = Factura, '02' = Nota de Crédito, '03' = Nota de Débito
  serie?: string;
  numeroDocumento?: string;
  comprador: InvoiceClientInput;
  items: InvoiceItemInput[];
  moneda?: string;
  tipoDePago?: string; // '01' = Contado / Transferencia
  formaDePagoDescripcion?: string;
  observacion?: string;
  numeroDocumentoAfectado?: string; // Requerido para Notas de Crédito / Débito
  motivoModificacion?: string;
  // Campos oficiales V2 para Notas de Crédito / Débito
  numeroFacturaAfectada?: string;
  serieFacturaAfectada?: string;
  fechaFacturaAfectada?: string; // DD/MM/YYYY
  montoFacturaAfectada?: number | string;
  comentarioFacturaAfectada?: string;
}

/**
 * Parsea y estandariza la cédula o RIF al formato exacto requerido por The Factory HKA
 */
export function parseClientCedula(
  cedulaOrRif?: string | null,
  tipoPersona?: string | number | null
): {
  tipoIdentificacion: 'V' | 'J' | 'G' | 'E' | 'P';
  numeroIdentificacion: string;
  tipo: 'V' | 'J' | 'G' | 'E' | 'P';
  cleanDoc: string;
  formattedRif: string;
} {
  const isMoral =
    tipoPersona === 2 ||
    tipoPersona === '2' ||
    String(tipoPersona ?? '').toLowerCase().includes('moral') ||
    String(tipoPersona ?? '').toLowerCase().includes('jurid');

  const defaultTipo: 'V' | 'J' = isMoral ? 'J' : 'V';
  const raw = (cedulaOrRif || '').trim().toUpperCase();
  if (!raw) {
    return {
      tipoIdentificacion: defaultTipo,
      numeroIdentificacion: '00000000',
      tipo: defaultTipo,
      cleanDoc: '',
      formattedRif: ''
    };
  }

  const prefixMatch = raw.match(/^([VJGEP])/);
  const tipo = (prefixMatch ? prefixMatch[1] : defaultTipo) as 'V' | 'J' | 'G' | 'E' | 'P';
  const digits = raw.replace(/[^0-9]/g, '');

  if (digits.length > 0) {
    const cleanDoc = digits.slice(0, 19);
    return {
      tipoIdentificacion: tipo,
      numeroIdentificacion: digits.slice(0, 20),
      tipo,
      cleanDoc,
      formattedRif: `${tipo}${cleanDoc}`
    };
  }

  return {
    tipoIdentificacion: defaultTipo,
    numeroIdentificacion: '00000000',
    tipo: defaultTipo,
    cleanDoc: '',
    formattedRif: ''
  };
}

/**
 * Extrae la capacidad del plan de internet para colocarlo exclusivamente en el código PLU de SENIAT
 */
export function extractPlanCapacity(planName?: string | null): string {
  if (!planName) return 'SRV';
  const clean = planName.trim().toUpperCase();

  const gbMatch = clean.match(/(\d+)\s*(?:GB|GIGA|GIGAS)\b/i);
  if (gbMatch) return `${gbMatch[1]}GB`;

  const mbMatch = clean.match(/(\d+)\s*(?:MB|MEGAS?|MBPS|MIB)\b/i);
  if (mbMatch) return `${mbMatch[1]}MB`;

  const numMatch = clean.match(/\b(\d+)\b/);
  if (numMatch) {
    const val = parseInt(numMatch[1], 10);
    if (val >= 1000) return `${Math.round(val / 1000)}GB`;
    return `${val}MB`;
  }

  const fallback = clean.replace(/[^A-Z0-9]/g, '').slice(0, 10);
  return fallback || 'SRV';
}

/**
 * Limpia y formatea los mensajes y validaciones que retorna HKA para mostrarlos en toasts legibles
 */
export function formatHkaValidationErrors(validaciones?: string[] | null, mensaje?: string): string {
  if (!validaciones || validaciones.length === 0) {
    return mensaje || 'Error desconocido al procesar con The Factory HKA';
  }

  const cleaned = validaciones.map((val) => {
    let str = val.replace(/^DocumentoElectronico\.Encabezado\./i, '');
    str = str.replace(/^DocumentoElectronico\.DetallesItems\[\d+\]\./i, 'Ítem: ');
    str = str.replace(/\b\d{4}\|/g, '');
    str = str.replace(/\(Value: '[^']*'\)/g, '').trim();
    return str;
  });

  const unique = Array.from(new Set(cleaned));
  const mainMsg = mensaje && mensaje !== 'Documento no procesado' ? `${mensaje}: ` : '';
  return `${mainMsg}${unique.join(' • ')}`;
}

/**
 * Consulta el último número de documento emitido en HKA: POST /api/UltimoDocumento
 * Con fallback automático a ListadoAsignaciones y caché local ante límite de 30s (código 99)
 * o primer documento del tipo/serie (código 203).
 */
export async function getLastHkaDocumentNumber(
  tipoDocumento = '01',
  serie?: string,
  configOverride?: Partial<HkaConfig>
): Promise<{
  success: boolean;
  numeroDocumento?: number;
  siguienteNumero?: string;
  codigo?: string | number;
  mensaje?: string;
}> {
  const cfg = configOverride ? { ...(await getHkaConfig()), ...configOverride } : await getHkaConfig();

  const auth = await authenticateHka(cfg);
  if (!auth.success || !auth.token) {
    return {
      success: false,
      codigo: auth.codigo || 401,
      mensaje: `Fallo de autenticación HKA: ${auth.mensaje}`
    };
  }

  const baseUrl = (cfg.base_url || 'https://demoemision.thefactoryhka.com.ve').replace(/\/+$/, '');
  const url = `${baseUrl}/api/UltimoDocumento`;
  const serieClean = String(serie !== undefined ? serie : (cfg.serie_default ?? '')).trim().toUpperCase();
  const cacheKey = `${baseUrl}__${tipoDocumento}__${serieClean}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${auth.token}`
      },
      body: JSON.stringify({
        tipoDocumento,
        serie: serieClean
      })
    });

    let resData: any = null;
    try {
      resData = await res.json();
    } catch {
      resData = { raw: await res.text() };
    }

    if (res.ok && String(resData?.codigo) === '200' && resData?.numeroDocumento !== undefined) {
      const lastNum = Math.max(Number(resData.numeroDocumento) || 0, lastDocNumberCache.get(cacheKey) || 0);
      lastDocNumberCache.set(cacheKey, lastNum);
      const nextNum = String(lastNum + 1);
      return {
        success: true,
        numeroDocumento: lastNum,
        siguienteNumero: nextNum,
        codigo: resData.codigo,
        mensaje: resData.mensaje || 'Consulta realizada exitosamente'
      };
    }

    // Fallback ante código 99 (cooldown 30s) o 203 (primer documento de este tipo/serie)
    const listRes = await listHkaAssignments({ tipoDocumento, serie: serieClean }, cfg);
    let maxFromList = 0;
    if (listRes.success && Array.isArray(listRes.asignaciones)) {
      for (const it of listRes.asignaciones) {
        if (
          String(it.tipoDocumento || '').trim() === String(tipoDocumento).trim() &&
          String(it.serie || '').trim().toUpperCase() === serieClean
        ) {
          const n = Number(it.numeroDocumento);
          if (!isNaN(n) && n > maxFromList) {
            maxFromList = n;
          }
        }
      }
    }

    const bestLast = Math.max(maxFromList, lastDocNumberCache.get(cacheKey) || 0);
    if (bestLast > 0) {
      lastDocNumberCache.set(cacheKey, bestLast);
      return {
        success: true,
        numeroDocumento: bestLast,
        siguienteNumero: String(bestLast + 1),
        codigo: 200,
        mensaje: 'Correlativo resuelto desde asignaciones HKA'
      };
    }

    if (String(resData?.codigo) === '203' || listRes.success) {
      return {
        success: true,
        numeroDocumento: 0,
        siguienteNumero: '1',
        codigo: 200,
        mensaje: 'Primer documento del tipo/serie'
      };
    }

    return {
      success: false,
      codigo: resData?.codigo || res.status,
      mensaje: resData?.mensaje || 'No se pudo obtener el último correlativo de HKA'
    };
  } catch (err: any) {
    return {
      success: false,
      codigo: 500,
      mensaje: `Error al consultar último documento: ${err.message}`
    };
  }
}

/**
 * Emite una factura electrónica a través del endpoint /api/Emision de The Factory HKA
 * Cumple rigurosamente con los esquemas de .swaggerHKA V2 (SendRequestDTO, DocumentoElectronico)
 */
export async function emitInvoiceHka(
  input: EmitInvoiceInput,
  configOverride?: Partial<HkaConfig>
): Promise<{
  success: boolean;
  codigo?: string | number;
  mensaje?: string;
  errorMessageFormatted?: string;
  isDuplicate?: boolean;
  validaciones?: string[];
  resultado?: {
    imprentaDigital?: string;
    autorizado?: string;
    serie?: string;
    tipoDocumento?: string;
    numeroDocumento?: string;
    numeroControl?: string;
    fechaAsignacion?: string;
    horaAsignacion?: string;
    fechaAsignacionNumeroControl?: string;
    horaAsignacionNumeroControl?: string;
    rangoAsignado?: string;
    transaccionId?: string;
    urlConsulta?: string;
  };
  requestPayload?: any;
  rawResponse?: any;
}> {
  const cfg = configOverride ? { ...(await getHkaConfig()), ...configOverride } : await getHkaConfig();

  // 1. Obtener Token Bearer
  const auth = await authenticateHka(cfg);
  if (!auth.success || !auth.token) {
    return {
      success: false,
      codigo: auth.codigo || 401,
      mensaje: `Fallo de autenticación con The Factory HKA: ${auth.mensaje}`,
      errorMessageFormatted: `Fallo de autenticación HKA: ${auth.mensaje}`
    };
  }

  // 2. Determinar número de documento correlativo
  let numeroDocumentoFinal = input.numeroDocumento;
  const serieFinal = input.serie !== undefined ? input.serie : (cfg.serie_default ?? '');

  if (!numeroDocumentoFinal) {
    const lastDoc = await getLastHkaDocumentNumber(input.tipoDocumento || '01', serieFinal, cfg);
    if (lastDoc.success && lastDoc.siguienteNumero) {
      numeroDocumentoFinal = lastDoc.siguienteNumero;
    } else {
      numeroDocumentoFinal = '1';
    }
  }

  // 3. Preparar cálculos matemáticos de ítems y totales
  const { fechaEmision, horaEmision } = formatHkaDateTime();
  let totalGravado = 0;
  let totalExento = 0;
  let totalIva = 0;

  const formattedItems = input.items.map((item, idx) => {
    const isExento = item.codigoImpuesto === 'E' || item.tasaIVA === 0;
    const tasa = isExento ? 0 : (item.tasaIVA ?? 16);
    const qty = Number(item.cantidad || 1);
    const unitPrice = Number(item.precioUnitario || 0);
    const baseItem = Math.round(qty * unitPrice * 100) / 100;

    let itemIva = 0;
    if (isExento) {
      totalExento = Math.round((totalExento + baseItem) * 100) / 100;
    } else {
      itemIva = Math.round(baseItem * (tasa / 100) * 100) / 100;
      totalGravado = Math.round((totalGravado + baseItem) * 100) / 100;
      totalIva = Math.round((totalIva + itemIva) * 100) / 100;
    }

    const valorTotalItem = Math.round((baseItem + itemIva) * 100) / 100;
    const codigoFinal = (
      item.codigo ||
      extractPlanCapacity(item.descripcion) ||
      `SRV-${String(idx + 1).padStart(2, '0')}`
    )
      .trim()
      .toUpperCase()
      .slice(0, 20);

    return {
      numeroLinea: String(idx + 1),
      codigoPLU: codigoFinal,
      indicadorBienoServicio: '2', // 2 = Servicio / Bien estándar
      descripcion: item.descripcion.trim().toUpperCase().slice(0, 1000),
      cantidad: qty.toFixed(2),
      unidadMedida: (item.unidadMedida || 'UND').trim().toUpperCase().slice(0, 10),
      precioUnitario: unitPrice.toFixed(4),
      precioItem: baseItem.toFixed(2),
      codigoImpuesto: isExento ? 'E' : (item.codigoImpuesto || 'G').trim().toUpperCase(),
      tasaIVA: tasa.toFixed(2),
      valorIVA: itemIva.toFixed(2),
      valorTotalItem: valorTotalItem.toFixed(2)
    };
  });

  const subtotal = Math.round((totalGravado + totalExento) * 100) / 100;
  const totalGeneral = Math.round((subtotal + totalIva) * 100) / 100;

  // 4. Formatear comprador y correos de notificación
  const cleanCedula = input.comprador.numeroIdentificacion.replace(/[^0-9]/g, '');
  const cleanRazonSocial = (input.comprador.razonSocial || 'CLIENTE GENERAL').trim().toUpperCase().slice(0, 255);
  const cleanDireccion = (input.comprador.direccion || 'VENEZUELA').trim().toUpperCase().slice(0, 255);

  const recipientEmails: string[] = [];
  if (input.comprador.correo) {
    const rawClientEmails = String(input.comprador.correo).split(/[,;]/);
    for (const em of rawClientEmails) {
      const cleanEm = em.trim().toLowerCase();
      if (cleanEm && cleanEm.includes('@') && !recipientEmails.includes(cleanEm)) {
        recipientEmails.push(cleanEm);
      }
    }
  }

  if (cfg.correo_adicional && cfg.correo_adicional.trim()) {
    const rawExtraEmails = cfg.correo_adicional.split(/[,;]/);
    for (const em of rawExtraEmails) {
      const cleanEm = em.trim().toLowerCase();
      if (cleanEm && cleanEm.includes('@') && !recipientEmails.includes(cleanEm)) {
        recipientEmails.push(cleanEm);
      }
    }
  }

  const tipoDoc = input.tipoDocumento || '01';
  const tipoTransaccion = tipoDoc === '03' ? '03' : tipoDoc === '02' ? '02' : '01';
  const serieUpper = serieFinal ? serieFinal.trim().toUpperCase() : '';

  const normalizeAffectedDate = (rawDate?: string): string => {
    const val = (rawDate || '').trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
    const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    if (val) {
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) {
        return formatHkaDateTime(parsed).fechaEmision;
      }
    }
    return fechaEmision;
  };

  const rawAffectedNum = String(input.numeroFacturaAfectada || input.numeroDocumentoAfectado || '').trim();
  const affectedDigits = rawAffectedNum.replace(/\D/g, '');
  const affectedDocNum = (affectedDigits ? affectedDigits.replace(/^0+(?=\d)/, '') : rawAffectedNum) || '1';
  const affectedSerie =
    input.serieFacturaAfectada !== undefined
      ? String(input.serieFacturaAfectada).trim().toUpperCase()
      : serieUpper;

  const impuestosSubtotal: Array<{
    codigoTotalImp: string;
    alicuotaImp: string;
    baseImponibleImp: string;
    valorTotalImp: string;
  }> = [];

  if (totalGravado > 0) {
    impuestosSubtotal.push({
      codigoTotalImp: 'G',
      alicuotaImp: '16.00',
      baseImponibleImp: totalGravado.toFixed(2),
      valorTotalImp: totalIva.toFixed(2)
    });
  }
  if (totalExento > 0) {
    impuestosSubtotal.push({
      codigoTotalImp: 'E',
      alicuotaImp: '0.00',
      baseImponibleImp: totalExento.toFixed(2),
      valorTotalImp: '0.00'
    });
  }

  const payload: any = {
    documentoElectronico: {
      encabezado: {
        identificacionDocumento: {
          tipoDocumento: tipoDoc,
          serie: serieUpper,
          numeroDocumento: String(numeroDocumentoFinal),
          tipoDeVenta: '01', // 01 = Interna (Requerido por HKA V2)
          tipoTransaccion,
          fechaEmision,
          horaEmision,
          tipoDePago: input.tipoDePago || '01',
          moneda: (input.moneda || cfg.moneda_default || 'VES').trim().toUpperCase(),
          ...(tipoDoc === '02' || tipoDoc === '03'
            ? {
              serieFacturaAfectada: affectedSerie,
              numeroFacturaAfectada: affectedDocNum,
              fechaFacturaAfectada: normalizeAffectedDate(input.fechaFacturaAfectada),
              montoFacturaAfectada: Number(input.montoFacturaAfectada || totalGeneral).toFixed(2),
              comentarioFacturaAfectada: (
                input.comentarioFacturaAfectada ||
                input.motivoModificacion ||
                'DEVOLUCION DE VENTA'
              )
                .trim()
                .toUpperCase()
                .slice(0, 255)
            }
            : {})
        },
        vendedor: {
          nombre: (cfg.emisor_nombre || 'EMPRESA').trim().toUpperCase().slice(0, 255)
        },
        comprador: {
          tipoIdentificacion: (input.comprador.tipoIdentificacion || 'V').trim().toUpperCase(),
          numeroIdentificacion: cleanCedula || '00000000',
          razonSocial: cleanRazonSocial,
          direccion: cleanDireccion,
          pais: (input.comprador.pais || 'VE').trim().toUpperCase(),
          notificar: input.comprador.notificar === 'No' ? 'No' : 'Si',
          ...(input.comprador.telefono ? { telefono: [String(input.comprador.telefono).trim().toUpperCase()] } : {}),
          ...(recipientEmails.length > 0 ? { correo: recipientEmails } : {})
        },
        totales: {
          nroItems: String(formattedItems.length),
          montoGravadoTotal: totalGravado.toFixed(2),
          montoExentoTotal: totalExento.toFixed(2),
          subtotal: subtotal.toFixed(2),
          totalIVA: totalIva.toFixed(2),
          montoTotalConIVA: totalGeneral.toFixed(2),
          totalAPagar: totalGeneral.toFixed(2),
          impuestosSubtotal,
          formasPago: [
            {
              forma: input.tipoDePago || '01',
              descripcion: (input.formaDePagoDescripcion || 'TRANSFERENCIA BANCARIA').trim().toUpperCase(),
              monto: totalGeneral.toFixed(2),
              moneda: (input.moneda || cfg.moneda_default || 'VES').trim().toUpperCase()
            }
          ]
        }
      },
      detallesItems: formattedItems
    }
  };

  // 5. Enviar a /api/Emision
  const baseUrl = (cfg.base_url || 'https://demoemision.thefactoryhka.com.ve').replace(/\/+$/, '');
  const url = `${baseUrl}/api/Emision`;

  const sendEmision = async (bodyPayload: any) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${auth.token}`
      },
      body: JSON.stringify(bodyPayload)
    });

    let resData: any = null;
    try {
      resData = await res.json();
    } catch {
      resData = { raw: await res.text() };
    }
    return { res, resData };
  };

  try {
    let { res, resData } = await sendEmision(payload);

    // Fallback automático si se configuró una serie sin rango asignado y HKA responde código 203
    const validacionesArr = Array.isArray(resData?.validaciones) ? resData.validaciones : [];
    const isNoRange =
      String(resData?.codigo) === '203' &&
      validacionesArr.some((v: any) => String(v || '').toLowerCase().includes('rango de numeraci'));

    if (isNoRange && payload.documentoElectronico.encabezado.identificacionDocumento.serie !== '') {
      payload.documentoElectronico.encabezado.identificacionDocumento.serie = '';
      if ((tipoDoc === '02' || tipoDoc === '03') && input.serieFacturaAfectada === undefined) {
        payload.documentoElectronico.encabezado.identificacionDocumento.serieFacturaAfectada = '';
      }
      if (!input.numeroDocumento) {
        const fallbackLast = await getLastHkaDocumentNumber(tipoDoc, '', cfg);
        if (fallbackLast.success && fallbackLast.siguienteNumero) {
          numeroDocumentoFinal = fallbackLast.siguienteNumero;
          payload.documentoElectronico.encabezado.identificacionDocumento.numeroDocumento = String(numeroDocumentoFinal);
        }
      }
      ({ res, resData } = await sendEmision(payload));
    }

    // Reintentar una vez con el siguiente correlativo real si /api/Emision devuelve código 201 (duplicado)
    if (!input.numeroDocumento && String(resData?.codigo) === '201') {
      const activeSerie = String(
        payload.documentoElectronico.encabezado.identificacionDocumento.serie ?? ''
      )
        .trim()
        .toUpperCase();
      const listRes = await listHkaAssignments({ tipoDocumento: tipoDoc, serie: activeSerie }, cfg);
      let maxNum = 0;
      if (listRes.success && Array.isArray(listRes.asignaciones)) {
        for (const it of listRes.asignaciones) {
          if (
            String(it.tipoDocumento || '').trim() === tipoDoc &&
            String(it.serie || '').trim().toUpperCase() === activeSerie
          ) {
            const n = Number(it.numeroDocumento);
            if (!isNaN(n) && n > maxNum) {
              maxNum = n;
            }
          }
        }
      }
      const nextNum = Math.max(maxNum, Number(numeroDocumentoFinal) || 0) + 1;
      numeroDocumentoFinal = String(nextNum);
      payload.documentoElectronico.encabezado.identificacionDocumento.numeroDocumento = numeroDocumentoFinal;
      ({ res, resData } = await sendEmision(payload));
    }

    const isSuccess = res.ok && String(resData?.codigo) === '200';
    const isDuplicate =
      String(resData?.codigo) === '201' ||
      String(resData?.codigo) === '99' ||
      String(resData?.mensaje || '').toLowerCase().includes('duplicado') ||
      String(resData?.mensaje || '').toLowerCase().includes('enviado previamente');

    if (isSuccess) {
      const activeSerie = String(
        resData?.resultado?.serie ??
        payload.documentoElectronico.encabezado.identificacionDocumento.serie ??
        ''
      )
        .trim()
        .toUpperCase();
      const cacheKey = `${baseUrl}__${tipoDoc}__${activeSerie}`;
      const emittedNum = Number(resData?.resultado?.numeroDocumento || numeroDocumentoFinal);
      if (!isNaN(emittedNum) && emittedNum > 0) {
        lastDocNumberCache.set(cacheKey, Math.max(emittedNum, lastDocNumberCache.get(cacheKey) || 0));
      }

      return {
        success: true,
        codigo: resData.codigo,
        mensaje: resData.mensaje || 'Documento emitido exitosamente ante The Factory HKA',
        validaciones: resData.validaciones || [],
        resultado: resData.resultado,
        requestPayload: payload,
        rawResponse: resData
      };
    } else {
      const formattedErr = formatHkaValidationErrors(resData?.validaciones, resData?.mensaje);
      return {
        success: false,
        codigo: resData?.codigo || res.status,
        mensaje: resData?.mensaje || res.statusText || 'Error al emitir documento en The Factory HKA',
        errorMessageFormatted: formattedErr,
        isDuplicate,
        validaciones: resData?.validaciones || [],
        resultado: resData?.resultado,
        requestPayload: payload,
        rawResponse: resData
      };
    }
  } catch (err: any) {
    return {
      success: false,
      codigo: 500,
      mensaje: `Fallo de comunicación con ${url}: ${err.message}`,
      errorMessageFormatted: `Error de red con servidor HKA: ${err.message}`,
      requestPayload: payload
    };
  }
}

/**
 * Descarga cualquier formato oficial de una factura emitida en HKA: POST /api/DescargaArchivo
 * Soporta tipoArchivo: 'pdf' | 'json' | 'xml'
 */
export async function downloadHkaFile(
  tipoDocumento: string,
  serie: string,
  numeroDocumento: string,
  tipoArchivo: 'pdf' | 'json' | 'xml' = 'json',
  configOverride?: Partial<HkaConfig>
): Promise<{
  success: boolean;
  archivo?: string;
  decodedText?: string;
  decodedJson?: any;
  mensaje?: string;
}> {
  const cfg = configOverride ? { ...(await getHkaConfig()), ...configOverride } : await getHkaConfig();

  const auth = await authenticateHka(cfg);
  if (!auth.success || !auth.token) {
    return { success: false, mensaje: auth.mensaje };
  }

  const baseUrl = (cfg.base_url || 'https://demoemision.thefactoryhka.com.ve').replace(/\/+$/, '');
  const url = `${baseUrl}/api/DescargaArchivo`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${auth.token}`
      },
      body: JSON.stringify({
        tipoDocumento: String(tipoDocumento || '01'),
        serie: serie ?? '',
        numeroDocumento: String(numeroDocumento),
        tipoArchivo
      })
    });

    const data = await res.json().catch(() => null);
    if (res.ok && data?.archivo) {
      let decodedText: string | undefined;
      let decodedJson: any = undefined;

      if (tipoArchivo === 'json' || tipoArchivo === 'xml') {
        decodedText = Buffer.from(data.archivo, 'base64').toString('utf8');
        if (tipoArchivo === 'json') {
          try {
            decodedJson = JSON.parse(decodedText);
          } catch {
            decodedJson = null;
          }
        }
      }

      return {
        success: true,
        archivo: data.archivo,
        decodedText,
        decodedJson,
        mensaje: data.mensaje
      };
    }
    return {
      success: false,
      mensaje: data?.mensaje || `No se pudo obtener el archivo (${tipoArchivo}) del documento ${numeroDocumento}`
    };
  } catch (err: any) {
    return { success: false, mensaje: err.message };
  }
}

/**
 * Descarga el archivo PDF de una factura emitida: POST /api/DescargaArchivo
 */
export async function downloadInvoicePdf(
  tipoDocumento: string,
  serie: string,
  numeroDocumento: string,
  configOverride?: Partial<HkaConfig>
): Promise<{ success: boolean; archivo?: string; mensaje?: string }> {
  const res = await downloadHkaFile(tipoDocumento, serie, numeroDocumento, 'pdf', configOverride);
  return { success: res.success, archivo: res.archivo, mensaje: res.mensaje };
}

/**
 * Consulta el estado fiscal de un documento ante The Factory HKA: POST /api/EstadoDocumento
 */
export async function getHkaDocumentStatus(
  numeroDocumento: string | number,
  tipoDocumento = '01',
  serie = '',
  configOverride?: Partial<HkaConfig>
): Promise<{
  success: boolean;
  codigo?: string | number;
  mensaje?: string;
  estatus?: string;
  estado?: {
    estadoDocumento?: string;
    numeroControl?: string;
    fechaAsignacion?: string;
    horaAsignacion?: string;
    fechaAnulacion?: string;
    motivo?: string;
    urlConsulta?: string;
  };
  resultado?: any;
}> {
  const cfg = configOverride ? { ...(await getHkaConfig()), ...configOverride } : await getHkaConfig();

  const auth = await authenticateHka(cfg);
  if (!auth.success || !auth.token) {
    return {
      success: false,
      codigo: auth.codigo || 401,
      mensaje: `Fallo de autenticación HKA: ${auth.mensaje}`
    };
  }

  const baseUrl = (cfg.base_url || 'https://demoemision.thefactoryhka.com.ve').replace(/\/+$/, '');
  const url = `${baseUrl}/api/EstadoDocumento`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${auth.token}`
      },
      body: JSON.stringify({
        tipoDocumento,
        serie: serie ?? '',
        numeroDocumento: String(numeroDocumento)
      })
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = { raw: await res.text() };
    }

    const estadoObj = data?.estado || data?.resultado || null;
    return {
      success: res.ok && (data?.codigo === '200' || data?.codigo === 200),
      codigo: data?.codigo || res.status,
      mensaje: data?.mensaje || (res.ok ? 'Consulta exitosa' : 'Error en consulta'),
      estatus: estadoObj?.estadoDocumento || estadoObj?.estatus || estadoObj?.status,
      estado: estadoObj,
      resultado: estadoObj || data
    };
  } catch (err: any) {
    return {
      success: false,
      codigo: 500,
      mensaje: `Error al consultar estatus en HKA: ${err.message}`
    };
  }
}

export interface HkaAssignmentItem {
  serie: string;
  tipoDocumento: string;
  numeroDocumento: string;
  numeroControl: string;
  fechaAsignacion: string;
}

/**
 * Parsea fecha en formato YYYY-MM-DD o DD/MM/YYYY a Date local
 */
function parseFlexibleDate(str?: string): Date | null {
  if (!str) return null;
  const s = str.trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }
  const dmyMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmyMatch) {
    return new Date(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1]));
  }
  return null;
}

function toHkaDateString(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Lista todas las asignaciones de documentos emitidos en The Factory HKA: POST /api/ListadoAsignaciones
 * Soporta paginación automática y división en ventanas <= 28 días si se filtra por rango de fechas
 * (evitando el límite estricto de 30 días del API HKA V2).
 */
export async function listHkaAssignments(
  filters: {
    serie?: string;
    tipoDocumento?: string;
    numeroDocumentoInicio?: string | number;
    numeroDocumentoFin?: string | number;
    fechaInicio?: string; // YYYY-MM-DD o DD/MM/YYYY
    fechaFin?: string; // YYYY-MM-DD o DD/MM/YYYY
  } = {},
  configOverride?: Partial<HkaConfig>
): Promise<{
  success: boolean;
  total: number;
  asignaciones: HkaAssignmentItem[];
  mensaje?: string;
}> {
  const cfg = configOverride ? { ...(await getHkaConfig()), ...configOverride } : await getHkaConfig();

  const auth = await authenticateHka(cfg);
  if (!auth.success || !auth.token) {
    return {
      success: false,
      total: 0,
      asignaciones: [],
      mensaje: `Fallo de autenticación HKA: ${auth.mensaje}`
    };
  }

  const baseUrl = (cfg.base_url || 'https://demoemision.thefactoryhka.com.ve').replace(/\/+$/, '');
  const url = `${baseUrl}/api/ListadoAsignaciones`;

  const fetchWindow = async (windowBody: Record<string, any>): Promise<{ ok: boolean; items: HkaAssignmentItem[]; msg?: string }> => {
    const exactCacheKey = `${baseUrl}__${cfg.token_empresa}__${JSON.stringify({
      tipoDocumento: windowBody.tipoDocumento || '',
      serie: windowBody.serie || '',
      fechaInicio: windowBody.fechaInicio || '',
      fechaFin: windowBody.fechaFin || '',
      numeroDocumentoInicio: windowBody.numeroDocumentoInicio || '',
      numeroDocumentoFin: windowBody.numeroDocumentoFin || ''
    })}`;
    const broadRangeKey = `${baseUrl}__${cfg.token_empresa}__RANGE__${windowBody.fechaInicio || ''}__${windowBody.fechaFin || ''}__${windowBody.numeroDocumentoInicio || ''}__${windowBody.numeroDocumentoFin || ''}`;

    const collected: HkaAssignmentItem[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= 200) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          ...windowBody,
          numPagina: page
        })
      });

      const data = await res.json().catch(() => null);
      const hkaCode = String(data?.codigo ?? '').trim();
      const msg = String(data?.mensaje ?? '').trim();
      const msgLower = msg.toLowerCase();

      // Código 204 o "No se encontraron registros" no es un fallo fatal sino lista vacía legítima
      if (
        res.status === 404 ||
        hkaCode === '204' ||
        msgLower.includes('no se encontr') ||
        msgLower.includes('sin registros')
      ) {
        break;
      }

      // Código 99 ("Consulta realizada previamente, favor de intentarlo en 30 segundos"): usar caché vigente o reportar error
      if (
        hkaCode === '99' ||
        msgLower.includes('30 segundos') ||
        msgLower.includes('realizada previamente')
      ) {
        const now = Date.now();
        const exactEntry = assignmentsWindowCache.get(exactCacheKey);
        if (exactEntry && now - exactEntry.fetchedAt < ASSIGNMENTS_CACHE_TTL_MS) {
          return { ok: true, items: [...exactEntry.items] };
        }
        const broadEntry = assignmentsWindowCache.get(broadRangeKey);
        if (broadEntry && now - broadEntry.fetchedAt < ASSIGNMENTS_CACHE_TTL_MS) {
          const wantTipo = windowBody.tipoDocumento ? String(windowBody.tipoDocumento).trim() : '';
          const wantSerie =
            windowBody.serie !== undefined && windowBody.serie !== null
              ? String(windowBody.serie).trim().toUpperCase()
              : '';
          const filtered = broadEntry.items.filter((it) => {
            if (wantTipo && String(it.tipoDocumento || '').trim() !== wantTipo) return false;
            if (wantSerie && String(it.serie || '').trim().toUpperCase() !== wantSerie) return false;
            return true;
          });
          return { ok: true, items: filtered };
        }
        return {
          ok: false,
          items: [],
          msg: msg || 'The Factory HKA indicó esperar 30 segundos antes de repetir esta consulta.'
        };
      }

      if (!res.ok || (hkaCode && hkaCode !== '200')) {
        return {
          ok: false,
          items: collected,
          msg: msg || `Error HKA (código ${hkaCode || res.status}) en ListadoAsignaciones`
        };
      }

      if (Array.isArray(data?.asignaciones)) {
        for (const row of data.asignaciones) {
          collected.push({
            serie: String(row.serie ?? '').trim(),
            tipoDocumento: String(row.tipoDocumento ?? '01').trim(),
            numeroDocumento: String(row.numeroDocumento ?? '').trim(),
            numeroControl: String(row.numeroControl ?? '').trim(),
            fechaAsignacion: String(row.fechaAsignacion ?? '').trim()
          });
        }
      }

      totalPages = Math.max(1, Number(data?.totalPaginas || 1));
      page++;
    }

    const now = Date.now();
    assignmentsWindowCache.set(exactCacheKey, { items: [...collected], fetchedAt: now });
    if (!windowBody.tipoDocumento && !windowBody.serie) {
      assignmentsWindowCache.set(broadRangeKey, { items: [...collected], fetchedAt: now });
    }

    return { ok: true, items: collected };
  };

  try {
    const baseFilter: Record<string, any> = {};
    if (filters.serie !== undefined && filters.serie !== null && filters.serie !== '*') {
      // Si el usuario envía serie explícita (ej. "A"), filtramos; si la deja vacía o undefined, omitimos para traer todas las series
      if (filters.serie !== '') baseFilter.serie = filters.serie;
    }
    if (filters.tipoDocumento && filters.tipoDocumento !== 'ALL') {
      baseFilter.tipoDocumento = filters.tipoDocumento;
    }

    const dStart = parseFlexibleDate(filters.fechaInicio);
    const dEnd = parseFlexibleDate(filters.fechaFin);

    const allMap = new Map<string, HkaAssignmentItem>();

    if (dStart && dEnd && dStart <= dEnd) {
      // Dividir en bloques de 28 días para respetar el límite de 30 días de HKA
      let cursor = new Date(dStart.getTime());
      while (cursor <= dEnd) {
        const chunkEnd = new Date(cursor.getTime());
        chunkEnd.setDate(chunkEnd.getDate() + 27);
        const actualEnd = chunkEnd > dEnd ? dEnd : chunkEnd;

        const winBody: Record<string, any> = {
          ...baseFilter,
          fechaInicio: toHkaDateString(cursor),
          fechaFin: toHkaDateString(actualEnd)
        };
        if (filters.numeroDocumentoInicio) winBody.numeroDocumentoInicio = String(filters.numeroDocumentoInicio);
        if (filters.numeroDocumentoFin) winBody.numeroDocumentoFin = String(filters.numeroDocumentoFin);

        const winRes = await fetchWindow(winBody);
        if (!winRes.ok && allMap.size === 0) {
          return { success: false, total: 0, asignaciones: [], mensaje: winRes.msg };
        }
        for (const it of winRes.items) {
          allMap.set(`${it.tipoDocumento}__${it.serie}__${it.numeroDocumento}`, it);
        }

        cursor = new Date(actualEnd.getTime());
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      // Consulta completa por rango de número de documento (evita restricción de 30 días de fechas)
      const winBody: Record<string, any> = {
        ...baseFilter,
        numeroDocumentoInicio: String(filters.numeroDocumentoInicio || '1'),
        numeroDocumentoFin: String(filters.numeroDocumentoFin || '99999999')
      };
      const winRes = await fetchWindow(winBody);
      if (!winRes.ok) {
        return { success: false, total: 0, asignaciones: [], mensaje: winRes.msg };
      }
      for (const it of winRes.items) {
        allMap.set(`${it.tipoDocumento}__${it.serie}__${it.numeroDocumento}`, it);
      }
    }

    // Si el usuario filtró explícitamente por documentos sin serie (serie === ''), filtrar en memoria si se desea
    let finalList = Array.from(allMap.values());
    if (filters.numeroDocumentoInicio || filters.numeroDocumentoFin) {
      const minN = filters.numeroDocumentoInicio ? Number(filters.numeroDocumentoInicio) : null;
      const maxN = filters.numeroDocumentoFin ? Number(filters.numeroDocumentoFin) : null;
      finalList = finalList.filter((it) => {
        const n = Number(it.numeroDocumento);
        if (isNaN(n)) return true;
        if (minN !== null && !isNaN(minN) && n < minN) return false;
        if (maxN !== null && !isNaN(maxN) && n > maxN) return false;
        return true;
      });
    }

    // Ordenar por Número de Control (orden cronológico fiscal SENIAT)
    finalList.sort((a, b) => a.numeroControl.localeCompare(b.numeroControl, undefined, { numeric: true }));

    return {
      success: true,
      total: finalList.length,
      asignaciones: finalList,
      mensaje: `${finalList.length} documento(s) encontrado(s) en The Factory HKA.`
    };
  } catch (err: any) {
    return {
      success: false,
      total: 0,
      asignaciones: [],
      mensaje: `Error al listar asignaciones en HKA: ${err.message}`
    };
  }
}

/**
 * Adaptador universal: Convierte una factura de venta de Profit Plus (`saFacturaVenta` / `saDocumentoVenta`)
 * o factura de Sync2K en el payload requerido para emitir ante The Factory HKA.
 */
export function mapProfitInvoiceToHka(
  profitInvoice: {
    doc_num: string;
    fec_emis?: string;
    cliente: {
      rif?: string;
      cli_des?: string;
      direc1?: string;
      telefonos?: string;
      email?: string;
      tipo_per?: string;
    };
    renglones: Array<{
      co_art?: string;
      art_des: string;
      total_art: number;
      prec_vta: number;
      tipo_imp?: string; // '1' = 16%, '0' = Exento
      tasa_iva?: number;
      co_uni?: string;
    }>;
    forma_pago?: string;
    moneda?: string;
    serie?: string;
  }
): EmitInvoiceInput {
  const parsedId = parseClientCedula(profitInvoice.cliente?.rif, profitInvoice.cliente?.tipo_per);

  const items: InvoiceItemInput[] = (profitInvoice.renglones || []).map((reng) => {
    const isExento = reng.tipo_imp === '0' || reng.tasa_iva === 0;
    return {
      codigo: reng.co_art || 'SRV',
      descripcion: reng.art_des,
      cantidad: Number(reng.total_art || 1),
      precioUnitario: Number(reng.prec_vta || 0),
      tasaIVA: isExento ? 0 : Number(reng.tasa_iva ?? 16),
      codigoImpuesto: isExento ? 'E' : 'G',
      unidadMedida: reng.co_uni || 'UND'
    };
  });

  return {
    tipoDocumento: '01',
    serie: profitInvoice.serie,
    numeroDocumento: profitInvoice.doc_num,
    comprador: {
      tipoIdentificacion: parsedId.tipoIdentificacion,
      numeroIdentificacion: parsedId.numeroIdentificacion,
      razonSocial: profitInvoice.cliente?.cli_des || 'CLIENTE GENERAL',
      direccion: profitInvoice.cliente?.direc1 || 'CARACAS, VENEZUELA',
      pais: 'VE',
      telefono: profitInvoice.cliente?.telefonos || undefined,
      correo: profitInvoice.cliente?.email || undefined,
      notificar: profitInvoice.cliente?.email ? 'Si' : 'No'
    },
    items,
    moneda: profitInvoice.moneda || 'VES',
    tipoDePago: profitInvoice.forma_pago || '01',
    formaDePagoDescripcion: 'CONTADO / TRANSFERENCIA'
  };
}

