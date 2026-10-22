// src/lib/server/branches.ts
// Gestión de sucursales con caché en memoria y resiliencia ante saturación de Supabase

import { getSupabaseAdmin } from './supabase';

export interface BranchRecord {
  id: string;
  name: string;
  business_name?: string | null;
  rif?: string | null;
  address?: string | null;
  phone?: string | null;
  logo_url?: string | null;
  agent_url: string | null;
  agent_token: string;
  profit_branch_code?: string;
  profit_branch_codes?: any;
  profit_server_id?: string | null;
  local_dns_alias?: string | null;
  default_warehouse?: string | null;
  allow_decimals_units?: boolean;
  default_seller?: string | null;
  active?: boolean;
  sort_order?: number;
  is_default?: boolean;
}

interface CachedBranches {
  branches: BranchRecord[];
  expiresAt: number;
  staleUntil: number;
}

let cachedBranches: CachedBranches | null = null;
let inFlightBranchesPromise: Promise<BranchRecord[]> | null = null;

const BRANCHES_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos fresco
const BRANCHES_STALE_TTL_MS = 60 * 60 * 1000; // 1 hora de margen de respaldo si la BD colapsa

export function clearBranchesCache() {
  cachedBranches = null;
}

/**
 * Obtiene todas las sucursales activas ordenadas con su membrete completo.
 * Utiliza caché en memoria y Promise deduplication para no saturar Supabase.
 */
export async function getActiveBranches(fetchFn?: typeof fetch): Promise<BranchRecord[]> {
  const now = Date.now();

  // 1. Si el caché está fresco, retornar de inmediato
  if (cachedBranches && cachedBranches.expiresAt > now) {
    return cachedBranches.branches;
  }

  // 2. Si ya hay una consulta en curso a Supabase, unirse a ella (Promise Deduplication)
  if (inFlightBranchesPromise) {
    return inFlightBranchesPromise;
  }

  inFlightBranchesPromise = (async () => {
    try {
      const supabaseAdmin = getSupabaseAdmin(fetchFn);
      let { data: dbBranches, error } = await supabaseAdmin
        .from('branches')
        .select('id, name, business_name, rif, address, phone, logo_url, agent_url, agent_token, profit_branch_codes, profit_server_id, local_dns_alias, default_warehouse, allow_decimals_units, default_seller, active, sort_order')
        .eq('active', true)
        .order('sort_order')
        .order('name');

      // Fallback si la columna default_seller aún no ha sido migrada en Supabase
      if (error && error.message.includes('default_seller')) {
        const fallback = await supabaseAdmin
          .from('branches')
          .select('id, name, business_name, rif, address, phone, logo_url, agent_url, agent_token, profit_branch_codes, profit_server_id, local_dns_alias, default_warehouse, allow_decimals_units, active, sort_order')
          .eq('active', true)
          .order('sort_order')
          .order('name');
        dbBranches = fallback.data;
        error = fallback.error;
      }

      // Fallback si default_warehouse o allow_decimals_units no existen
      if (error && (error.message.includes('default_warehouse') || error.message.includes('allow_decimals_units'))) {
        const fallback = await supabaseAdmin
          .from('branches')
          .select('id, name, business_name, rif, address, phone, logo_url, agent_url, agent_token, profit_branch_codes, profit_server_id, local_dns_alias, active, sort_order')
          .eq('active', true)
          .order('sort_order')
          .order('name');
        dbBranches = fallback.data;
        error = fallback.error;
      }

      // Fallback básico si columnas de branding no existen en una instancia legacy
      if (error && (error.message.includes('business_name') || error.message.includes('logo_url'))) {
        const fallback = await supabaseAdmin
          .from('branches')
          .select('id, name, agent_url, agent_token, profit_branch_codes, profit_server_id, local_dns_alias, active, sort_order')
          .eq('active', true)
          .order('sort_order')
          .order('name');
        dbBranches = fallback.data;
        error = fallback.error;
      }

      if (error) {
        console.warn(`[BRANCHES] Supabase error (${error.message}).`);
        // Si falló pero tenemos caché previo (aunque sea stale), salvar la petición
        if (cachedBranches && cachedBranches.staleUntil > now) {
          console.warn('[BRANCHES] Usando caché stale de sucursales como respaldo.');
          return cachedBranches.branches;
        }
        return [];
      }

      const formatted: BranchRecord[] = (dbBranches || []).map((b: any) => {
        let defaultCode = '';
        let isDefault = false;
        if (Array.isArray(b.profit_branch_codes) && b.profit_branch_codes.length > 0) {
          const def = b.profit_branch_codes.find((c: any) => c.is_default);
          if (def) {
            defaultCode = def.code;
            isDefault = true;
          } else {
            defaultCode = b.profit_branch_codes[0].code;
          }
        }
        return {
          id: b.id,
          name: b.name,
          business_name: b.business_name || b.name,
          rif: b.rif || null,
          address: b.address || null,
          phone: b.phone || null,
          logo_url: b.logo_url || null,
          agent_url: b.agent_url,
          agent_token: b.agent_token,
          profit_branch_code: defaultCode,
          profit_branch_codes: b.profit_branch_codes,
          profit_server_id: b.profit_server_id,
          local_dns_alias: b.local_dns_alias,
          default_warehouse: b.default_warehouse,
          allow_decimals_units: b.allow_decimals_units,
          default_seller: b.default_seller,
          active: b.active,
          sort_order: b.sort_order,
          is_default: isDefault
        };
      });

      cachedBranches = {
        branches: formatted,
        expiresAt: now + BRANCHES_CACHE_TTL_MS,
        staleUntil: now + BRANCHES_STALE_TTL_MS
      };

      return formatted;
    } catch (err: any) {
      console.error('[BRANCHES] Error inesperado obteniendo sucursales:', err.message);
      if (cachedBranches) {
        return cachedBranches.branches;
      }
      return [];
    } finally {
      inFlightBranchesPromise = null;
    }
  })();

  return inFlightBranchesPromise;
}

/**
 * Obtiene la configuración y datos legales/membrete completos de una sucursal.
 * Busca por id, profit_server_id o name con soporte de caché, Supabase, DB local y allowedBranches.
 */
export async function getBranchById(
  branchId: string | null | undefined,
  allowedBranches?: any[],
  fetchFn?: typeof fetch
): Promise<BranchRecord | null> {
  const targetId = branchId || (allowedBranches && allowedBranches.length > 0 ? allowedBranches[0]?.id : null);
  if (!targetId) return null;

  const targetStr = String(targetId).trim().toLowerCase();

  // 1. Intentar desde activeBranches (caché en memoria de 10 min)
  try {
    const branches = await getActiveBranches(fetchFn);
    const found = branches.find(b => 
      String(b.id).toLowerCase() === targetStr || 
      String(b.profit_server_id || '').toLowerCase() === targetStr || 
      b.name.trim().toLowerCase() === targetStr
    );
    if (found) return found;
  } catch (e) {
    console.warn('[BRANCHES] Error al buscar en getActiveBranches:', e);
  }

  // 2. Consulta directa a Supabase (por si está inactiva o recién creada)
  try {
    const supabaseAdmin = getSupabaseAdmin(fetchFn);
    const { data, error } = await supabaseAdmin
      .from('branches')
      .select('id, name, business_name, rif, address, phone, logo_url, agent_url, agent_token, profit_branch_codes, profit_server_id, local_dns_alias, default_warehouse, allow_decimals_units, default_seller, active, sort_order')
      .or(`id.eq.${targetId},profit_server_id.eq.${targetId},name.eq.${targetId}`)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return {
        ...data,
        business_name: data.business_name || data.name
      } as BranchRecord;
    }
  } catch (e) {
    console.warn('[BRANCHES] Error en consulta directa a Supabase:', e);
  }

  // 3. Consulta a Local DB si existe
  try {
    const { queryLocalDb } = await import('./local-db');
    const res = await queryLocalDb(
      'SELECT id, name, business_name, rif, address, phone, logo_url, agent_url, agent_token, profit_branch_codes, profit_server_id, local_dns_alias, default_warehouse, allow_decimals_units, default_seller, active, sort_order FROM branches WHERE id::text = $1 OR profit_server_id = $1 OR LOWER(name) = $2 LIMIT 1',
      [targetId, targetStr]
    );
    if (res.rows && res.rows.length > 0) {
      const b = res.rows[0];
      return {
        ...b,
        business_name: b.business_name || b.name
      } as BranchRecord;
    }
  } catch (e) {
    // ignorar
  }

  // 4. Fallback a allowedBranches del perfil de usuario
  if (allowedBranches && allowedBranches.length > 0) {
    const foundAllowed = allowedBranches.find((b: any) => 
      String(b.id).toLowerCase() === targetStr || 
      String(b.profit_server_id || '').toLowerCase() === targetStr || 
      String(b.name || '').trim().toLowerCase() === targetStr
    ) || allowedBranches[0];

    if (foundAllowed) {
      return {
        ...foundAllowed,
        business_name: foundAllowed.business_name || foundAllowed.name,
        rif: foundAllowed.rif || null,
        address: foundAllowed.address || null,
        phone: foundAllowed.phone || null,
        logo_url: foundAllowed.logo_url || null
      } as BranchRecord;
    }
  }

  return null;
}
