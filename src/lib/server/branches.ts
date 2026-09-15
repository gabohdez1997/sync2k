// src/lib/server/branches.ts
// Gestión de sucursales con caché en memoria y resiliencia ante saturación de Supabase

import { getSupabaseAdmin } from './supabase';

export interface BranchRecord {
  id: string;
  name: string;
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
 * Obtiene todas las sucursales activas ordenadas.
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
        .select('id, name, agent_url, agent_token, profit_branch_codes, profit_server_id, local_dns_alias, default_warehouse, allow_decimals_units, default_seller, active, sort_order')
        .eq('active', true)
        .order('sort_order')
        .order('name');

      // Fallback si la columna default_seller aún no ha sido migrada en Supabase
      if (error && error.message.includes('default_seller')) {
        const fallback = await supabaseAdmin
          .from('branches')
          .select('id, name, agent_url, agent_token, profit_branch_codes, profit_server_id, local_dns_alias, default_warehouse, allow_decimals_units, active, sort_order')
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
