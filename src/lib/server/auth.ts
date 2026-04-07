import { supabaseAdmin } from '$lib/server/supabase';

export type CRUD = {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
};

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  active: boolean;
  permissions: Record<string, CRUD>;
  roles: Array<{ id: string; name: string }>;
  allowed_branches: Array<{
    id: string;
    name: string;
    agent_url: string | null;
    agent_token: string;
    profit_branch_code: string | null;
    profit_server_id: string | null;
    local_dns_alias: string | null;
  }>;
  allowed_warehouses: string[];
  profit_user: string | null;
  profit_pass: string | null;
};

export function hasPermission(
  profile: Profile,
  optionId: string,
  action: keyof CRUD = 'read'
): boolean {
  return profile.permissions[optionId]?.[action] ?? false;
}

/**
 * Obtiene el perfil completo del usuario desde la vista profile_complete.
 * Prioriza Supabase (Cloud). Si falla por red, usa PostgreSQL (Local).
 */
export async function getUserProfile(userId: string): Promise<Profile | null> {
  let isOfflineFallback = false;
  let rawData = null;

  try {
    // ── 1. Intento Online (Supabase Cloud) ──
    const { data, error } = await supabaseAdmin
      .from('profile_complete')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.message?.includes('fetch failed') || error.message?.includes('Failed to fetch')) {
        throw new Error('OFFLINE');
      }
      console.error(`[AUTH ONLINE] Error obteniendo perfil para ${userId}:`, error.message);
      return null;
    }
    
    rawData = data;

  } catch (err: any) {
    if (err.message !== 'OFFLINE' && !err.message?.includes('fetch failed') && !err.message?.includes('ETIMEDOUT')) {
      console.error(`[AUTH] Error crítico inesperado para ${userId}:`, err.message);
      return null;
    }
    isOfflineFallback = true;
  }

  // ── 2. Intento Offline (PostgreSQL Local) ──
  if (isOfflineFallback) {
    console.warn(`[AUTH] 🔴 Sin internet. Obteniendo perfil de ${userId} desde Base de Datos Local...`);
    try {
      const { queryLocalDb } = await import('$lib/server/local-db');
      const res = await queryLocalDb('SELECT * FROM profile_complete WHERE id = $1', [userId]);

      if (res.rows.length === 0) {
        console.warn(`[AUTH OFFLINE] Perfil no encontrado localmente para UID: ${userId}`);
        return null;
      }

      rawData = res.rows[0];

    } catch (localErr: any) {
      console.error(`[AUTH OFFLINE] Error catastrófico: falló Supabase y falló PG local para ${userId}:`, localErr.message);
      return null;
    }
  }

  // ── 3. Parseo y formateo común ──
  if (!rawData) {
    console.warn(`[AUTH] Perfil no encontrado para UID: ${userId}`);
    return null;
  }

  return {
    id:                rawData.id,
    full_name:         rawData.full_name ?? null,
    email:             rawData.email ?? null,
    active:            rawData.active ?? false,
    permissions:       rawData.permissions ?? {},
    roles:             rawData.roles ?? [],
    allowed_branches:  rawData.allowed_branches ?? [],
    allowed_warehouses: rawData.allowed_warehouses ?? [],
    profit_user:       rawData.profit_user ?? null,
    profit_pass:       rawData.profit_pass ?? null,
  };
}
