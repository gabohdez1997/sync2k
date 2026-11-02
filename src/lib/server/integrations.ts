// src/lib/server/integrations.ts
import { getSupabaseAdmin } from '$lib/server/supabase';
import fs from 'fs';
import path from 'path';

export type IntegrationCategory = 'billing' | 'isp' | 'payment' | 'banking';

export interface IntegrationConfig {
  id: string;
  provider: string;
  category: IntegrationCategory;
  name: string;
  description: string;
  environment: 'sandbox' | 'production' | 'demo';
  base_url: string;
  is_active: boolean;
  credentials: Record<string, any>;
  options: Record<string, any>;
  last_tested_at: string | null;
  last_test_status: 'success' | 'failed' | null;
  last_test_message: string | null;
  updated_at?: string;
}

export const DEFAULT_INTEGRATIONS: Record<string, IntegrationConfig> = {
  the_factory_hka: {
    id: 'the_factory_hka',
    provider: 'the_factory_hka',
    category: 'billing',
    name: 'The Factory HKA',
    description: 'Emisión de facturas fiscales electrónicas autorizadas por el SENIAT.',
    environment: 'demo',
    base_url: 'https://demoemision.thefactoryhka.com.ve',
    is_active: false,
    credentials: {
      token_empresa: '',
      token_clave: ''
    },
    options: {
      emisor_rif: 'J-504441244',
      emisor_nombre: 'ALDANET, C.A',
      emisor_direccion: 'CALLE SUCRE CASA NRO 68 SECTOR CASCO CENTRAL EL CONSEJO ARAGUA',
      emisor_telefono: '02129000000',
      emisor_correo: 'FACTURACION@ALDANET.COM.VE',
      correo_adicional: '',
      serie_default: 'A',
      moneda_default: 'VES'
    },
    last_tested_at: null,
    last_test_status: null,
    last_test_message: null
  },
  wisphub: {
    id: 'wisphub',
    provider: 'wisphub',
    category: 'isp',
    name: 'WispHub',
    description: 'Gestión técnica y comercial para proveedores de internet (ISP). Sincronización de clientes, planes y facturas.',
    environment: 'production',
    base_url: 'https://api.wisphub.net/api',
    is_active: false,
    credentials: {
      api_key: ''
    },
    options: {
      sync_clients: true,
      sync_services: true,
      auto_invoice: false
    },
    last_tested_at: null,
    last_test_status: null,
    last_test_message: null
  },
  mikrowisp: {
    id: 'mikrowisp',
    provider: 'mikrowisp',
    category: 'isp',
    name: 'MikroWisp',
    description: 'Sistema de administración integral para redes MikroTik, ancho de banda y corte de servicios.',
    environment: 'production',
    base_url: 'https://tu-servidor-mikrowisp.com/api/v1',
    is_active: false,
    credentials: {
      api_key: '',
      token: ''
    },
    options: {
      server_ip: ''
    },
    last_tested_at: null,
    last_test_status: null,
    last_test_message: null
  },
  cashea: {
    id: 'cashea',
    provider: 'cashea',
    category: 'payment',
    name: 'Cashea',
    description: 'Financiamiento en cuotas sin interés (BNPL). Pagos en punto de venta y comercio electrónico.',
    environment: 'sandbox',
    base_url: 'https://api.sandbox.cashea.app',
    is_active: false,
    credentials: {
      api_key: '',
      secret_key: '',
      merchant_id: '',
      pos_id: ''
    },
    options: {
      default_down_payment_percent: 40
    },
    last_tested_at: null,
    last_test_status: null,
    last_test_message: null
  },
  megasoft: {
    id: 'megasoft',
    provider: 'megasoft',
    category: 'payment',
    name: 'Megasoft (PagoFlash / POS)',
    description: 'Pasarela de pagos electrónicos para tarjetas de débito/crédito y Pago Móvil C2P interbancario.',
    environment: 'sandbox',
    base_url: 'https://api.megasoft.com.ve',
    is_active: false,
    credentials: {
      merchant_id: '',
      terminal_id: '',
      secret_key: ''
    },
    options: {
      timeout_seconds: 30
    },
    last_tested_at: null,
    last_test_status: null,
    last_test_message: null
  },
  banesco: {
    id: 'banesco',
    provider: 'banesco',
    category: 'banking',
    name: 'Banesco API (Open Banking)',
    description: 'Validación en línea de Pago Móvil, consultas de saldo y conciliación bancaria directa.',
    environment: 'sandbox',
    base_url: 'https://api.banesco.com.ve/v1',
    is_active: false,
    credentials: {
      client_id: '',
      client_secret: ''
    },
    options: {
      account_number: ''
    },
    last_tested_at: null,
    last_test_status: null,
    last_test_message: null
  },
  mercantil: {
    id: 'mercantil',
    provider: 'mercantil',
    category: 'banking',
    name: 'Mercantil API (C2P & Pagos)',
    description: 'Botón de Pago Mercantil, validación de referencias y cobro interbancario C2P.',
    environment: 'sandbox',
    base_url: 'https://api.mercantilbanco.com',
    is_active: false,
    credentials: {
      merchant_id: '',
      api_key: ''
    },
    options: {
      terminal_id: ''
    },
    last_tested_at: null,
    last_test_status: null,
    last_test_message: null
  }
};

const LOCAL_DATA_DIR = path.resolve('data');
const LOCAL_INTEGRATIONS_FILE = path.join(LOCAL_DATA_DIR, 'integrations.json');

// Memory cache for serverless environments
let memoryCache: Record<string, IntegrationConfig> | null = null;

function readLocalFallback(): Record<string, IntegrationConfig> {
  if (memoryCache) return memoryCache;
  try {
    if (fs.existsSync(LOCAL_INTEGRATIONS_FILE)) {
      const raw = fs.readFileSync(LOCAL_INTEGRATIONS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      memoryCache = { ...DEFAULT_INTEGRATIONS, ...parsed };
      return memoryCache!;
    }
  } catch (err) {
    console.warn('[INTEGRATIONS] Fallback local no legible:', err);
  }
  memoryCache = { ...DEFAULT_INTEGRATIONS };
  return memoryCache;
}

function writeLocalFallback(configs: Record<string, IntegrationConfig>) {
  memoryCache = configs;
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_INTEGRATIONS_FILE, JSON.stringify(configs, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[INTEGRATIONS] No se pudo escribir fallback local en disco (posible serverless):', err);
  }
}

/**
 * Obtiene todas las integraciones combinando defaults, Supabase y fallback local.
 */
export async function getAllIntegrations(fetchFn?: typeof fetch): Promise<IntegrationConfig[]> {
  const local = readLocalFallback();
  const supabase = getSupabaseAdmin(fetchFn);

  try {
    const { data, error } = await supabase
      .from('api_integrations')
      .select('*');

    if (!error && Array.isArray(data)) {
      const merged: Record<string, IntegrationConfig> = { ...local };
      for (const item of data) {
        if (item.id) {
          merged[item.id] = {
            ...(DEFAULT_INTEGRATIONS[item.id] || {}),
            ...merged[item.id],
            ...item,
            credentials: item.credentials || merged[item.id]?.credentials || {},
            options: item.options || merged[item.id]?.options || {}
          };
        }
      }
      return Object.values(merged);
    }
  } catch (e) {
    // Si la tabla aún no existe en Supabase, sirve fallback local
  }

  return Object.values(local);
}

/**
 * Obtiene una integración por su ID.
 */
export async function getIntegration(id: string, fetchFn?: typeof fetch): Promise<IntegrationConfig | null> {
  const all = await getAllIntegrations(fetchFn);
  return all.find((i) => i.id === id) || DEFAULT_INTEGRATIONS[id] || null;
}

/**
 * Guarda o actualiza la configuración de una integración.
 */
export async function saveIntegration(
  id: string,
  updates: Partial<IntegrationConfig>,
  fetchFn?: typeof fetch
): Promise<IntegrationConfig> {
  const local = readLocalFallback();
  const current = (await getIntegration(id, fetchFn)) || DEFAULT_INTEGRATIONS[id];

  if (!current) {
    throw new Error(`Integración desconocida: ${id}`);
  }

  const merged: IntegrationConfig = {
    ...current,
    ...updates,
    credentials: {
      ...(current.credentials || {}),
      ...(updates.credentials || {})
    },
    options: {
      ...(current.options || {}),
      ...(updates.options || {})
    },
    updated_at: new Date().toISOString()
  };

  // 1. Guardar en caché/disco local
  local[id] = merged;
  writeLocalFallback(local);

  // 2. Intentar guardar en Supabase (si existe la tabla)
  const supabase = getSupabaseAdmin(fetchFn);
  try {
    const { error } = await supabase.from('api_integrations').upsert({
      id: merged.id,
      provider: merged.provider,
      category: merged.category,
      name: merged.name,
      description: merged.description,
      environment: merged.environment,
      base_url: merged.base_url,
      is_active: merged.is_active,
      credentials: merged.credentials,
      options: merged.options,
      last_tested_at: merged.last_tested_at,
      last_test_status: merged.last_test_status,
      last_test_message: merged.last_test_message,
      updated_at: merged.updated_at
    });

    if (error) {
      console.warn('[INTEGRATIONS] Supabase upsert error (usando fallback local):', error.message);
    }
  } catch (err: any) {
    console.warn('[INTEGRATIONS] Supabase no disponible para api_integrations:', err.message);
  }

  return merged;
}

/**
 * Ejecuta una prueba de conectividad en tiempo real contra el proveedor configurado.
 */
export async function testIntegrationConnection(
  id: string,
  credentialsOverride?: Record<string, any>,
  fetchFn?: typeof fetch
): Promise<{
  success: boolean;
  statusCode: number;
  message: string;
  latencyMs: number;
  details?: any;
}> {
  const config = await getIntegration(id, fetchFn);
  if (!config) {
    return {
      success: false,
      statusCode: 404,
      message: `Integración ${id} no encontrada.`,
      latencyMs: 0
    };
  }

  const creds = { ...config.credentials, ...(credentialsOverride || {}) };
  const startTime = Date.now();
  const now = new Date().toISOString();

  // Test según proveedor
  if (id === 'the_factory_hka') {
    const usuario = (creds.token_empresa || '').trim();
    const clave = (creds.token_clave || '').trim();

    if (!usuario || !clave) {
      const msg = 'Token Empresa y Token Clave son obligatorios para probar la conexión.';
      await saveIntegration(id, { last_tested_at: now, last_test_status: 'failed', last_test_message: msg }, fetchFn);
      return { success: false, statusCode: 400, message: msg, latencyMs: 0 };
    }

    const baseUrl = (config.base_url || 'https://demoemision.thefactoryhka.com.ve').replace(/\/+$/, '');
    const url = `${baseUrl}/api/Autenticacion`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ usuario, clave })
      });
      const latencyMs = Date.now() - startTime;
      const data = await res.json().catch(() => null);

      if (res.ok && data?.token) {
        const msg = `Autenticación exitosa con The Factory HKA. Token JWT recibido (Expira: ${data.expiracion || 'N/A'}).`;
        await saveIntegration(id, { last_tested_at: now, last_test_status: 'success', last_test_message: msg }, fetchFn);
        return { success: true, statusCode: res.status, message: msg, latencyMs, details: { tokenPreview: `${data.token.slice(0, 15)}...`, expiracion: data.expiracion } };
      } else {
        const msg = data?.mensaje || data?.error || res.statusText || 'Credenciales inválidas en The Factory HKA.';
        await saveIntegration(id, { last_tested_at: now, last_test_status: 'failed', last_test_message: msg }, fetchFn);
        return { success: false, statusCode: res.status, message: msg, latencyMs, details: data };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const msg = `Fallo de red hacia The Factory HKA (${baseUrl}): ${err.message}`;
      await saveIntegration(id, { last_tested_at: now, last_test_status: 'failed', last_test_message: msg }, fetchFn);
      return { success: false, statusCode: 500, message: msg, latencyMs };
    }
  }

  if (id === 'wisphub') {
    const apiKey = (creds.api_key || '').trim();
    if (!apiKey) {
      const msg = 'La Api-Key de WispHub es obligatoria.';
      await saveIntegration(id, { last_tested_at: now, last_test_status: 'failed', last_test_message: msg }, fetchFn);
      return { success: false, statusCode: 400, message: msg, latencyMs: 0 };
    }

    const baseUrl = (config.base_url || 'https://api.wisphub.net/api').replace(/\/+$/, '');
    const testUrl = `${baseUrl}/clientes/?limit=1`;

    try {
      const res = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Api-Key ${apiKey}`,
          'Api-Key': apiKey
        }
      });
      const latencyMs = Date.now() - startTime;
      const data = await res.json().catch(() => null);

      if (res.ok) {
        const total = data?.count ?? (Array.isArray(data) ? data.length : 'OK');
        const msg = `Conexión verificada con WispHub. Acceso a API autorizado (${total} clientes registrados).`;
        await saveIntegration(id, { last_tested_at: now, last_test_status: 'success', last_test_message: msg }, fetchFn);
        return { success: true, statusCode: res.status, message: msg, latencyMs, details: { clientCount: total } };
      } else {
        const msg = data?.detail || res.statusText || 'Api-Key inválida o rechazada por WispHub.';
        await saveIntegration(id, { last_tested_at: now, last_test_status: 'failed', last_test_message: msg }, fetchFn);
        return { success: false, statusCode: res.status, message: msg, latencyMs, details: data };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const msg = `Fallo de red hacia WispHub (${baseUrl}): ${err.message}`;
      await saveIntegration(id, { last_tested_at: now, last_test_status: 'failed', last_test_message: msg }, fetchFn);
      return { success: false, statusCode: 500, message: msg, latencyMs };
    }
  }

  // Prueba genérica de ping HTTP para otros servicios
  try {
    const baseUrl = (config.base_url || '').replace(/\/+$/, '');
    if (!baseUrl.startsWith('http')) {
      return { success: false, statusCode: 400, message: 'URL base no configurada o inválida.', latencyMs: 0 };
    }
    const res = await fetch(baseUrl, { method: 'HEAD' });
    const latencyMs = Date.now() - startTime;
    const msg = `Servidor de ${config.name} alcanzable (${res.status} ${res.statusText}).`;
    await saveIntegration(id, { last_tested_at: now, last_test_status: 'success', last_test_message: msg }, fetchFn);
    return { success: true, statusCode: res.status, message: msg, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const msg = `No se pudo conectar con ${config.name}: ${err.message}`;
    await saveIntegration(id, { last_tested_at: now, last_test_status: 'failed', last_test_message: msg }, fetchFn);
    return { success: false, statusCode: 500, message: msg, latencyMs };
  }
}

