// src/lib/server/services/wisphub.ts
import { getIntegration, saveIntegration } from '$lib/server/integrations';
import { getExchangeRateResolver } from './exchangeRates';

export interface WisphubConfig {
  id: string; // 'wisphub'
  provider: 'wisphub';
  api_key: string;
  environment: 'production' | 'sandbox';
  base_url: string;
  is_active: boolean;
  options?: {
    sync_clients?: boolean;
    sync_services?: boolean;
    auto_invoice?: boolean;
    default_zone?: string;
    default_client_type?: string;
  };
  last_tested_at?: string | null;
  last_test_status?: 'success' | 'failed' | null;
  last_test_message?: string | null;
}

export interface WisphubClient {
  id_servicio: number;
  usuario?: string;
  nombre: string;
  apellido?: string;
  email?: string;
  email_cc?: string;
  razon_social?: string;
  tipo_persona?: string;
  cedula?: string;
  direccion?: string;
  localidad?: string;
  ciudad?: string;
  telefono?: string;
  descuento?: string;
  saldo?: string | number;
  saldo_pendiente?: number;
  saldo_pendiente_bs?: number;
  tasa_bcv_aplicada?: number;
  tasa_bcv_fecha?: string;
  fecha_emision_factura?: string;
  facturas_pendientes_count?: number;
  rfc?: string;
  informacion_adicional?: string | null;
  ip?: string;
  ip_local?: string | null;
  estado?: string | number; // 1: Activo, 2: Suspendido, 3: Cancelado, 4: Gratis
  costo_instalacion?: string;
  precio_plan?: string;
  estado_facturas?: string;
  fecha_instalacion?: string;
  fecha_corte?: string;
  ultimo_cambio?: string;
  plan_internet?: { id?: number; nombre?: string; precio?: string } | string;
  zona?: { id?: number; nombre?: string } | string;
  router?: { id?: number; nombre?: string } | string;
  tecnico?: { id?: number; nombre?: string } | string;
  coordenadas?: string;
  ssid_router_wifi?: string;
  password_ssid_router_wifi?: string;
  modelo_router_wifi?: string;
  mac_cpe?: string;
  sn_onu?: string;
  [key: string]: any;
}

export interface WisphubRouter {
  id: number;
  nombre: string;
  ip?: string;
  falla_general?: boolean;
  [key: string]: any;
}

export interface WisphubInvoiceItem {
  id?: number;
  descripcion?: string;
  precio?: number;
  cantidad?: number;
  subtotal?: number;
  iva?: number;
  total?: number;
  servicio?: {
    id_servicio?: number;
    nombre?: string;
    perfil?: string;
  };
}

export interface WisphubInvoice {
  id_factura: number;
  id_cliente?: number;
  cliente?: {
    id_servicio?: number;
    nombre?: string;
    usuario?: string;
    cedula?: string;
    email?: string;
    direccion?: string;
  };
  total: number;
  total_bs?: number;
  subtotal?: number;
  iva?: number;
  fecha_emision: string;
  fecha_vencimiento?: string;
  fecha_pago?: string | null;
  estado: string | number; // 1: Pendiente, 2: Pagada, 3: Anulada
  forma_pago?: any;
  cajero?: any;
  referencia?: string;
  comprobante_pago?: string;
  articulos?: WisphubInvoiceItem[];
  tasa_bcv?: number;
  tasa_bcv_fecha?: string;
  [key: string]: any;
}

export interface WisphubComprobante {
  id_factura: number;
  comprobante_pago: string;
  referencia: string;
  fecha_pago: string | null;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  total: number;
  estado: string;
  forma_pago: string | null;
  cajero?: string | null;
  cliente?: {
    nombre?: string;
    usuario?: string;
    cedula?: string;
  };
  tasa_bcv?: number;
  tasa_bcv_fecha?: string;
  total_bs?: number;
}

export interface WisphubPlan {
  id: number;
  nombre: string;
  precio: number;
  velocidad_bajada?: string;
  velocidad_subida?: string;
  perfil?: string;
}

export const DEFAULT_WISPHUB_CONFIG: WisphubConfig = {
  id: 'wisphub',
  provider: 'wisphub',
  api_key: '',
  environment: 'production',
  base_url: 'https://api.wisphub.net/api',
  is_active: false,
  options: {
    sync_clients: true,
    sync_services: true,
    auto_invoice: false,
    default_zone: '01',
    default_client_type: '01'
  },
  last_tested_at: null,
  last_test_status: null,
  last_test_message: null
};

/**
 * Obtiene la configuración activa de WispHub desde el módulo central de integraciones
 */
export async function getWisphubConfig(): Promise<WisphubConfig> {
  try {
    const integration = await getIntegration('wisphub');
    if (integration) {
      return {
        id: 'wisphub',
        provider: 'wisphub',
        api_key: String(integration.credentials?.api_key || '').trim(),
        environment: (integration.environment as any) || 'production',
        base_url: (integration.base_url || 'https://api.wisphub.net/api').replace(/\/+$/, ''),
        is_active: Boolean(integration.is_active),
        options: {
          sync_clients: integration.options?.sync_clients ?? true,
          sync_services: integration.options?.sync_services ?? true,
          auto_invoice: integration.options?.auto_invoice ?? false,
          default_zone: integration.options?.default_zone || '01',
          default_client_type: integration.options?.default_client_type || '01'
        },
        last_tested_at: integration.last_tested_at,
        last_test_status: integration.last_test_status,
        last_test_message: integration.last_test_message
      };
    }
  } catch (err) {
    console.warn('[WISPHUB SERVICE] Error al leer integración wisphub:', err);
  }

  return { ...DEFAULT_WISPHUB_CONFIG };
}

/**
 * Guarda o actualiza la configuración de WispHub en la base de integraciones
 */
export async function saveWisphubConfig(updates: Partial<WisphubConfig>): Promise<WisphubConfig> {
  const current = await getWisphubConfig();
  const merged: WisphubConfig = {
    ...current,
    ...updates,
    options: {
      ...current.options,
      ...updates.options
    }
  };

  await saveIntegration('wisphub', {
    is_active: merged.is_active,
    environment: merged.environment,
    base_url: merged.base_url,
    credentials: {
      api_key: merged.api_key
    },
    options: merged.options,
    last_tested_at: merged.last_tested_at,
    last_test_status: merged.last_test_status,
    last_test_message: merged.last_test_message
  });

  return merged;
}

/**
 * Construye las cabeceras estándar para peticiones HTTP hacia la API de WispHub
 */
export function buildWisphubHeaders(apiKey: string): HeadersInit {
  const cleanKey = apiKey.trim();
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Api-Key ${cleanKey}`,
    'Api-Key': cleanKey
  };
}

/**
 * Prueba la conexión con el servidor de WispHub realizando una consulta a /clientes/?limit=1
 */
export async function testWisphubConnection(configOverride?: Partial<WisphubConfig>): Promise<{
  success: boolean;
  statusCode: number;
  message: string;
  latencyMs: number;
  data?: any;
}> {
  const cfg = configOverride
    ? { ...(await getWisphubConfig()), ...configOverride }
    : await getWisphubConfig();

  if (!cfg.api_key) {
    return {
      success: false,
      statusCode: 400,
      message: 'La Clave de API (Api-Key) de WispHub no está configurada.',
      latencyMs: 0
    };
  }

  const baseUrl = (cfg.base_url || 'https://api.wisphub.net/api').replace(/\/+$/, '');
  const testUrl = `${baseUrl}/clientes/?limit=1`;
  const startTime = Date.now();

  try {
    const res = await fetch(testUrl, {
      method: 'GET',
      headers: buildWisphubHeaders(cfg.api_key)
    });

    const latencyMs = Date.now() - startTime;
    const rawText = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { rawText };
    }

    const now = new Date().toISOString();

    if (res.ok) {
      const clientCount = typeof data?.count === 'number' ? data.count : (Array.isArray(data) ? data.length : 'OK');
      const msg = `Conexión verificada exitosamente con WispHub (${clientCount} clientes registrados). Latencia: ${latencyMs}ms.`;
      await saveWisphubConfig({
        last_tested_at: now,
        last_test_status: 'success',
        last_test_message: msg
      });
      return {
        success: true,
        statusCode: res.status,
        message: msg,
        latencyMs,
        data: { clientCount, preview: data?.results?.[0] || null }
      };
    } else {
      const msg = data?.detail || res.statusText || 'Error de autenticación con WispHub. Verifica tu Api-Key.';
      await saveWisphubConfig({
        last_tested_at: now,
        last_test_status: 'failed',
        last_test_message: msg
      });
      return {
        success: false,
        statusCode: res.status,
        message: msg,
        latencyMs,
        data
      };
    }
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const msg = `Fallo de red hacia WispHub (${baseUrl}): ${err.message}`;
    await saveWisphubConfig({
      last_tested_at: new Date().toISOString(),
      last_test_status: 'failed',
      last_test_message: msg
    });
    return {
      success: false,
      statusCode: 500,
      message: msg,
      latencyMs
    };
  }
}

// ==========================================
// CACHÉ DE SALDOS Y CONTEOS GLOBALES
// ==========================================

export interface DebtEntry {
  total: number;
  totalBs: number;
  count: number;
  fecha_emision?: string;
  tasa_bcv: number;
  tasa_fecha: string;
}

interface PendingDebtCache {
  timestamp: number;
  debtMap: Map<string, DebtEntry>;
  totalCompanyDebt: number;
  totalCompanyDebtBs: number;
  latestBcvRate: number;
  latestBcvDate: string;
}
let cachedDebt: PendingDebtCache | null = null;

async function getPendingInvoicesSummary(cfg: WisphubConfig): Promise<{
  debtMap: Map<string, DebtEntry>;
  totalCompanyDebt: number;
  totalCompanyDebtBs: number;
  latestBcvRate: number;
  latestBcvDate: string;
}> {
  const now = Date.now();
  if (cachedDebt && now - cachedDebt.timestamp < 45000) {
    return {
      debtMap: cachedDebt.debtMap,
      totalCompanyDebt: cachedDebt.totalCompanyDebt,
      totalCompanyDebtBs: cachedDebt.totalCompanyDebtBs,
      latestBcvRate: cachedDebt.latestBcvRate,
      latestBcvDate: cachedDebt.latestBcvDate
    };
  }

  const resolveRate = await getExchangeRateResolver('USD');
  const latestRateInfo = resolveRate(null);

  const baseUrl = (cfg.base_url || 'https://api.wisphub.net/api').replace(/\/+$/, '');
  const url = `${baseUrl}/facturas/?estado=1&limit=250`;
  const debtMap = new Map<string, DebtEntry>();
  let totalCompanyDebt = 0;
  let totalCompanyDebtBs = 0;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: buildWisphubHeaders(cfg.api_key)
    });
    if (res.ok) {
      const data = await res.json();
      const list = data?.results || (Array.isArray(data) ? data : []);
      for (const fac of list) {
        const amount = parseFloat(String(fac.total || 0));
        const emissionDate = fac.fecha_emision || null;
        const rateInfo = resolveRate(emissionDate);
        const amountBs = Number((amount * rateInfo.rate).toFixed(2));

        totalCompanyDebt += amount;
        totalCompanyDebtBs += amountBs;

        const sId = fac.articulos?.[0]?.servicio?.id_servicio;
        const user = fac.cliente?.usuario;
        const cedula = fac.cliente?.cedula;

        const registerDebt = (k: string | number) => {
          const key = String(k).trim();
          if (!key) return;
          const current = debtMap.get(key) || {
            total: 0,
            totalBs: 0,
            count: 0,
            fecha_emision: emissionDate || undefined,
            tasa_bcv: rateInfo.rate,
            tasa_fecha: rateInfo.rate_date
          };
          debtMap.set(key, {
            total: current.total + amount,
            totalBs: current.totalBs + amountBs,
            count: current.count + 1,
            fecha_emision: current.fecha_emision || emissionDate || undefined,
            tasa_bcv: current.tasa_bcv || rateInfo.rate,
            tasa_fecha: current.tasa_fecha || rateInfo.rate_date
          });
        };

        if (sId) registerDebt(sId);
        if (user) registerDebt(user);
        if (cedula) registerDebt(cedula);
      }
    }

    cachedDebt = {
      timestamp: now,
      debtMap,
      totalCompanyDebt: Number(totalCompanyDebt.toFixed(2)),
      totalCompanyDebtBs: Number(totalCompanyDebtBs.toFixed(2)),
      latestBcvRate: latestRateInfo.rate,
      latestBcvDate: latestRateInfo.rate_date
    };
  } catch (e) {
    console.warn('[WISPHUB SERVICE] No se pudieron precargar facturas pendientes para balance:', e);
  }

  return {
    debtMap,
    totalCompanyDebt: Number(totalCompanyDebt.toFixed(2)),
    totalCompanyDebtBs: Number(totalCompanyDebtBs.toFixed(2)),
    latestBcvRate: latestRateInfo.rate,
    latestBcvDate: latestRateInfo.rate_date
  };
}

// Conteo global de clientes activos y suspendidos (60s)
interface StatusCountsCache {
  timestamp: number;
  data: Map<string, { active: number; suspended: number }>;
}
const statusCountsCache: StatusCountsCache = {
  timestamp: 0,
  data: new Map()
};

async function getWisphubStatusCounts(
  cfg: WisphubConfig,
  router?: string | number
): Promise<{ active: number; suspended: number }> {
  const key = router ? String(router) : 'all';
  const now = Date.now();
  if (now - statusCountsCache.timestamp < 60000 && statusCountsCache.data.has(key)) {
    return statusCountsCache.data.get(key)!;
  }

  const baseUrl = (cfg.base_url || 'https://api.wisphub.net/api').replace(/\/+$/, '');
  const routerParam = router ? `&router=${router}` : '';

  try {
    const [resActivo, resSuspendido, resCancelado] = await Promise.all([
      fetch(`${baseUrl}/clientes/?limit=1&estado=1${routerParam}`, {
        method: 'GET',
        headers: buildWisphubHeaders(cfg.api_key)
      }),
      fetch(`${baseUrl}/clientes/?limit=1&estado=2${routerParam}`, {
        method: 'GET',
        headers: buildWisphubHeaders(cfg.api_key)
      }),
      fetch(`${baseUrl}/clientes/?limit=1&estado=3${routerParam}`, {
        method: 'GET',
        headers: buildWisphubHeaders(cfg.api_key)
      })
    ]);

    const dataActivo = resActivo.ok ? await resActivo.json() : null;
    const dataSuspendido = resSuspendido.ok ? await resSuspendido.json() : null;
    const dataCancelado = resCancelado.ok ? await resCancelado.json() : null;

    const active = typeof dataActivo?.count === 'number' ? dataActivo.count : 0;
    const susp = typeof dataSuspendido?.count === 'number' ? dataSuspendido.count : 0;
    const canc = typeof dataCancelado?.count === 'number' ? dataCancelado.count : 0;
    const suspended = susp + canc;

    const counts = { active, suspended };
    statusCountsCache.timestamp = now;
    statusCountsCache.data.set(key, counts);
    return counts;
  } catch (err) {
    console.warn('[WISPHUB SERVICE] Error obteniendo conteos de estado:', err);
    return { active: 0, suspended: 0 };
  }
}

// ==========================================
// CONSULTA DE CLIENTES
// ==========================================

export async function getWisphubClientes(
  params: {
    search?: string;
    page?: number;
    limit?: number;
    offset?: number;
    estado?: string | number;
    router?: string | number;
  } = {},
  configOverride?: Partial<WisphubConfig>
): Promise<{
  success: boolean;
  count?: number;
  activeCount?: number;
  suspendedCount?: number;
  results?: WisphubClient[];
  totalCompanyDebt?: number;
  totalCompanyDebtBs?: number;
  latestBcvRate?: number;
  latestBcvDate?: string | null;
  next?: string | null;
  previous?: string | null;
  error?: string;
  statusCode?: number;
}> {
  const cfg = configOverride
    ? { ...(await getWisphubConfig()), ...configOverride }
    : await getWisphubConfig();

  if (!cfg.api_key) {
    return {
      success: false,
      statusCode: 400,
      error: 'Debe configurar y guardar la clave de API (Api-Key) de WispHub primero.'
    };
  }

  const baseUrl = (cfg.base_url || 'https://api.wisphub.net/api').replace(/\/+$/, '');
  const limit = Number(params.limit) || 10;
  const page = Number(params.page) || 1;
  const offset = params.offset !== undefined ? Number(params.offset) : Math.max(0, (page - 1) * limit);

  const queryWisphub = async (queryParams: Record<string, string>): Promise<{ results: any[]; count: number }> => {
    const u = new URL(`${baseUrl}/clientes/`);
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== undefined && v !== null && v !== '') {
        u.searchParams.set(k, String(v));
      }
    }

    const response = await fetch(u.toString(), {
      method: 'GET',
      headers: buildWisphubHeaders(cfg.api_key)
    });

    if (!response.ok) {
      throw new Error(`WispHub HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
    const count = typeof data?.count === 'number' ? data.count : results.length;
    return { results, count };
  };

  try {
    const [
      { debtMap, totalCompanyDebt, totalCompanyDebtBs, latestBcvRate, latestBcvDate },
      statusCounts
    ] = await Promise.all([
      getPendingInvoicesSummary(cfg),
      getWisphubStatusCounts(cfg, params.router)
    ]);
    const resolveRate = await getExchangeRateResolver('USD');
    const latestRateInfo = resolveRate(null);

    const baseFilters: Record<string, string> = {
      limit: String(limit),
      offset: String(offset)
    };

    if (params.estado !== undefined && params.estado !== null && params.estado !== '') {
      baseFilters.estado = String(params.estado);
    }
    if (params.router !== undefined && params.router !== null && params.router !== '') {
      baseFilters.router = String(params.router);
    }

    let rawResults: any[] = [];
    let totalCount = 0;
    const searchTerm = params.search?.trim();

    if (!searchTerm) {
      const resp = await queryWisphub(baseFilters);
      rawResults = resp.results;
      totalCount = resp.count;
    } else {
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}/.test(searchTerm)) {
        // Dirección IP
        const resp = await queryWisphub({ ...baseFilters, ip__contains: searchTerm });
        rawResults = resp.results;
        totalCount = resp.count;
      } else if (/^[vej]-?[\d\.]+/i.test(searchTerm)) {
        // Cédula / RIF con prefijo
        const resp = await queryWisphub({ ...baseFilters, cedula__contains: searchTerm });
        rawResults = resp.results;
        totalCount = resp.count;
      } else if (/^\d{1,8}$/.test(searchTerm)) {
        // Dígitos: id_servicio, cédula sin puntos, o teléfono
        const formattedDots = searchTerm.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        const searchFilters = { ...baseFilters, limit: '25', offset: '0' };

        const promises = [
          queryWisphub({ ...searchFilters, id_servicio: searchTerm }).catch(() => ({ results: [], count: 0 })),
          queryWisphub({ ...searchFilters, cedula__contains: searchTerm }).catch(() => ({ results: [], count: 0 })),
          queryWisphub({ ...searchFilters, cedula__contains: formattedDots }).catch(() => ({ results: [], count: 0 })),
          queryWisphub({ ...searchFilters, telefono__contains: searchTerm }).catch(() => ({ results: [], count: 0 }))
        ];

        const [rId, rCed, rCedDots, rTel] = await Promise.all(promises);
        const merged = new Map<number, any>();
        for (const item of [...rId.results, ...rCed.results, ...rCedDots.results, ...rTel.results]) {
          merged.set(item.id_servicio, item);
        }

        rawResults = Array.from(merged.values());
        totalCount = rawResults.length;
      } else {
        // Nombre, apellido o usuario concurrentes
        const searchFilters = { ...baseFilters, limit: '30', offset: '0' };
        const [rNom, rApe, rUser] = await Promise.all([
          queryWisphub({ ...searchFilters, nombre__contains: searchTerm }).catch(() => ({ results: [], count: 0 })),
          queryWisphub({ ...searchFilters, apellido__contains: searchTerm }).catch(() => ({ results: [], count: 0 })),
          queryWisphub({ ...searchFilters, usuario__contains: searchTerm }).catch(() => ({ results: [], count: 0 }))
        ]);

        const merged = new Map<number, any>();
        for (const item of [...rNom.results, ...rApe.results, ...rUser.results]) {
          merged.set(item.id_servicio, item);
        }

        rawResults = Array.from(merged.values());
        totalCount = rawResults.length;
      }
    }

    // Enriquecer clientes con saldo pendiente real de facturas y monto en Bs
    const enrichedResults: WisphubClient[] = rawResults.map(client => {
      const debtById = debtMap.get(String(client.id_servicio));
      const debtByUser = client.usuario ? debtMap.get(String(client.usuario)) : null;
      const debtByCed = client.cedula ? debtMap.get(String(client.cedula)) : null;

      const debt = debtById || debtByUser || debtByCed;
      const saldoPendiente = debt ? Number(debt.total.toFixed(2)) : 0;
      const saldoPendienteBs = debt ? Number(debt.totalBs.toFixed(2)) : 0;
      const facturasPendientesCount = debt ? debt.count : 0;
      const fechaEmision = debt?.fecha_emision || null;
      const tasaBcv = debt?.tasa_bcv || latestRateInfo.rate;
      const tasaBcvFecha = debt?.tasa_fecha || latestRateInfo.rate_date;

      return {
        ...client,
        saldo_pendiente: saldoPendiente,
        saldo_pendiente_bs: saldoPendienteBs,
        tasa_bcv_aplicada: tasaBcv,
        tasa_bcv_fecha: tasaBcvFecha,
        fecha_emision_factura: fechaEmision,
        facturas_pendientes_count: facturasPendientesCount,
        estado_facturas: saldoPendiente > 0 ? 'Pendiente de Pago' : (client.estado_facturas || 'Pagadas')
      };
    });

    return {
      success: true,
      statusCode: 200,
      count: totalCount,
      activeCount: statusCounts.active,
      suspendedCount: statusCounts.suspended,
      totalCompanyDebt,
      totalCompanyDebtBs,
      latestBcvRate,
      latestBcvDate,
      results: enrichedResults
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      error: `Error de conexión con WispHub: ${err.message}`
    };
  }
}

/**
 * Consulta el detalle individual de un cliente en WispHub
 */
export async function getWisphubCliente(
  id_servicio: number | string,
  configOverride?: Partial<WisphubConfig>
): Promise<{
  success: boolean;
  client?: WisphubClient;
  error?: string;
  statusCode?: number;
}> {
  const cfg = configOverride
    ? { ...(await getWisphubConfig()), ...configOverride }
    : await getWisphubConfig();

  if (!cfg.api_key) {
    return {
      success: false,
      statusCode: 400,
      error: 'Debe configurar y guardar la clave de API (Api-Key) de WispHub primero.'
    };
  }

  const baseUrl = (cfg.base_url || 'https://api.wisphub.net/api').replace(/\/+$/, '');
  const url = `${baseUrl}/clientes/${encodeURIComponent(String(id_servicio))}/`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: buildWisphubHeaders(cfg.api_key)
    });

    if (res.ok) {
      const client = await res.json();
      return { success: true, statusCode: 200, client };
    } else {
      return { success: false, statusCode: res.status, error: res.statusText || 'Cliente no encontrado' };
    }
  } catch (err: any) {
    return { success: false, statusCode: 500, error: err.message };
  }
}

/**
 * Consulta la lista de routers desde la API de WispHub: GET /router/
 */
export async function getWisphubRouters(
  configOverride?: Partial<WisphubConfig>
): Promise<{
  success: boolean;
  count?: number;
  results?: WisphubRouter[];
  error?: string;
  statusCode?: number;
}> {
  const cfg = configOverride
    ? { ...(await getWisphubConfig()), ...configOverride }
    : await getWisphubConfig();

  if (!cfg.api_key) {
    return {
      success: false,
      statusCode: 400,
      error: 'Debe configurar y guardar la clave de API (Api-Key) de WispHub primero.'
    };
  }

  const baseUrl = (cfg.base_url || 'https://api.wisphub.net/api').replace(/\/+$/, '');
  const url = `${baseUrl}/router/`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: buildWisphubHeaders(cfg.api_key)
    });

    if (response.ok) {
      const data = await response.json();
      const results = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
      const count = typeof data?.count === 'number' ? data.count : results.length;
      return { success: true, statusCode: 200, count, results };
    } else {
      return {
        success: false,
        statusCode: response.status,
        error: response.statusText || 'Error al obtener routers de WispHub'
      };
    }
  } catch (err: any) {
    return { success: false, statusCode: 500, error: `Error de conexión con WispHub: ${err.message}` };
  }
}

/**
 * Consulta el saldo y facturas pendientes de un cliente: GET /clientes/{id_servicio}/saldo/
 */
export async function getWisphubClienteSaldo(
  id_servicio: number | string,
  configOverride?: Partial<WisphubConfig>
): Promise<{
  success: boolean;
  data?: {
    username?: string;
    nombre?: string;
    saldo?: number;
    saldo_bs?: number;
    tasa_bcv_vigente?: number;
    tasa_bcv_fecha?: string;
    facturas?: Array<any>;
    url_pago?: string;
    estado?: string;
    router?: any;
  };
  error?: string;
  statusCode?: number;
}> {
  const cfg = configOverride
    ? { ...(await getWisphubConfig()), ...configOverride }
    : await getWisphubConfig();

  if (!cfg.api_key) {
    return {
      success: false,
      statusCode: 400,
      error: 'Debe configurar y guardar la clave de API (Api-Key) de WispHub primero.'
    };
  }

  const baseUrl = (cfg.base_url || 'https://api.wisphub.net/api').replace(/\/+$/, '');
  const url = `${baseUrl}/clientes/${encodeURIComponent(String(id_servicio))}/saldo/`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: buildWisphubHeaders(cfg.api_key)
    });

    if (response.ok) {
      const data = await response.json();
      const resolveRate = await getExchangeRateResolver('USD');
      const latestRateInfo = resolveRate(null);

      let saldoBs = 0;
      if (Array.isArray(data.facturas)) {
        data.facturas = data.facturas.map((fac: any) => {
          const amount = parseFloat(String(fac.total || 0));
          const rInfo = resolveRate(fac.fecha_emision);
          const facBs = Number((amount * rInfo.rate).toFixed(2));
          saldoBs += facBs;
          return {
            ...fac,
            total: amount,
            total_bs: facBs,
            tasa_bcv: rInfo.rate,
            tasa_fecha: rInfo.rate_date,
            tasa_is_exact: rInfo.is_exact
          };
        });
      }

      const saldoUsd = parseFloat(String(data.saldo || 0));
      if (saldoBs === 0 && saldoUsd > 0) {
        saldoBs = Number((saldoUsd * latestRateInfo.rate).toFixed(2));
      }

      data.saldo_bs = Number(saldoBs.toFixed(2));
      data.tasa_bcv_vigente = latestRateInfo.rate;
      data.tasa_bcv_fecha = latestRateInfo.rate_date;

      return { success: true, statusCode: 200, data };
    } else {
      return {
        success: false,
        statusCode: response.status,
        error: response.statusText || 'No se pudo obtener el saldo del cliente'
      };
    }
  } catch (err: any) {
    return { success: false, statusCode: 500, error: `Error de conexión con WispHub: ${err.message}` };
  }
}

/**
 * Consulta la lista de facturas desde la API de WispHub: GET /facturas/
 */
export async function getWisphubFacturas(
  params: { id_cliente?: string | number; estado?: string; page?: number; limit?: number; search?: string } = {},
  configOverride?: Partial<WisphubConfig>
): Promise<{
  success: boolean;
  count?: number;
  results?: WisphubInvoice[];
  next?: string | null;
  previous?: string | null;
  error?: string;
  statusCode?: number;
}> {
  const cfg = configOverride
    ? { ...(await getWisphubConfig()), ...configOverride }
    : await getWisphubConfig();

  if (!cfg.api_key) {
    return {
      success: false,
      statusCode: 400,
      error: 'Debe configurar y guardar la clave de API (Api-Key) de WispHub primero.'
    };
  }

  const baseUrl = (cfg.base_url || 'https://api.wisphub.net/api').replace(/\/+$/, '');
  const url = new URL(`${baseUrl}/facturas/`);

  if (params.id_cliente) url.searchParams.set('id_cliente', String(params.id_cliente));
  if (params.estado) url.searchParams.set('estado', params.estado);
  if (params.page) url.searchParams.set('page', String(params.page));
  if (params.limit) url.searchParams.set('limit', String(params.limit));
  if (params.search) url.searchParams.set('search', params.search.trim());

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: buildWisphubHeaders(cfg.api_key)
    });

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = { rawText: await response.text() };
    }

    if (response.ok) {
      const results = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
      const count = typeof data?.count === 'number' ? data.count : results.length;

      // Enriquecer facturas con tasas cambiarias según fecha
      const resolveRate = await getExchangeRateResolver('USD');
      const enrichedResults = results.map((fac: any) => {
        const total = parseFloat(String(fac.total || 0));
        const rInfo = resolveRate(fac.fecha_emision);
        return {
          ...fac,
          total,
          total_bs: Number((total * rInfo.rate).toFixed(2)),
          tasa_bcv: rInfo.rate,
          tasa_bcv_fecha: rInfo.rate_date
        };
      });

      return {
        success: true,
        statusCode: response.status,
        count,
        results: enrichedResults,
        next: data?.next || null,
        previous: data?.previous || null
      };
    } else {
      return {
        success: false,
        statusCode: response.status,
        error: data?.detail || response.statusText || 'Error al obtener facturas de WispHub'
      };
    }
  } catch (err: any) {
    return { success: false, statusCode: 500, error: `Error de conexión con WispHub: ${err.message}` };
  }
}

/**
 * Consulta una factura individual de WispHub: GET /facturas/{id}/
 */
export async function getWisphubFactura(
  id_factura: number | string,
  configOverride?: Partial<WisphubConfig>
): Promise<{
  success: boolean;
  factura?: WisphubInvoice;
  error?: string;
  statusCode?: number;
}> {
  const cfg = configOverride
    ? { ...(await getWisphubConfig()), ...configOverride }
    : await getWisphubConfig();

  if (!cfg.api_key) {
    return {
      success: false,
      statusCode: 400,
      error: 'Debe configurar y guardar la clave de API (Api-Key) de WispHub primero.'
    };
  }

  const baseUrl = (cfg.base_url || 'https://api.wisphub.net/api').replace(/\/+$/, '');
  const url = `${baseUrl}/facturas/${encodeURIComponent(String(id_factura))}/`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: buildWisphubHeaders(cfg.api_key)
    });

    if (response.ok) {
      const factura = await response.json();
      const resolveRate = await getExchangeRateResolver('USD');
      const rInfo = resolveRate(factura.fecha_emision);
      const total = parseFloat(String(factura.total || 0));

      return {
        success: true,
        statusCode: 200,
        factura: {
          ...factura,
          total,
          total_bs: Number((total * rInfo.rate).toFixed(2)),
          tasa_bcv: rInfo.rate,
          tasa_bcv_fecha: rInfo.rate_date
        }
      };
    } else {
      return { success: false, statusCode: response.status, error: response.statusText || 'Factura no encontrada' };
    }
  } catch (err: any) {
    return { success: false, statusCode: 500, error: err.message };
  }
}

/**
 * Consulta la lista de planes de internet registrados en WispHub
 */
export async function getWisphubPlanes(
  configOverride?: Partial<WisphubConfig>
): Promise<{
  success: boolean;
  count?: number;
  results?: WisphubPlan[];
  error?: string;
  statusCode?: number;
}> {
  const cfg = configOverride
    ? { ...(await getWisphubConfig()), ...configOverride }
    : await getWisphubConfig();

  if (!cfg.api_key) {
    return {
      success: false,
      statusCode: 400,
      error: 'Debe configurar y guardar la clave de API (Api-Key) de WispHub primero.'
    };
  }

  const baseUrl = (cfg.base_url || 'https://api.wisphub.net/api').replace(/\/+$/, '');

  // Intentamos con /servicios/ y si falla probamos con /planes/
  const endpoints = ['/servicios/', '/planes/'];
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${ep}`, {
        method: 'GET',
        headers: buildWisphubHeaders(cfg.api_key)
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
        if (list.length > 0) {
          const mapped: WisphubPlan[] = list.map((item: any) => ({
            id: item.id || item.id_servicio || item.id_plan,
            nombre: item.nombre || item.perfil || item.name || 'Plan de Internet',
            precio: parseFloat(String(item.precio || item.costo || item.precio_plan || 0)),
            velocidad_bajada: item.bajada || item.download || '',
            velocidad_subida: item.subida || item.upload || '',
            perfil: item.perfil || item.profile || ''
          }));
          return { success: true, statusCode: 200, count: mapped.length, results: mapped };
        }
      }
    } catch {}
  }

  // Fallback: Si no existen esos endpoints, extraer planes únicos a partir de los clientes activos
  try {
    const clientsResp = await getWisphubClientes({ limit: 100 }, cfg);
    if (clientsResp.success && Array.isArray(clientsResp.results)) {
      const planMap = new Map<string, WisphubPlan>();
      let autoId = 1;
      for (const c of clientsResp.results) {
        const planName = typeof c.plan_internet === 'object' ? c.plan_internet?.nombre : String(c.plan_internet || '').trim();
        if (planName && !planMap.has(planName)) {
          const price = parseFloat(String(c.precio_plan || 0));
          planMap.set(planName, {
            id: autoId++,
            nombre: planName,
            precio: price,
            perfil: planName
          });
        }
      }
      const uniquePlans = Array.from(planMap.values());
      return { success: true, statusCode: 200, count: uniquePlans.length, results: uniquePlans };
    }
  } catch {}

  return { success: true, statusCode: 200, count: 0, results: [] };
}

/**
 * Consulta los comprobantes de pago subidos por un cliente al reportar pagos en WispHub
 */
export async function getWisphubClienteComprobantes(
  id_servicio: number | string,
  usuario?: string,
  configOverride?: Partial<WisphubConfig>
): Promise<{
  success: boolean;
  comprobantes: WisphubComprobante[];
  count: number;
  usuario?: string;
  error?: string;
  statusCode?: number;
}> {
  const cfg = configOverride
    ? { ...(await getWisphubConfig()), ...configOverride }
    : await getWisphubConfig();

  if (!cfg.api_key) {
    return {
      success: false,
      comprobantes: [],
      count: 0,
      statusCode: 400,
      error: 'Debe configurar y guardar la clave de API (Api-Key) de WispHub primero.'
    };
  }

  const baseUrl = (cfg.base_url || 'https://api.wisphub.net/api').replace(/\/+$/, '');

  let clientUsername = (usuario || '').trim();
  if (!clientUsername) {
    try {
      const saldoRes = await fetch(`${baseUrl}/clientes/${encodeURIComponent(String(id_servicio))}/saldo/`, {
        method: 'GET',
        headers: buildWisphubHeaders(cfg.api_key)
      });
      if (saldoRes.ok) {
        const saldoData = await saldoRes.json();
        if (saldoData?.username) clientUsername = saldoData.username;
      }
    } catch {}
  }

  if (!clientUsername) {
    return {
      success: false,
      comprobantes: [],
      count: 0,
      statusCode: 404,
      error: 'No se pudo identificar el usuario de WispHub para este servicio.'
    };
  }

  const url = `${baseUrl}/facturas/?cliente=${encodeURIComponent(clientUsername)}&limit=50`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: buildWisphubHeaders(cfg.api_key)
    });

    if (response.ok) {
      const data = await response.json();
      const list = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
      const resolveRate = await getExchangeRateResolver('USD');

      const withComprobante: WisphubComprobante[] = list
        .filter((fac: any) => Boolean(fac.comprobante_pago && String(fac.comprobante_pago).trim().length > 4))
        .map((fac: any) => {
          const facTotal = parseFloat(String(fac.total || 0));
          const dateStr = fac.fecha_pago || fac.fecha_emision || null;
          const cleanDate = dateStr
            ? (dateStr.includes('T') ? dateStr.split('T')[0] : String(dateStr).slice(0, 10))
            : null;

          const rateInfo = resolveRate(cleanDate);
          const tasa_bcv = rateInfo.rate;
          const tasa_bcv_fecha = rateInfo.rate_date;
          const total_bs = Number((facTotal * tasa_bcv).toFixed(2));

          return {
            id_factura: fac.id_factura,
            comprobante_pago: fac.comprobante_pago,
            referencia: fac.referencia || '',
            fecha_pago: fac.fecha_pago || null,
            fecha_emision: fac.fecha_emision || null,
            fecha_vencimiento: fac.fecha_vencimiento || null,
            total: facTotal,
            estado: fac.estado || '',
            forma_pago: typeof fac.forma_pago === 'object' ? fac.forma_pago?.nombre : fac.forma_pago || null,
            cajero: typeof fac.cajero === 'object' ? fac.cajero?.nombre : fac.cajero || null,
            cliente: {
              nombre: fac.cliente?.nombre,
              usuario: fac.cliente?.usuario,
              cedula: fac.cliente?.cedula
            },
            tasa_bcv,
            tasa_bcv_fecha,
            total_bs
          };
        })
        .sort((a, b) => {
          const dateA = a.fecha_pago || a.fecha_emision || '';
          const dateB = b.fecha_pago || b.fecha_emision || '';
          return dateB.localeCompare(dateA);
        });

      return {
        success: true,
        statusCode: 200,
        comprobantes: withComprobante,
        count: withComprobante.length,
        usuario: clientUsername
      };
    } else {
      return {
        success: false,
        statusCode: response.status,
        comprobantes: [],
        count: 0,
        error: response.statusText || 'Error al obtener comprobantes de WispHub'
      };
    }
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      comprobantes: [],
      count: 0,
      error: `Error de conexión con WispHub: ${err.message}`
    };
  }
}
