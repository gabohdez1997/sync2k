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
  serie_default: 'A',
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
    serie_default: String(opts.serie_default || DEFAULT_HKA_CONFIG.serie_default).trim(),
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
  tipoDocumento?: '01' | '02' | '03'; // '01' = Factura, '02' = Nota de Débito, '03' = Nota de Crédito
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
}

/**
 * Parsea y estandariza la cédula o RIF al formato exacto requerido por The Factory HKA
 */
export function parseClientCedula(
  cedulaOrRif?: string,
  tipoPersona?: string
): {
  tipoIdentificacion: 'V' | 'J' | 'G' | 'E' | 'P';
  numeroIdentificacion: string;
} {
  const clean = (cedulaOrRif || '').trim().toUpperCase();
  const match = clean.match(/^([VJGEP])[-_.\s]*([0-9]+)/);
  if (match) {
    return {
      tipoIdentificacion: match[1] as any,
      numeroIdentificacion: match[2]
    };
  }
  const digitsOnly = clean.replace(/[^0-9]/g, '');
  if (digitsOnly) {
    const isMoral = tipoPersona === 'moral' || tipoPersona === 'juridica';
    return {
      tipoIdentificacion: isMoral ? 'J' : 'V',
      numeroIdentificacion: digitsOnly
    };
  }
  return {
    tipoIdentificacion: 'V',
    numeroIdentificacion: '00000000'
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
 */
export async function getLastHkaDocumentNumber(
  tipoDocumento = '01',
  serie = '',
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
        serie: serie ?? (cfg.serie_default || '')
      })
    });

    let resData: any = null;
    try {
      resData = await res.json();
    } catch {
      resData = { raw: await res.text() };
    }

    if (res.ok && (resData?.codigo === '200' || resData?.codigo === 200) && resData?.numeroDocumento !== undefined) {
      const lastNum = Number(resData.numeroDocumento);
      const nextNum = String(lastNum + 1);
      return {
        success: true,
        numeroDocumento: lastNum,
        siguienteNumero: nextNum,
        codigo: resData.codigo,
        mensaje: resData.mensaje || 'Consulta realizada exitosamente'
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
  const serieFinal = input.serie !== undefined ? input.serie : (cfg.serie_default || '');

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
    const tasa = item.tasaIVA ?? 16;
    const baseItem = item.cantidad * item.precioUnitario;
    const isExento = item.codigoImpuesto === 'E' || tasa === 0;

    let itemIva = 0;
    if (isExento) {
      totalExento += baseItem;
    } else {
      itemIva = baseItem * (tasa / 100);
      totalGravado += baseItem;
      totalIva += itemIva;
    }

    const valorTotalItem = baseItem + itemIva;
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
      cantidad: Number(item.cantidad || 1).toFixed(2),
      unidadMedida: (item.unidadMedida || 'UND').trim().toUpperCase().slice(0, 10),
      precioUnitario: item.precioUnitario.toFixed(4),
      precioItem: baseItem.toFixed(2),
      codigoImpuesto: isExento ? 'E' : (item.codigoImpuesto || 'G').trim().toUpperCase(),
      tasaIVA: tasa.toFixed(2),
      valorIVA: itemIva.toFixed(2),
      valorTotalItem: valorTotalItem.toFixed(2)
    };
  });

  const subtotal = totalGravado + totalExento;
  const totalGeneral = subtotal + totalIva;

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

  const payload: any = {
    documentoElectronico: {
      encabezado: {
        identificacionDocumento: {
          tipoDocumento: input.tipoDocumento || '01',
          serie: serieFinal ? serieFinal.trim().toUpperCase() : '',
          numeroDocumento: String(numeroDocumentoFinal),
          tipoDeVenta: '01', // 01 = Interna (Requerido por HKA V2)
          tipoTransaccion: '01', // Venta
          fechaEmision,
          horaEmision,
          tipoDePago: input.tipoDePago || '01',
          moneda: (input.moneda || cfg.moneda_default || 'VES').trim().toUpperCase()
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
          impuestosSubtotal:
            totalGravado > 0
              ? [
                  {
                    codigoTotalImp: 'G',
                    alicuotaImp: '16.00',
                    baseImponibleImp: totalGravado.toFixed(2),
                    valorTotalImp: totalIva.toFixed(2)
                  }
                ]
              : [],
          formasPago: [
            {
              forma: '01',
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

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${auth.token}`
      },
      body: JSON.stringify(payload)
    });

    let resData: any = null;
    try {
      resData = await res.json();
    } catch {
      resData = { raw: await res.text() };
    }

    const isDuplicate =
      String(resData?.codigo) === '99' ||
      String(resData?.mensaje || '')
        .toLowerCase()
        .includes('enviado previamente');

    if (res.ok && (resData?.codigo === '200' || resData?.codigo === 200 || resData?.resultado)) {
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
 * Descarga el archivo PDF de una factura emitida: POST /api/DescargaArchivo
 */
export async function downloadInvoicePdf(
  tipoDocumento: string,
  serie: string,
  numeroDocumento: string,
  configOverride?: Partial<HkaConfig>
): Promise<{ success: boolean; archivo?: string; mensaje?: string }> {
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
        tipoDocumento,
        serie,
        numeroDocumento,
        tipoArchivo: 'pdf'
      })
    });

    const data = await res.json();
    if (res.ok && data?.archivo) {
      return { success: true, archivo: data.archivo, mensaje: data.mensaje };
    }
    return { success: false, mensaje: data?.mensaje || 'No se pudo obtener el PDF del documento' };
  } catch (err: any) {
    return { success: false, mensaje: err.message };
  }
}

/**
 * Consulta el estado fiscal de un documento ante The Factory HKA: POST /api/EstatusDocumento
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
  const url = `${baseUrl}/api/EstatusDocumento`;

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
        serie: serie ?? (cfg.serie_default || ''),
        numeroDocumento: String(numeroDocumento)
      })
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = { raw: await res.text() };
    }

    return {
      success: res.ok && (data?.codigo === '200' || data?.codigo === 200),
      codigo: data?.codigo || res.status,
      mensaje: data?.mensaje || (res.ok ? 'Consulta exitosa' : 'Error en consulta'),
      estatus: data?.resultado?.estatus || data?.resultado?.status,
      resultado: data?.resultado || data
    };
  } catch (err: any) {
    return {
      success: false,
      codigo: 500,
      mensaje: `Error al consultar estatus en HKA: ${err.message}`
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
