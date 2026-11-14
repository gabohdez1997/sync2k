// src/lib/server/services/bancaribe.ts
// Conector oficial Bancaribe Open Banking (WSO2 API Manager)
// Implementa los 9 manuales técnicos oficiales de Bancaribe:
//   1. Autenticación OAuth2 API Manager (/token)
//   2. API Consulta Tasas BCV (/consultaTasaBCV/1.0.0/consultaTasa/tasa)
//   3. API Consulta Últimos Movimientos (/MovimientoCuentas/1.0.0/ctasMovimientos)
//   4. API Extracto Bancario (/Ctas/ExtractoCuentas/1.0.0/api/transactions/{fetch,summary,verify})
//   5. API Consulta de Operaciones Plus (/B2P/1.0.0/consulta-operacion)
//   6. API Listar Bancos Activos (/ListarBanco/1.0.0/listarBancosApi)
//   7. API Pago Móvil Comercio C2P (/C2P/1.0.0/registrarPagoC2pApi y registrarPagoS7bApi)
//   8. API Pago a Personas B2P / Vuelto (/PaP/1.0.0/sendPaymentB2P)
//   9. API Transferencia Inmediata CRIN / TER (/transferencia_inmediata/1.0.0/*)
//  10. API Cobranza Digital SIMF / DBIN (/DC/1.0.0/*)
//  11. Servicio de Notificaciones Webhook receptor (Authorization: ApiKey)

import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { getIntegration, saveIntegration, type IntegrationConfig } from '$lib/server/integrations';

export interface BancaribeConfig {
  id: 'bancaribe';
  provider: 'bancaribe';
  environment: 'sandbox' | 'production';
  base_url: string;
  token_url: string;
  is_active: boolean;
  // Credenciales
  consumer_key: string;
  consumer_secret: string;
  hash: string;
  x_api_key: string;
  webhook_api_key: string;
  // Parámetros del comercio y cuenta
  rif: string;
  nombre_comercio: string;
  numero_cuenta: string;
  telefono_comercio: string;
  ip_origen: string;
  terminal: string;
  tipo_terminal: string;
  caja_terminal: number;
  canal_virtual: number;
  sucursal: number;
  oficina: number;
  vendedor: number;
  codigo_moneda: number;
  contrato_cobranza: string;
  allow_self_signed: boolean;
}

export const DEFAULT_BANCARIBE_CONFIG: BancaribeConfig = {
  id: 'bancaribe',
  provider: 'bancaribe',
  environment: 'sandbox',
  base_url: 'https://bcapidesa-bancaribe365.msappproxy.net',
  token_url: 'https://bcapidesa-bancaribe365.msappproxy.net/token',
  is_active: false,
  consumer_key: '',
  consumer_secret: '',
  hash: '',
  x_api_key: '',
  webhook_api_key: '',
  rif: 'J401750354',
  nombre_comercio: 'INVERSIONES GALPE, C.A',
  numero_cuenta: '',
  telefono_comercio: '',
  ip_origen: '10.10.0.1',
  terminal: 'WEB01',
  tipo_terminal: 'WEB',
  caja_terminal: 1,
  canal_virtual: 1,
  sucursal: 1,
  oficina: 800,
  vendedor: 1,
  codigo_moneda: 928,
  contrato_cobranza: '1',
  allow_self_signed: true
};

export interface BancaribeBankItem {
  codigo: string;
  descripcion: string;
}

export interface BancaribeNotificationRecord {
  id: string;
  receivedAt: string;
  sourceIp?: string;
  amount: number;
  bankName: string;
  clientPhone: string;
  commercePhone: string;
  creditorAccount: string;
  currencyCode: string;
  date: string;
  debtorAccount: string;
  debtorID: string;
  destinyBankReference: string;
  originBankCode: string;
  originBankReference: string;
  paymentType: string;
  time: string;
  Udf1?: string;
  Udf2?: string;
  Udf3?: string;
  rawPayload?: any;
}

export interface BancaribeApiResult<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  latencyMs: number;
  endpoint?: string;
  data?: T;
  raw?: any;
  errorCode?: string | number;
}

// =========================================================================
// DICCIONARIO DE CÓDIGOS DE ERROR OFICIALES (APIM, SUICHE 7B, BCV, CORE)
// =========================================================================

const BANCARIBE_ERROR_CODES: Record<string, string> = {
  // OAuth2 / WSO2 API Manager
  '900900': 'Token OAuth2 inválido o faltan parámetros de autenticación.',
  '900901': 'Credenciales inválidas (Access Token inválido). Se renovará el token.',
  '900902': 'Falta cabecera Authorization Bearer o el token ha expirado.',
  '900903': 'Credenciales expiradas.',
  '900904': 'Token de acceso inactivo.',
  '900905': 'Token de acceso faltante.',
  '900906': 'Credenciales inválidas para acceder a este API/recurso (verifique suscripción en WSO2).',
  '900907': 'Acceso bloqueado temporalmente al recurso.',
  '900908': 'Recurso prohibido: suscripción inactiva o no autorizada.',
  '900910': 'Token de acceso revocado o expirado.',
  // Core / Suiche 7B / C2P / B2P / CRIN / DBIN
  '0': 'Transacción o consulta procesada exitosamente.',
  '0000': 'Transacción aceptada.',
  '6': 'Error de formato en los datos suministrados.',
  '8': 'Monto inválido o igual a cero.',
  '12': 'Transacción inválida o no permitida para el comercio/cuenta.',
  '13': 'Monto inválido o excede los límites configurados.',
  '14': 'Número de cuenta, teléfono o tarjeta inválido.',
  '15': 'Banco emisor o destino no existe o no está habilitado en el servicio.',
  '30': 'Error de formato en la trama enviada.',
  '41': 'Instrumento o usuario bloqueado / extraviado.',
  '48': 'Cédula / RIF / Identificación incorrecta o no coincide con el titular.',
  '50': 'Operación rechazada por validación de seguridad / OTP.',
  '51': 'Fondos insuficientes en la cuenta pagadora.',
  '52': 'Cuenta corriente no asociada o no pertenece al cliente.',
  '55': 'Clave dinámica (OTP) incorrecta o expirada.',
  '56': 'Cliente o teléfono no afiliado al servicio Pago Móvil / Cobranza.',
  '57': 'Transacción no permitida al titular / instrumento.',
  '58': 'Transacción no permitida al comercio / terminal.',
  '61': 'Monto excede el límite diario permitido por operación.',
  '62': 'Cuenta restringida o inactiva.',
  '65': 'Excede límite de frecuencia de transacciones.',
  '68': 'Timeout: el banco receptor no respondió a tiempo.',
  '77': 'Parámetros de identificación / contrato inválidos o no coinciden.',
  '80': 'Fecha de transacción inválida.',
  '82': 'Teléfono celular no coincide con el registrado en el banco.',
  '83': 'Cuenta destino o de crédito no válida.',
  '89': 'Identificador de terminal o comercio inválido.',
  '90': 'Proceso de cierre bancario en ejecución, intente en unos minutos.',
  '91': 'Banco receptor o switch interbancario fuera de línea temporalmente.',
  '92': 'Banco destino no disponible en la red en este momento.',
  '96': 'Error interno de sistema en la plataforma bancaria.',
  '99': 'Error general o de comunicación con el procesador.',
  '145': 'Operación no encontrada o fuera del rango de consulta.',
  '9001': 'Servicio no disponible temporalmente.',
  '40004': 'No se encontraron registros para los criterios indicados.',
  '101122': 'Comercio / Hash no autorizado o parámetro de afiliación incorrecto.',
  '1804017': 'Cuenta no autorizada o inválida para el RIF suministrado.',
  // Códigos ISO 20022 / BCV
  'ACCP': 'Transacción aceptada y acreditada (ACCP).',
  'RJCT': 'Transacción rechazada por el banco receptor / BCV (RJCT).',
  'AG01': 'Transacción prohibida para el tipo de cuenta.',
  'AC01': 'Número de cuenta incorrecto.',
  'AC04': 'Cuenta cerrada.',
  'AM04': 'Fondos insuficientes.',
  'BE01': 'Identificación del titular no corresponde con la cuenta.',
  'MD01': 'No existe mandato/autorización de cobro válida.',
  'TM01': 'Tiempo límite de validación expirado.',
  'DUPL': 'Operación duplicada.',
  'TECH': 'Error técnico en el procesamiento interbancario.'
};

export function describeBancaribeCode(code: string | number | undefined | null, fallbackMsg?: string): string {
  if (code !== undefined && code !== null && String(code).trim() !== '') {
    const key = String(code).trim();
    const mapped = BANCARIBE_ERROR_CODES[key];
    if (mapped) {
      return fallbackMsg && !mapped.toLowerCase().includes(fallbackMsg.toLowerCase())
        ? `${mapped} (${fallbackMsg})`
        : mapped;
    }
  }
  return fallbackMsg || 'Respuesta recibida desde Bancaribe Open Banking.';
}

// =========================================================================
// CATÁLOGO DE BANCOS SUDEBAN (RESPALDO Y ENRIQUECIMIENTO)
// =========================================================================

export const FALLBACK_VENEZUELAN_BANKS: BancaribeBankItem[] = [
  { codigo: '0114', descripcion: 'BANCARIBE' },
  { codigo: '0102', descripcion: 'BANCO DE VENEZUELA' },
  { codigo: '0105', descripcion: 'BANCO MERCANTIL' },
  { codigo: '0134', descripcion: 'BANESCO BANCO UNIVERSAL' },
  { codigo: '0108', descripcion: 'BANCO PROVINCIAL' },
  { codigo: '0191', descripcion: 'BANCO NACIONAL DE CREDITO (BNC)' },
  { codigo: '0172', descripcion: 'BANCAMIGA BANCO MICROFINANCIERO' },
  { codigo: '0174', descripcion: 'BANPLUS BANCO UNIVERSAL' },
  { codigo: '0115', descripcion: 'BANCO EXTERIOR' },
  { codigo: '0156', descripcion: '100% BANCO' },
  { codigo: '0163', descripcion: 'BANCO DEL TESORO' },
  { codigo: '0138', descripcion: 'BANCO PLAZA' },
  { codigo: '0168', descripcion: 'BANCRECER' },
  { codigo: '0177', descripcion: 'BANFANB' },
  { codigo: '0171', descripcion: 'BANCO ACTIVO' },
  { codigo: '0128', descripcion: 'BANCO CARONI' },
  { codigo: '0137', descripcion: 'BANCO SOFITASA' },
  { codigo: '0104', descripcion: 'VENEZOLANO DE CREDITO' },
  { codigo: '0151', descripcion: 'BFC BANCO FONDO COMUN' },
  { codigo: '0157', descripcion: 'DELSUR BANCO UNIVERSAL' },
  { codigo: '0166', descripcion: 'BANCO AGRICOLA DE VENEZUELA' },
  { codigo: '0169', descripcion: 'R4 BANCO MICROFINANCIERO (MI BANCO)' },
  { codigo: '0175', descripcion: 'BANCO BICENTENARIO' },
  { codigo: '0178', descripcion: 'N58 BANCO DIGITAL' }
];

// =========================================================================
// CACHÉS EN MEMORIA (TOKEN OAUTH2 Y LISTA DE BANCOS)
// =========================================================================

interface TokenCacheEntry {
  accessToken: string;
  expiresAtMs: number;
  scope?: string;
  cacheKey: string;
}

let cachedToken: TokenCacheEntry | null = null;

interface BanksCacheEntry {
  banks: BancaribeBankItem[];
  expiresAtMs: number;
}

const banksCache = new Map<string, BanksCacheEntry>();
const BANKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas recomendado por Bancaribe

// Persistencia de notificaciones recibidas vía Webhook
const LOCAL_DATA_DIR = path.resolve('data');
const NOTIFICATIONS_FILE = path.join(LOCAL_DATA_DIR, 'bancaribe_notifications.json');
let notificationsMemoryCache: BancaribeNotificationRecord[] | null = null;

// =========================================================================
// UTILIDADES DE NORMALIZACIÓN Y FECHAS
// =========================================================================

export function normalizeRif(raw?: string | null): string {
  if (!raw) return '';
  return String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

export function normalizePhoneVe(raw?: string | null): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('0058') && digits.length >= 14) {
    return '0' + digits.slice(4);
  }
  if (digits.startsWith('58') && digits.length >= 12) {
    return '0' + digits.slice(2);
  }
  if (!digits.startsWith('0') && digits.length === 10) {
    return '0' + digits;
  }
  return digits;
}

export function normalizeBankCode(raw?: string | null): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  return digits.padStart(4, '0').slice(-4);
}

export function toIsoDate(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // DD/MM/YYYY o DD-MM-YYYY
  const dmy = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return trimmed;
}

export function toDdMmYyyy(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed;
  // YYYY-MM-DD -> DD/MM/YYYY
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return trimmed;
}

export function toMmDdYyyy(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return trimmed;
  // YYYY-MM-DD -> MM/DD/YYYY (requerido por Consulta Operaciones Plus)
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return trimmed;
}

// =========================================================================
// LECTURA Y GUARDADO DE CONFIGURACIÓN
// =========================================================================

export async function getBancaribeConfig(fetchFn?: typeof fetch): Promise<BancaribeConfig> {
  const integration = await getIntegration('bancaribe', fetchFn);
  if (!integration) {
    return { ...DEFAULT_BANCARIBE_CONFIG };
  }
  return mapIntegrationToBancaribeConfig(integration);
}

export function mapIntegrationToBancaribeConfig(integration: IntegrationConfig): BancaribeConfig {
  const creds = integration.credentials || {};
  const opts = integration.options || {};
  const baseUrl = String(integration.base_url || DEFAULT_BANCARIBE_CONFIG.base_url)
    .trim()
    .replace(/\/+$/, '');
  const defaultTokenUrl = `${baseUrl}/token`;

  return {
    id: 'bancaribe',
    provider: 'bancaribe',
    environment: integration.environment === 'production' ? 'production' : 'sandbox',
    base_url: baseUrl,
    token_url: String(opts.token_url || defaultTokenUrl).trim().replace(/\/+$/, ''),
    is_active: Boolean(integration.is_active),
    consumer_key: String(creds.consumer_key || '').trim(),
    consumer_secret: String(creds.consumer_secret || '').trim(),
    hash: String(creds.hash || '').trim(),
    x_api_key: String(creds.x_api_key || '').trim(),
    webhook_api_key: String(creds.webhook_api_key || '').trim(),
    rif: normalizeRif(opts.rif || DEFAULT_BANCARIBE_CONFIG.rif),
    nombre_comercio: String(opts.nombre_comercio || DEFAULT_BANCARIBE_CONFIG.nombre_comercio).trim(),
    numero_cuenta: String(opts.numero_cuenta || '').replace(/\D/g, ''),
    telefono_comercio: normalizePhoneVe(opts.telefono_comercio || ''),
    ip_origen: String(opts.ip_origen || DEFAULT_BANCARIBE_CONFIG.ip_origen).trim(),
    terminal: String(opts.terminal || DEFAULT_BANCARIBE_CONFIG.terminal).trim(),
    tipo_terminal: String(opts.tipo_terminal || DEFAULT_BANCARIBE_CONFIG.tipo_terminal).trim(),
    caja_terminal: Number(opts.caja_terminal ?? DEFAULT_BANCARIBE_CONFIG.caja_terminal),
    canal_virtual: Number(opts.canal_virtual ?? DEFAULT_BANCARIBE_CONFIG.canal_virtual),
    sucursal: Number(opts.sucursal ?? DEFAULT_BANCARIBE_CONFIG.sucursal),
    oficina: Number(opts.oficina ?? DEFAULT_BANCARIBE_CONFIG.oficina),
    vendedor: Number(opts.vendedor ?? DEFAULT_BANCARIBE_CONFIG.vendedor),
    codigo_moneda: Number(opts.codigo_moneda ?? DEFAULT_BANCARIBE_CONFIG.codigo_moneda),
    contrato_cobranza: String(opts.contrato_cobranza || DEFAULT_BANCARIBE_CONFIG.contrato_cobranza).trim(),
    allow_self_signed: opts.allow_self_signed !== undefined ? Boolean(opts.allow_self_signed) : true
  };
}

// =========================================================================
// TRANSPORTE HTTP/HTTPS CON SOPORTE DE CERTIFICADOS AUTOFIRMADOS (QA/DESA)
// =========================================================================

interface RawHttpResponse {
  ok: boolean;
  status: number;
  statusText: string;
  bodyText: string;
  json: any;
}

async function performBancaribeHttp(
  urlStr: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  body: string | undefined,
  allowSelfSigned: boolean,
  timeoutMs = 30000
): Promise<RawHttpResponse> {
  // En entornos Node cuando allowSelfSigned está activo y es HTTPS, usamos node:https
  // para tolerar certificados autofirmados (tpr.bancaribe / openbanking-desa) sin alterar TLS global.
  if (allowSelfSigned && urlStr.startsWith('https://')) {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(urlStr);
        const isHttps = parsed.protocol === 'https:';
        const mod = isHttps ? https : http;

        const req = mod.request(
          {
            hostname: parsed.hostname,
            port: parsed.port ? Number(parsed.port) : isHttps ? 443 : 80,
            path: parsed.pathname + parsed.search,
            method,
            headers: {
              ...headers,
              ...(body ? { 'Content-Length': Buffer.byteLength(body, 'utf-8').toString() } : {})
            },
            timeout: timeoutMs,
            ...(isHttps ? { rejectUnauthorized: false } : {})
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            res.on('end', () => {
              const bodyText = Buffer.concat(chunks).toString('utf-8');
              const status = res.statusCode || 500;
              let parsedJson: any = null;
              try {
                parsedJson = bodyText ? JSON.parse(bodyText) : null;
              } catch {
                parsedJson = null;
              }
              resolve({
                ok: status >= 200 && status < 300,
                status,
                statusText: res.statusMessage || '',
                bodyText,
                json: parsedJson
              });
            });
          }
        );

        req.on('timeout', () => {
          req.destroy(new Error(`Timeout de conexión (${timeoutMs}ms) hacia Bancaribe.`));
        });
        req.on('error', (err) => reject(err));
        if (body) req.write(body);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(urlStr, {
      method,
      headers,
      body,
      signal: controller.signal
    });
    const bodyText = await res.text();
    let parsedJson: any = null;
    try {
      parsedJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      parsedJson = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      bodyText,
      json: parsedJson
    };
  } finally {
    clearTimeout(timer);
  }
}

// =========================================================================
// 1. AUTENTICACIÓN OAUTH2 WSO2 API MANAGER
// =========================================================================

export function invalidateBancaribeToken() {
  cachedToken = null;
}

export async function getBancaribeAccessToken(
  options?: {
    forceRefresh?: boolean;
    configOverride?: Partial<BancaribeConfig>;
    fetchFn?: typeof fetch;
  }
): Promise<{
  success: boolean;
  accessToken?: string;
  expiresIn?: number;
  scope?: string;
  statusCode: number;
  message: string;
  latencyMs: number;
  raw?: any;
}> {
  const start = Date.now();
  const baseConfig = await getBancaribeConfig(options?.fetchFn);
  const cfg: BancaribeConfig = { ...baseConfig, ...(options?.configOverride || {}) };

  if (!cfg.consumer_key || !cfg.consumer_secret) {
    return {
      success: false,
      statusCode: 400,
      message: 'Consumer Key y Consumer Secret de Bancaribe Open Banking son obligatorios.',
      latencyMs: Date.now() - start
    };
  }

  const cacheKey = `${cfg.token_url}::${cfg.consumer_key}`;
  if (
    !options?.forceRefresh &&
    cachedToken &&
    cachedToken.cacheKey === cacheKey &&
    cachedToken.expiresAtMs > Date.now() + 60_000
  ) {
    return {
      success: true,
      accessToken: cachedToken.accessToken,
      scope: cachedToken.scope,
      statusCode: 200,
      message: 'Token OAuth2 obtenido desde caché en memoria.',
      latencyMs: 0
    };
  }

  const basicAuth = Buffer.from(`${cfg.consumer_key}:${cfg.consumer_secret}`, 'utf-8').toString('base64');
  const tokenUrl = cfg.token_url || `${cfg.base_url}/token`;

  try {
    const res = await performBancaribeHttp(
      tokenUrl,
      'POST',
      {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      'grant_type=client_credentials',
      cfg.allow_self_signed,
      20000
    );

    const latencyMs = Date.now() - start;
    const data = res.json;

    if (res.ok && data?.access_token) {
      const expiresIn = Number(data.expires_in || 3600);
      cachedToken = {
        accessToken: String(data.access_token),
        scope: data.scope,
        expiresAtMs: Date.now() + expiresIn * 1000,
        cacheKey
      };
      return {
        success: true,
        accessToken: cachedToken.accessToken,
        expiresIn,
        scope: data.scope,
        statusCode: res.status,
        message: `Autenticación OAuth2 exitosa con Bancaribe (Token válido por ${expiresIn}s).`,
        latencyMs,
        raw: data
      };
    }

    const errDesc =
      data?.error_description ||
      data?.fault?.message ||
      data?.message ||
      data?.error ||
      res.statusText ||
      'Credenciales OAuth2 rechazadas por Bancaribe API Manager.';

    return {
      success: false,
      statusCode: res.status,
      message: errDesc,
      latencyMs,
      raw: data || res.bodyText
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Fallo de red hacia Bancaribe OAuth2 (${tokenUrl}): ${err.message}`,
      latencyMs: Date.now() - start
    };
  }
}

export async function testBancaribeConnection(
  integration: IntegrationConfig,
  credentialsOverride?: Record<string, any>,
  fetchFn?: typeof fetch
): Promise<{
  success: boolean;
  statusCode: number;
  message: string;
  latencyMs: number;
  details?: any;
}> {
  const mergedConfig: IntegrationConfig = {
    ...integration,
    credentials: { ...(integration.credentials || {}), ...(credentialsOverride || {}) }
  };
  const cfg = mapIntegrationToBancaribeConfig(mergedConfig);
  const now = new Date().toISOString();

  const authRes = await getBancaribeAccessToken({
    forceRefresh: true,
    configOverride: cfg,
    fetchFn
  });

  if (authRes.success && authRes.accessToken) {
    await saveIntegration(
      'bancaribe',
      {
        last_tested_at: now,
        last_test_status: 'success',
        last_test_message: authRes.message
      },
      fetchFn
    );
    return {
      success: true,
      statusCode: authRes.statusCode,
      message: authRes.message,
      latencyMs: authRes.latencyMs,
      details: {
        tokenPreview: `${authRes.accessToken.slice(0, 12)}...`,
        expiresIn: authRes.expiresIn,
        scope: authRes.scope,
        environment: cfg.environment
      }
    };
  }

  await saveIntegration(
    'bancaribe',
    {
      last_tested_at: now,
      last_test_status: 'failed',
      last_test_message: authRes.message
    },
    fetchFn
  );

  return {
    success: false,
    statusCode: authRes.statusCode,
    message: authRes.message,
    latencyMs: authRes.latencyMs,
    details: authRes.raw
  };
}

/**
 * Ejecuta una llamada autenticada a un endpoint Bancaribe WSO2 con renovación automática de token ante 401.
 */
async function callBancaribeEndpoint<T = any>(
  endpointPath: string,
  payloadBuilder: (accessToken: string, cfg: BancaribeConfig) => any,
  options?: {
    extraHeaders?: (cfg: BancaribeConfig) => Record<string, string>;
    fetchFn?: typeof fetch;
    timeoutMs?: number;
  }
): Promise<{
  cfg: BancaribeConfig;
  accessToken?: string;
  url: string;
  res?: RawHttpResponse;
  latencyMs: number;
  authError?: string;
  authStatusCode?: number;
}> {
  const start = Date.now();
  const cfg = await getBancaribeConfig(options?.fetchFn);
  const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  const url = `${cfg.base_url}${cleanPath}`;

  let tokenRes = await getBancaribeAccessToken({ configOverride: cfg, fetchFn: options?.fetchFn });
  if (!tokenRes.success || !tokenRes.accessToken) {
    return {
      cfg,
      url,
      latencyMs: Date.now() - start,
      authError: tokenRes.message,
      authStatusCode: tokenRes.statusCode
    };
  }

  const executeAttempt = async (token: string): Promise<RawHttpResponse> => {
    const bodyObj = payloadBuilder(token, cfg);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options?.extraHeaders ? options.extraHeaders(cfg) : {})
    };
    return performBancaribeHttp(
      url,
      'POST',
      headers,
      JSON.stringify(bodyObj),
      cfg.allow_self_signed,
      options?.timeoutMs || 35000
    );
  };

  let res = await executeAttempt(tokenRes.accessToken);

  // Reintentar una vez renovando el token si API Manager responde 401 o 900901/900902/900910
  const faultCode = String(res.json?.fault?.code || res.json?.code || '');
  if (res.status === 401 || ['900901', '900902', '900910'].includes(faultCode)) {
    invalidateBancaribeToken();
    const retryAuth = await getBancaribeAccessToken({
      forceRefresh: true,
      configOverride: cfg,
      fetchFn: options?.fetchFn
    });
    if (retryAuth.success && retryAuth.accessToken) {
      tokenRes = retryAuth;
      res = await executeAttempt(retryAuth.accessToken);
    }
  }

  return {
    cfg,
    accessToken: tokenRes.accessToken,
    url,
    res,
    latencyMs: Date.now() - start
  };
}

function extractFaultError(res: RawHttpResponse): { code?: string; message?: string } | null {
  const j = res.json;
  if (!j) {
    if (!res.ok) {
      return {
        code: String(res.status),
        message: res.bodyText?.slice(0, 300) || res.statusText || `Error HTTP ${res.status}`
      };
    }
    return null;
  }
  if (j.fault) {
    const c = j.fault.code ? String(j.fault.code) : undefined;
    return {
      code: c,
      message: describeBancaribeCode(c, j.fault.description || j.fault.message)
    };
  }
  return null;
}

// =========================================================================
// 2. API CONSULTA TASAS BCV
//    Endpoint: POST /consultaTasaBCV/1.0.0/consultaTasa/tasa
// =========================================================================

export type TasaBcvId = '' | 'TACOMPDOLAR' | 'TAVENTDOLAR' | 'TACOMPEURO' | 'TAVENTEURO';

export interface ConsultarTasasBcvParams {
  hash?: string;
  idTasa?: TasaBcvId | string;
  cedulaRif?: string;
  fechaInicio?: string; // "" para tasa del día, o DD/MM/AAAA o YYYY-MM-DD (hasta 6 meses)
  fechaFin?: string;    // "" para tasa del día, o DD/MM/AAAA o YYYY-MM-DD
}

export async function consultarTasasBcv(
  params: ConsultarTasasBcvParams = {},
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const exec = await callBancaribeEndpoint(
      '/consultaTasaBCV/1.0.0/consultaTasa/tasa',
      (_token, cfg) => ({
        hash: params.hash || cfg.hash,
        idTasa: params.idTasa ?? '',
        cedulaRif: normalizeRif(params.cedulaRif || cfg.rif),
        fechaInicio: toDdMmYyyy(params.fechaInicio || ''),
        fechaFin: toDdMmYyyy(params.fechaFin || '')
      }),
      { fetchFn }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'No se pudo autenticar contra Bancaribe.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error consultando Tasas BCV.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const errCode = raw.errorConsulta?.codigoError;
    const isOk = exec.res.ok && (errCode === undefined || String(errCode) === '0');
    const actuales = Array.isArray(raw.listTasasActuales) ? raw.listTasasActuales : [];
    const historico = Array.isArray(raw.listTasaHistorico) ? raw.listTasaHistorico : [];

    return {
      success: isOk,
      statusCode: exec.res.status,
      errorCode: errCode,
      message: isOk
        ? `Consulta Tasas BCV exitosa (${actuales.length} actuales, ${historico.length} históricos).`
        : describeBancaribeCode(errCode, raw.errorConsulta?.descripcionError || raw.message),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: {
        tasasActuales: actuales,
        tasasHistorico: historico,
        errorConsulta: raw.errorConsulta || null
      },
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error de comunicación en Consulta Tasas BCV: ${err.message}`,
      latencyMs: 0
    };
  }
}

// =========================================================================
// 3. API CONSULTA ÚLTIMOS MOVIMIENTOS
//    Endpoint: POST /MovimientoCuentas/1.0.0/ctasMovimientos
// =========================================================================

export interface ConsultarUltimosMovimientosParams {
  clienteHash?: string;
  clienteRIF?: string;
  fechaDesde?: string; // YYYY-MM-DD (por defecto últimos 7 días o mes en curso)
  fechaHasta?: string; // YYYY-MM-DD
  ip?: string;
  numeroCuenta?: string;
  page?: number;
  size?: number;
}

export async function consultarUltimosMovimientos(
  params: ConsultarUltimosMovimientosParams = {},
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const exec = await callBancaribeEndpoint(
      '/MovimientoCuentas/1.0.0/ctasMovimientos',
      (_token, cfg) => ({
        clienteHash: params.clienteHash || cfg.hash,
        clienteRIF: normalizeRif(params.clienteRIF || cfg.rif),
        fechaDesde: toIsoDate(params.fechaDesde || todayIso),
        fechaHasta: toIsoDate(params.fechaHasta || todayIso),
        ip: params.ip || cfg.ip_origen || '10.10.0.1',
        numeroCuenta: String(params.numeroCuenta || cfg.numero_cuenta).replace(/\D/g, ''),
        page: Number(params.page || 1),
        size: Number(params.size || 20)
      }),
      { fetchFn }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'No se pudo autenticar contra Bancaribe.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error consultando últimos movimientos.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const movimientos = Array.isArray(raw.movimiento) ? raw.movimiento : [];
    const paginacion = raw.paginacion || null;
    const isOk = exec.res.ok && (raw.codigoError === undefined || Number(raw.codigoError) === 0);

    return {
      success: isOk,
      statusCode: exec.res.status,
      errorCode: raw.codigoError,
      message: isOk
        ? `Movimientos consultados exitosamente (${movimientos.length} registro(s) en página).`
        : describeBancaribeCode(raw.codigoError, raw.descripcionError || raw.message || 'Error en consulta de movimientos'),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: {
        movimientos,
        paginacion
      },
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error en Consulta Últimos Movimientos: ${err.message}`,
      latencyMs: 0
    };
  }
}

// =========================================================================
// 4. API EXTRACTO BANCARIO
//    Requiere cabeceras adicionales: X-API-Key y X-Customer-ID
//    Endpoints:
//      POST /Ctas/ExtractoCuentas/1.0.0/api/transactions/fetch
//      POST /Ctas/ExtractoCuentas/1.0.0/api/transactions/summary
//      POST /Ctas/ExtractoCuentas/1.0.0/api/transactions/verify
// =========================================================================

function buildExtractoHeaders(cfg: BancaribeConfig, hashOverride?: string, xApiKeyOverride?: string): Record<string, string> {
  return {
    'X-API-Key': xApiKeyOverride || cfg.x_api_key || '',
    'X-Customer-ID': hashOverride || cfg.hash || ''
  };
}

export interface ExtractoHistoricoParams {
  account?: string;
  from: string; // YYYY-MM-DD (máx 3 meses)
  to: string;   // YYYY-MM-DD
  limit?: number;
  page?: number;
  rif?: string;
  hash?: string;
  xApiKey?: string;
}

export async function consultarExtractoHistorico(
  params: ExtractoHistoricoParams,
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const exec = await callBancaribeEndpoint(
      '/Ctas/ExtractoCuentas/1.0.0/api/transactions/fetch',
      (_token, cfg) => ({
        account: String(params.account || cfg.numero_cuenta).replace(/\D/g, ''),
        from: toIsoDate(params.from),
        to: toIsoDate(params.to),
        limit: Number(params.limit || 50),
        page: Number(params.page || 1),
        rif: normalizeRif(params.rif || cfg.rif)
      }),
      {
        extraHeaders: (cfg) => buildExtractoHeaders(cfg, params.hash, params.xApiKey),
        fetchFn
      }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'Fallo de autenticación OAuth2.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error consultando extracto histórico.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const transactions = Array.isArray(raw.data) ? raw.data : [];
    const statusCodeNum = Number(raw.statusCode ?? (exec.res.ok ? 0 : exec.res.status));
    const isOk = exec.res.ok && (statusCodeNum === 0 || String(raw.success).toLowerCase() === 'aprobada');

    return {
      success: isOk,
      statusCode: exec.res.status,
      errorCode: raw.statusCode,
      message: isOk
        ? `Extracto histórico obtenido (${transactions.length} transacciones).`
        : describeBancaribeCode(raw.statusCode, raw.message || raw.Message || 'No se pudo obtener el extracto.'),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: {
        transactions,
        pagination: raw.pagination || null,
        statusCode: raw.statusCode,
        statusLabel: raw.success
      },
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error en Extracto Bancario (fetch): ${err.message}`,
      latencyMs: 0
    };
  }
}

export interface ExtractoResumenParams {
  account?: string;
  rif?: string;
  from: string;
  to: string;
  hash?: string;
  xApiKey?: string;
}

export async function consultarExtractoResumen(
  params: ExtractoResumenParams,
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const exec = await callBancaribeEndpoint(
      '/Ctas/ExtractoCuentas/1.0.0/api/transactions/summary',
      (_token, cfg) => ({
        account: String(params.account || cfg.numero_cuenta).replace(/\D/g, ''),
        rif: normalizeRif(params.rif || cfg.rif),
        from: toIsoDate(params.from),
        to: toIsoDate(params.to)
      }),
      {
        extraHeaders: (cfg) => buildExtractoHeaders(cfg, params.hash, params.xApiKey),
        fetchFn
      }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'Fallo de autenticación OAuth2.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error consultando resumen de extracto.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const isOk = exec.res.ok && (String(raw.statusCode) === '0' || String(raw.success).toLowerCase() === 'aprobada');

    return {
      success: isOk,
      statusCode: exec.res.status,
      errorCode: raw.statusCode,
      message: isOk
        ? `Resumen de extracto obtenido: ${raw.totalTransactions ?? 0} transacciones en el rango.`
        : describeBancaribeCode(raw.statusCode, raw.message || 'Error consultando resumen de extracto'),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: raw,
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error en Resumen de Extracto Bancario: ${err.message}`,
      latencyMs: 0
    };
  }
}

export interface ExtractoVerificarParams {
  account?: string;
  amount: string | number;
  date: string; // YYYY-MM-DD
  referenceNumber: string;
  rif?: string;
  hash?: string;
  xApiKey?: string;
}

export async function verificarTransaccionExtracto(
  params: ExtractoVerificarParams,
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const exec = await callBancaribeEndpoint(
      '/Ctas/ExtractoCuentas/1.0.0/api/transactions/verify',
      (_token, cfg) => ({
        account: String(params.account || cfg.numero_cuenta).replace(/\D/g, ''),
        amount: typeof params.amount === 'number' ? params.amount.toFixed(2) : String(params.amount),
        date: toIsoDate(params.date),
        referenceNumber: String(params.referenceNumber || '').trim(),
        rif: normalizeRif(params.rif || cfg.rif)
      }),
      {
        extraHeaders: (cfg) => buildExtractoHeaders(cfg, params.hash, params.xApiKey),
        fetchFn
      }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'Fallo de autenticación OAuth2.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error verificando transacción en extracto.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const exists = String(raw.Exists).toLowerCase() === 'true' || raw.Exists === true;
    const isOk = exec.res.ok && exists;

    return {
      success: isOk,
      statusCode: exec.res.status,
      errorCode: raw.Error || raw.codigo,
      message: raw.Message || (exists ? 'Transacción verificada en el extracto bancario.' : 'No se encontró la transacción en el extracto.'),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: {
        exists,
        transaction: raw.Data || null
      },
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error verificando transacción en extracto: ${err.message}`,
      latencyMs: 0
    };
  }
}

// =========================================================================
// 5. API CONSULTA DE OPERACIONES PLUS (PM / TRF / DEPO)
//    Endpoint: POST /B2P/1.0.0/consulta-operacion
// =========================================================================

export type TipoOperacionPlus = 'PM' | 'TRF' | 'DEPO';

export interface ConsultarOperacionPlusParams {
  tipoTrx: TipoOperacionPlus;
  montoTransaccion?: string | number;
  rif?: string;
  identificadorPersona?: string;
  referencia?: string;
  telefonoDebito?: string;
  factura?: string;
  fecha?: string; // Formato mm/dd/yyyy o "" para transacciones del día en curso (acepta YYYY-MM-DD y convierte)
  hash?: string;
  numCuenta?: string | null;
  IO?: 'I' | 'O' | null;
  BCV?: 'S' | 'N' | null;
}

export async function consultarOperacionPlus(
  params: ConsultarOperacionPlusParams,
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const tipo = params.tipoTrx || 'PM';
    const exec = await callBancaribeEndpoint(
      '/B2P/1.0.0/consulta-operacion',
      (_token, cfg) => {
        const isPm = tipo === 'PM';
        const isTrf = tipo === 'TRF';
        const montoStr =
          params.montoTransaccion !== undefined &&
          params.montoTransaccion !== null &&
          String(params.montoTransaccion).trim() !== ''
            ? Number(params.montoTransaccion).toFixed(2)
            : '';

        return {
          tipoTrx: tipo,
          montoTransaccion: montoStr,
          rif: normalizeRif(params.rif || cfg.rif),
          identificadorPersona: normalizeRif(params.identificadorPersona || ''),
          referencia: String(params.referencia || '').trim(),
          telefonoDebito: isTrf ? '' : normalizePhoneVe(params.telefonoDebito || ''),
          factura: String(params.factura || '').trim(),
          fecha: params.fecha ? toMmDdYyyy(params.fecha) : '',
          hash: params.hash || cfg.hash,
          numCuenta: isPm ? null : String(params.numCuenta || cfg.numero_cuenta).replace(/\D/g, ''),
          IO: isTrf ? (params.IO || 'I') : null,
          BCV: isTrf ? (params.BCV || 'S') : null
        };
      },
      { fetchFn }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'No se pudo autenticar contra Bancaribe.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error consultando operación.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const inner = raw.data || raw;
    const innerSuccess = String(inner?.success).toLowerCase() === 'true' || raw.success === true;
    const ejecucion = inner?.ejecucion !== undefined ? String(inner.ejecucion) : undefined;
    const isOk = exec.res.ok && innerSuccess && (ejecucion === undefined || ejecucion === '0');

    return {
      success: isOk,
      statusCode: exec.res.status,
      errorCode: ejecucion,
      message: inner?.descripcion || (isOk ? 'Operación encontrada y validada en Bancaribe.' : 'Operación no encontrada o con error.'),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: inner,
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error en Consulta Operaciones Plus: ${err.message}`,
      latencyMs: 0
    };
  }
}

// =========================================================================
// 6. API LISTAR BANCOS ACTIVOS (C2P / P2P)
//    Endpoint: POST /ListarBanco/1.0.0/listarBancosApi (o /c2pRestWs/1.0.0/listarBancosC2p)
// =========================================================================

export interface ListarBancosParams {
  tipoLista?: 'C2P' | 'P2P';
  forceRefresh?: boolean;
}

export async function listarBancosBancaribe(
  params: ListarBancosParams = {},
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult<{ banks: BancaribeBankItem[]; fromCache: boolean }>> {
  const tipoLista = params.tipoLista || 'C2P';
  const cacheEntry = banksCache.get(tipoLista);
  if (!params.forceRefresh && cacheEntry && cacheEntry.expiresAtMs > Date.now()) {
    return {
      success: true,
      statusCode: 200,
      message: `Catálogo de bancos ${tipoLista} obtenido desde caché (${cacheEntry.banks.length} bancos).`,
      latencyMs: 0,
      data: { banks: cacheEntry.banks, fromCache: true }
    };
  }

  try {
    const exec = await callBancaribeEndpoint(
      '/ListarBanco/1.0.0/listarBancosApi',
      (token, cfg) => ({
        requestListar: {
          canal: cfg.canal_virtual || 1,
          identificadorExterno: token,
          terminal: cfg.terminal || 'WEB01',
          tipoLista
        }
      }),
      { fetchFn }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: `${exec.authError} (Se retorna lista SUDEBAN de respaldo para UI)`,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        data: { banks: FALLBACK_VENEZUELAN_BANKS, fromCache: true }
      };
    }

    const raw = exec.res.json || {};
    const out =
      raw?.Envelope?.Body?.listarBancosApiResponse?.out ||
      raw?.Envelope?.Body?.listarBancosC2pResponse?.out ||
      raw?.out ||
      raw;

    const beans = out?.listaBancosC2p?.BancoC2PBean || out?.listaBancos?.BancoC2PBean || [];
    const normalized: BancaribeBankItem[] = (Array.isArray(beans) ? beans : [beans])
      .filter(Boolean)
      .map((item: any) => {
        const b = item.banco || item;
        return {
          codigo: normalizeBankCode(b.codigo || b.code),
          descripcion: String(b.descripcion || b.name || '').trim()
        };
      })
      .filter((b: BancaribeBankItem) => b.codigo && b.descripcion);

    if (normalized.length > 0) {
      banksCache.set(tipoLista, {
        banks: normalized,
        expiresAtMs: Date.now() + BANKS_CACHE_TTL_MS
      });
      return {
        success: true,
        statusCode: exec.res.status,
        message: `Bancos activos ${tipoLista} actualizados (${normalized.length} bancos).`,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        data: { banks: normalized, fromCache: false },
        raw
      };
    }

    return {
      success: exec.res.ok,
      statusCode: exec.res.status,
      message: out?.descripcionError || 'Respuesta sin lista de bancos; usando catálogo SUDEBAN de respaldo.',
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: { banks: FALLBACK_VENEZUELAN_BANKS, fromCache: true },
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error listando bancos ${tipoLista}: ${err.message}`,
      latencyMs: 0,
      data: { banks: FALLBACK_VENEZUELAN_BANKS, fromCache: true }
    };
  }
}

// =========================================================================
// 7. API PAGO MÓVIL COMERCIO C2P (COBRO CON OTP Y ANULACIÓN)
//    Endpoints: POST /C2P/1.0.0/registrarPagoC2pApi | /C2P/1.0.0/registrarPagoS7bApi
// =========================================================================

export interface RegistrarPagoC2pParams {
  endpointMode?: 'c2p' | 's7b';
  anulacion?: 'N' | 'S';
  bancoCredito?: string; // Por defecto 0114 (Bancaribe)
  bancoPagador: string;  // Ej. 0105, 0134
  concepto: string;
  identificadorPersona: string; // Cédula o RIF del pagador (V12345678)
  montoTransaccion: string | number;
  numeroReferencia?: string; // "null" para nuevo cobro, o referencia original para anular
  otp: string; // Clave dinámica C2P del pagador
  telefonoCredito?: string; // Teléfono comercio
  telefonoPersona: string; // Teléfono cliente pagador
  hash?: string;
}

export async function registrarPagoC2p(
  params: RegistrarPagoC2pParams,
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const endpoint =
      params.endpointMode === 's7b'
        ? '/C2P/1.0.0/registrarPagoS7bApi'
        : '/C2P/1.0.0/registrarPagoC2pApi';

    const exec = await callBancaribeEndpoint(
      endpoint,
      (token, cfg) => ({
        registrarPagoC2pApi: {
          request: {
            anulacion: params.anulacion || 'N',
            bancoCredito: normalizeBankCode(params.bancoCredito || '0114'),
            bancoPagador: normalizeBankCode(params.bancoPagador),
            cajaTerminal: Number(cfg.caja_terminal || 1),
            canalVirtual: Number(cfg.canal_virtual || 1),
            codigoMoneda: Number(cfg.codigo_moneda || 928),
            concepto: String(params.concepto || 'Pago movil C2P').slice(0, 60),
            direccionInternet: cfg.ip_origen || '10.10.0.1',
            hash: params.hash || cfg.hash,
            identificadorExt: token,
            identificadorPersona: normalizeRif(params.identificadorPersona),
            montoTransaccion: Number(params.montoTransaccion || 0).toFixed(2),
            nombreComercio: cfg.nombre_comercio || 'COMERCIO',
            numeroReferencia: params.numeroReferencia ? String(params.numeroReferencia).trim() : 'null',
            otp: String(params.otp || '').trim(),
            rif: normalizeRif(cfg.rif),
            sucursal: Number(cfg.sucursal || 1),
            telefonoCredito: normalizePhoneVe(params.telefonoCredito || cfg.telefono_comercio),
            telefonoPersona: normalizePhoneVe(params.telefonoPersona),
            terminal: cfg.terminal || 'WEB01',
            tipoTerminal: cfg.tipo_terminal || 'WEB',
            vendedor: Number(cfg.vendedor || 1)
          }
        }
      }),
      { fetchFn }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'Fallo de autenticación OAuth2.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error ejecutando Pago Móvil C2P.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const out =
      raw?.Envelope?.Body?.registrarPagoC2pApiResponse?.out ||
      raw?.Envelope?.Body?.registrarPagoS7bApiResponse?.out ||
      raw?.out ||
      raw;

    const errCode = out?.codigoError;
    const isOk = exec.res.ok && errCode !== undefined && Number(errCode) === 0;

    return {
      success: isOk,
      statusCode: exec.res.status,
      errorCode: errCode,
      message: isOk
        ? `${out?.descripcionError || 'Cobro C2P exitoso'} (Secuencial: ${out?.secuencial || 'N/A'}).`
        : describeBancaribeCode(errCode, out?.descripcionError || raw?.message),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: out,
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error en Pago Móvil Comercio C2P: ${err.message}`,
      latencyMs: 0
    };
  }
}

// =========================================================================
// 8. API PAGO A PERSONAS (B2P / VUELTO DIGITAL)
//    Endpoint: POST /PaP/1.0.0/sendPaymentB2P
// =========================================================================

export interface EnviarPagoPersonasB2pParams {
  montoTransaccion: string | number;
  bancoCredito: string;         // Banco destino de la persona natural (ej. 0102)
  identificadorPersona: string; // Cédula persona beneficiaria (V12345678)
  telefonoCredito: string;      // Teléfono celular beneficiario (0414...)
  concepto: string;
  telefonoDebito?: string;      // Teléfono del comercio afiliado
  factura?: string;
}

export async function enviarPagoPersonasB2p(
  params: EnviarPagoPersonasB2pParams,
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const exec = await callBancaribeEndpoint(
      '/PaP/1.0.0/sendPaymentB2P',
      (_token, cfg) => ({
        montoTransaccion: Number(params.montoTransaccion || 0).toFixed(2),
        bancoCredito: normalizeBankCode(params.bancoCredito),
        canalVirtual: String(cfg.canal_virtual || 1),
        oficina: Number(cfg.oficina || 800),
        identificadorPersona: normalizeRif(params.identificadorPersona),
        telefonoCredito: normalizePhoneVe(params.telefonoCredito),
        vendedor: Number(cfg.vendedor || 1),
        concepto: String(params.concepto || 'Pago a personas B2P').slice(0, 60),
        direccionInternet: cfg.ip_origen || '10.10.0.1',
        bancoPagador: '0114',
        cajaTerminal: Number(cfg.caja_terminal || 1),
        codigoMoneda: Number(cfg.codigo_moneda || 928),
        nombreComercio: cfg.nombre_comercio || 'Comercio',
        rif: normalizeRif(cfg.rif),
        sucursal: Number(cfg.sucursal || 1),
        telefonoDebito: normalizePhoneVe(params.telefonoDebito || cfg.telefono_comercio),
        tipoTerminal: cfg.tipo_terminal || 'WEB',
        factura: String(params.factura || '0')
      }),
      { fetchFn }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'Fallo de autenticación OAuth2.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error enviando Pago a Personas B2P.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const isOk = exec.res.ok && raw.success === true && Number(raw.codigoError ?? 0) === 0;

    return {
      success: isOk,
      statusCode: exec.res.status,
      errorCode: raw.codigoError,
      message: isOk
        ? `Pago B2P enviado exitosamente (Confirmación: ${raw.codigoConfirmacion || raw.secuencial || 'N/A'}).`
        : describeBancaribeCode(raw.codigoError, raw.descripcionError || raw.message),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: raw,
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error en Pago a Personas (B2P): ${err.message}`,
      latencyMs: 0
    };
  }
}

// =========================================================================
// 9. API TRANSFERENCIA INMEDIATA (CRIN / TER)
//    Endpoints:
//      POST /transferencia_inmediata/1.0.0/iniciarCreditoInmediatoAPI
//      POST /transferencia_inmediata/1.0.0/consultarTransferenciaCRIN
// =========================================================================

export interface IniciarTransferenciaInmediataParams {
  bancoDestino: string;
  cedulaRifBeneficiario: string;
  cedulaRifEmisor?: string;
  concepto: string;
  cuentaDestino: string; // Número de cuenta (20 dígitos) o teléfono en caso CELE
  monedaDestino?: number; // 0 = VES
  monto: number | string;
  nombreBeneficiario: string;
  nombreEmisor?: string;
  tipoCtaCele?: 'CNTA' | 'CELE';
  hash?: string;
}

export async function iniciarTransferenciaInmediata(
  params: IniciarTransferenciaInmediataParams,
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const exec = await callBancaribeEndpoint(
      '/transferencia_inmediata/1.0.0/iniciarCreditoInmediatoAPI',
      (token, cfg) => ({
        requestIniciarCredInmediato: {
          bancoDestino: normalizeBankCode(params.bancoDestino),
          cedulaRifBeneficiario: normalizeRif(params.cedulaRifBeneficiario),
          cedulaRifEmisor: normalizeRif(params.cedulaRifEmisor || cfg.rif),
          concepto: String(params.concepto || 'Transferencia inmediata').slice(0, 80),
          cuentaDestino: String(params.cuentaDestino || '').replace(/\D/g, ''),
          monedaDestino: Number(params.monedaDestino ?? 0),
          hash: params.hash || cfg.hash,
          identificadorExterno: token,
          ipOrigen: cfg.ip_origen || '10.10.0.1',
          monto: Number(params.monto || 0),
          nombreBeneficiario: String(params.nombreBeneficiario || '').trim(),
          nombreEmisor: String(params.nombreEmisor || cfg.nombre_comercio).trim(),
          terminal: cfg.terminal || 'WEB01',
          tipoCtaCele: params.tipoCtaCele || 'CNTA'
        }
      }),
      { fetchFn }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'Fallo de autenticación OAuth2.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error iniciando transferencia inmediata.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const out =
      raw?.Envelope?.Body?.CredInmediatoApiResponse?.out ||
      raw?.Envelope?.Body?.iniciarCreditoInmediatoAPIResponse?.out ||
      raw?.out ||
      raw;

    const errCode = out?.codigoError;
    const isOk = exec.res.ok && errCode !== undefined && Number(errCode) === 0;

    return {
      success: isOk,
      statusCode: exec.res.status,
      errorCode: errCode,
      message: isOk
        ? `${out?.descripcionError || 'Transferencia inmediata ejecutada'} (Secuencial: ${out?.secuencial || 'N/A'}).`
        : describeBancaribeCode(errCode, out?.descripcionError || raw?.message),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: out,
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error en Transferencia Inmediata: ${err.message}`,
      latencyMs: 0
    };
  }
}

export interface ConsultarTransferenciaCrinParams {
  cuentaOrigen?: string;
  fechaProcesoTransaccion?: string; // YYYY-MM-DD
  cedulaRifEmisor?: string;
  secuencial: string;
  tipoServicio?: 'CRIN' | 'TER';
  hash?: string;
}

export async function consultarTransferenciaCrin(
  params: ConsultarTransferenciaCrinParams,
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const exec = await callBancaribeEndpoint(
      '/transferencia_inmediata/1.0.0/consultarTransferenciaCRIN',
      (token, cfg) => ({
        requestConsultarCredInmediato: {
          cuentaOrigen: String(params.cuentaOrigen || cfg.numero_cuenta).replace(/\D/g, ''),
          fechaProcesoTransaccion: toIsoDate(params.fechaProcesoTransaccion || todayIso),
          hash: params.hash || cfg.hash,
          identificadorExterno: token,
          ipOrigen: cfg.ip_origen || '10.10.0.1',
          cedulaRifEmisor: normalizeRif(params.cedulaRifEmisor || cfg.rif),
          secuencial: String(params.secuencial || '').trim(),
          terminal: String(cfg.caja_terminal || '1'),
          tipoServicio: params.tipoServicio || 'CRIN'
        }
      }),
      { fetchFn }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'Fallo de autenticación OAuth2.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error consultando transferencia CRIN.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const out =
      raw?.Envelope?.Body?.consultarTransferenciaCRINResponse?.out ||
      raw?.out ||
      raw;

    const dto = out?.out_lista?.TransaccionesCRIN_DTO || out?.TransaccionesCRIN_DTO || null;
    const errCode = out?.codigoError;
    const isOk = exec.res.ok && (errCode === undefined || Number(errCode) === 0);

    return {
      success: isOk,
      statusCode: exec.res.status,
      errorCode: errCode,
      message: isOk
        ? `${out?.descripcionError || 'Consulta CRIN exitosa'}${dto?.codErrorBCV ? ` — Estatus BCV: ${dto.codErrorBCV}` : ''}.`
        : describeBancaribeCode(errCode, out?.descripcionError || raw?.message),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: {
        out,
        transaccion: dto
      },
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error consultando transferencia CRIN: ${err.message}`,
      latencyMs: 0
    };
  }
}

// =========================================================================
// 10. API COBRANZA DIGITAL (SIMF / DÉBITO INMEDIATO DBIN)
//     Endpoints:
//       POST /DC/1.0.0/generate-token
//       POST /DC/1.0.0/payment-key-request
//       POST /DC/1.0.0/digital-charge
//       POST /DC/1.0.0/get-operation
// =========================================================================

export interface GenerarTokenCobranzaParams {
  identificacion: string; // Cédula/RIF deudor
  servicio?: string;      // '002' por defecto
  cuenta: string;         // Cuenta a debitar (20 dígitos)
  cedulaRif?: string;     // RIF comercio emisor
  lenToken?: number;
  numeric?: 'S' | 'N';
  tokenValidity?: number; // Minutos de validez
  hash?: string;
}

export async function generarTokenCobranza(
  params: GenerarTokenCobranzaParams,
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const exec = await callBancaribeEndpoint(
      '/DC/1.0.0/generate-token',
      (_token, cfg) => ({
        identificacion: normalizeRif(params.identificacion),
        servicio: params.servicio || '002',
        cuenta: String(params.cuenta || '').replace(/\D/g, ''),
        cedulaRif: normalizeRif(params.cedulaRif || cfg.rif),
        hash: params.hash || cfg.hash,
        lenToken: Number(params.lenToken || 8),
        numeric: params.numeric || 'S',
        tokenValidity: Number(params.tokenValidity || 10)
      }),
      { fetchFn }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'Fallo de autenticación OAuth2.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error generando token de cobranza.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const isOk = exec.res.ok && raw.success === true;

    return {
      success: isOk,
      statusCode: exec.res.status,
      message: raw.message || (isOk ? 'Token OTP generado exitosamente.' : 'No se pudo generar el token.'),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: raw,
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error generando token OTP Cobranza Digital: ${err.message}`,
      latencyMs: 0
    };
  }
}

export interface SolicitarClaveCobranzaParams {
  codBanco: number | string; // Ej. 114, 105, 134
  cuentaDestino?: string;    // Cuenta receptora (o teléfono)
  cuentaOrigen: string;      // Cuenta del cliente a debitar (o teléfono)
  identificacionClienteDestino?: string; // RIF comercio
  identificacionClienteOrigen: string;   // Cédula/RIF pagador
  monAbrev?: string;         // 'VES'
  monto: string | number;
  telefono: string;          // Teléfono pagador
  hash?: string;
}

export async function solicitarClaveCobranza(
  params: SolicitarClaveCobranzaParams,
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const exec = await callBancaribeEndpoint(
      '/DC/1.0.0/payment-key-request',
      (_token, cfg) => ({
        codBanco: Number(String(params.codBanco || 114).replace(/\D/g, '')),
        cuentaDestino: String(params.cuentaDestino || cfg.numero_cuenta).replace(/\D/g, ''),
        cuentaOrigen: String(params.cuentaOrigen || '').replace(/\D/g, ''),
        identificacionClienteDestino: normalizeRif(params.identificacionClienteDestino || cfg.rif),
        identificacionClienteOrigen: normalizeRif(params.identificacionClienteOrigen),
        monAbrev: params.monAbrev || 'VES',
        hash: params.hash || cfg.hash,
        monto: String(params.monto || '0'),
        telefono: normalizePhoneVe(params.telefono)
      }),
      { fetchFn }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'Fallo de autenticación OAuth2.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error solicitando clave de pago.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const isOk = exec.res.ok && raw.success === true;

    return {
      success: isOk,
      statusCode: exec.res.status,
      message: raw.message || (isOk ? `Solicitud exitosa (msgId: ${raw.msgId || 'N/A'}).` : 'Solicitud de clave rechazada.'),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: raw,
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error en Solicitud de Clave de Pago (DBIN): ${err.message}`,
      latencyMs: 0
    };
  }
}

export interface EjecutarCobranzaDigitalParams {
  codBanco: number | string;
  concepto: string;
  contrato?: string;
  cuentaDestino?: string;              // Cuenta del comercio receptor
  cuentaOrigen: string;                // Cuenta o teléfono del deudor
  factura?: string;
  identificacionClienteDestino?: string; // RIF comercio
  identificacionClienteOrigen: string;   // Cédula/RIF deudor
  monto: number | string;
  nombreClienteDestino?: string;
  nombreClienteOrigen: string;
  subTipoOperacion?: string; // '002'
  telefono?: string;
  tipoServicio?: 'DBIN' | string;
  tipoProducto?: 'CNTA' | 'CELE';
  otp: string;
  hash?: string;
}

export async function ejecutarCobranzaDigital(
  params: EjecutarCobranzaDigitalParams,
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const exec = await callBancaribeEndpoint(
      '/DC/1.0.0/digital-charge',
      (_token, cfg) => ({
        codBanco: Number(String(params.codBanco || 114).replace(/\D/g, '')),
        concepto: String(params.concepto || 'Cobro digital DBIN').slice(0, 60),
        contrato: String(params.contrato || cfg.contrato_cobranza || '1'),
        cuentaDestino: String(params.cuentaDestino || cfg.numero_cuenta).replace(/\D/g, ''),
        cuentaOrigen: String(params.cuentaOrigen || '').replace(/\D/g, ''),
        factura: String(params.factura || ''),
        identificacionClienteDestino: normalizeRif(params.identificacionClienteDestino || cfg.rif),
        hash: params.hash || cfg.hash,
        identificacionClienteOrigen: normalizeRif(params.identificacionClienteOrigen),
        monedaDestino: 0,
        monedaOrigen: 0,
        monto: Number(params.monto || 0),
        nombreClienteDestino: String(params.nombreClienteDestino || cfg.nombre_comercio),
        nombreClienteOrigen: String(params.nombreClienteOrigen || 'CLIENTE').trim(),
        subTipoOperacion: params.subTipoOperacion || '002',
        telefono: params.telefono ? normalizePhoneVe(params.telefono) : '',
        tipoServicio: params.tipoServicio || 'DBIN',
        tipoProducto: params.tipoProducto || 'CNTA',
        otp: String(params.otp || '').trim()
      }),
      { fetchFn }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'Fallo de autenticación OAuth2.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error ejecutando cargo digital DBIN.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const statusIso = raw.status || '';
    const isOk = exec.res.ok && raw.success === true && statusIso !== 'RJCT';

    return {
      success: isOk,
      statusCode: exec.res.status,
      errorCode: raw.reason || statusIso,
      message: isOk
        ? `${raw.message || 'Cargo digital DBIN exitoso'} — Estatus: ${statusIso || 'ACCP'} (EndToEnd: ${raw.idEndToEnd || 'N/A'})`
        : describeBancaribeCode(raw.reason || statusIso, raw.message || 'Cargo digital rechazado.'),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: raw,
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error ejecutando Cobranza Digital (DBIN): ${err.message}`,
      latencyMs: 0
    };
  }
}

export interface ConsultarOperacionCobranzaParams {
  secuencial?: string;
  tipoServicio?: 'DBIN' | string;
  operacion?: 'R' | 'E' | string;
  identEmisor?: string;
  endID?: string;
  monto?: number | string;
  estado?: string; // 'A', 'L', 'R', etc.
  hash?: string;
}

export async function consultarOperacionCobranza(
  params: ConsultarOperacionCobranzaParams,
  fetchFn?: typeof fetch
): Promise<BancaribeApiResult> {
  try {
    const exec = await callBancaribeEndpoint(
      '/DC/1.0.0/get-operation',
      (_token, cfg) => ({
        secuencial: String(params.secuencial || '').trim(),
        tipoServicio: params.tipoServicio || 'DBIN',
        operacion: params.operacion || 'R',
        identEmisor: normalizeRif(params.identEmisor || cfg.rif),
        hash: params.hash || cfg.hash,
        endID: String(params.endID || '').trim(),
        monto: params.monto !== undefined && params.monto !== '' ? Number(params.monto) : 0,
        estado: params.estado || 'A'
      }),
      { fetchFn }
    );

    if (exec.authError || !exec.res) {
      return {
        success: false,
        statusCode: exec.authStatusCode || 401,
        message: exec.authError || 'Fallo de autenticación OAuth2.',
        latencyMs: exec.latencyMs,
        endpoint: exec.url
      };
    }

    const fault = extractFaultError(exec.res);
    if (fault) {
      return {
        success: false,
        statusCode: exec.res.status,
        message: fault.message || 'Error consultando operación DBIN.',
        errorCode: fault.code,
        latencyMs: exec.latencyMs,
        endpoint: exec.url,
        raw: exec.res.json || exec.res.bodyText
      };
    }

    const raw = exec.res.json || {};
    const list = Array.isArray(raw.queryGetOperationList) ? raw.queryGetOperationList : [];
    const isOk = exec.res.ok && raw.success === true;

    return {
      success: isOk,
      statusCode: exec.res.status,
      message: raw.message || (isOk ? `Consulta DBIN exitosa (${list.length} registro(s)).` : 'Error consultando operación DBIN.'),
      latencyMs: exec.latencyMs,
      endpoint: exec.url,
      data: {
        operations: list
      },
      raw
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      message: `Error consultando operación Cobranza Digital: ${err.message}`,
      latencyMs: 0
    };
  }
}

// =========================================================================
// 11. SERVICIO DE NOTIFICACIONES (WEBHOOK RECEPTOR Y CONSULTA EN MEMORIA/DISCO)
// =========================================================================

function readNotificationsFile(): BancaribeNotificationRecord[] {
  if (notificationsMemoryCache) return notificationsMemoryCache;
  try {
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf-8'));
      if (Array.isArray(parsed)) {
        notificationsMemoryCache = parsed;
        return notificationsMemoryCache;
      }
    }
  } catch (err) {
    console.warn('[BANCARIBE_WEBHOOK] No se pudo leer archivo de notificaciones:', err);
  }
  notificationsMemoryCache = [];
  return notificationsMemoryCache;
}

function writeNotificationsFile(records: BancaribeNotificationRecord[]) {
  notificationsMemoryCache = records;
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[BANCARIBE_WEBHOOK] No se pudo escribir archivo de notificaciones:', err);
  }
}

export async function verifyBancaribeWebhookAuth(
  authHeader: string | null,
  xApiKeyHeader: string | null,
  fetchFn?: typeof fetch
): Promise<{ authorized: boolean; reason?: string }> {
  const cfg = await getBancaribeConfig(fetchFn);
  const expectedKey = cfg.webhook_api_key;
  if (!expectedKey) {
    // Si aún no configuran webhook_api_key explícita, acepta solo si no hay restricción configurada,
    // o validamos estrictamente si la han establecido.
    return { authorized: true };
  }

  let providedKey = '';
  if (authHeader) {
    const trimmed = authHeader.trim();
    const match = trimmed.match(/^(?:ApiKey|Bearer)\s+(.+)$/i);
    providedKey = match ? match[1].trim() : trimmed;
  } else if (xApiKeyHeader) {
    providedKey = xApiKeyHeader.trim();
  }

  if (!providedKey || providedKey !== expectedKey) {
    return { authorized: false, reason: 'ApiKey inválida o faltante en cabecera Authorization.' };
  }
  return { authorized: true };
}

export function recordBancaribeNotification(
  payload: any,
  sourceIp?: string
): BancaribeNotificationRecord {
  const existing = readNotificationsFile();
  const record: BancaribeNotificationRecord = {
    id: `bc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    receivedAt: new Date().toISOString(),
    sourceIp,
    amount: Number(payload?.amount || 0),
    bankName: String(payload?.bankName || 'BANCO DEL CARIBE'),
    clientPhone: String(payload?.clientPhone || ''),
    commercePhone: String(payload?.commercePhone || ''),
    creditorAccount: String(payload?.creditorAccount || ''),
    currencyCode: String(payload?.currencyCode || 'VES'),
    date: String(payload?.date || ''),
    debtorAccount: String(payload?.debtorAccount || ''),
    debtorID: String(payload?.debtorID || ''),
    destinyBankReference: String(payload?.destinyBankReference || ''),
    originBankCode: String(payload?.originBankCode || ''),
    originBankReference: String(payload?.originBankReference || ''),
    paymentType: String(payload?.paymentType || ''),
    time: String(payload?.time || ''),
    Udf1: payload?.Udf1 ? String(payload.Udf1) : '',
    Udf2: payload?.Udf2 ? String(payload.Udf2) : '',
    Udf3: payload?.Udf3 ? String(payload.Udf3) : '',
    rawPayload: payload
  };

  const next = [record, ...existing].slice(0, 200);
  writeNotificationsFile(next);
  return record;
}

export function getBancaribeNotifications(): BancaribeNotificationRecord[] {
  return readNotificationsFile();
}

export function clearBancaribeNotifications(): BancaribeNotificationRecord[] {
  writeNotificationsFile([]);
  return [];
}
