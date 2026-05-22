import { getSupabaseAdmin } from '$lib/server/supabase';

export type CRUD = {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  void?: boolean;
  others: boolean;
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
  theme_config: {
    mode: 'light' | 'dark' | 'system';
    accentHue: number;
    accentSaturation: number;
  } | null;
};

export function hasPermission(
  profile: Profile,
  optionId: string,
  action: keyof CRUD = 'read'
): boolean {
  if (!profile.permissions) {
    console.warn(`[PERMISSIONS] El perfil de ${profile.email} no tiene objeto de permisos.`);
    return false;
  }

  const hasIt = profile.permissions[optionId]?.[action] ?? false;

  if (!hasIt) {
    console.log(`[PERMISSIONS] Acceso DENEGADO para ${profile.email}: ${optionId}.${action}`);
    // console.log(`[PERMISSIONS] Permisos actuales:`, JSON.stringify(profile.permissions));
  }

  return hasIt;
}

/**
 * Obtiene el perfil completo del usuario desde la vista profile_complete.
 * Prioriza Supabase (Cloud). Si falla por red, usa PostgreSQL (Local).
 */
export async function getUserProfile(userId: string, fetchFn?: typeof fetch): Promise<Profile | null> {
  const supabaseAdmin = getSupabaseAdmin(fetchFn);
  let isOfflineFallback = false;
  let rawData = null;

  try {
    // ── 1. Intento Online (Supabase Cloud) ──
    const { data: results, error } = await supabaseAdmin
      .from('profile_complete')
      .select('*')
      .eq('id', userId);

    if (error) {
      if (error.message?.includes('fetch failed') || error.message?.includes('Failed to fetch')) {
        throw new Error('OFFLINE');
      }
      console.error(`[AUTH ONLINE] Error obteniendo perfil para ${userId}:`, error.message);
      return null;
    }
    
    if (!results || results.length === 0) {
      console.warn(`[AUTH ONLINE] Perfil no encontrado para UID: ${userId}`);
      return null;
    }

    if (results.length > 1) {
      console.error(`[AUTH ONLINE] ¡CRÍTICO! Se encontraron ${results.length} registros para el UID: ${userId}. Usando el primero.`);
    }

    rawData = results[0];

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

  // Fallback: Si la vista profile_complete no tiene theme_config (stale view)
  // intentamos obtenerlo directamente de la tabla profiles.
  if (rawData.theme_config === undefined) {
    try {
        if (isOfflineFallback) {
            const { queryLocalDb } = await import('$lib/server/local-db');
            const res = await queryLocalDb('SELECT theme_config FROM profiles WHERE id = $1', [userId]);
            if (res.rows[0]) rawData.theme_config = res.rows[0].theme_config;
        } else {
            const { data } = await supabaseAdmin.from('profiles').select('theme_config').eq('id', userId).single();
            if (data) rawData.theme_config = data.theme_config;
        }
    } catch (e) {
        // Ignorar si falla el fallback
    }
  }

  // Log de éxito interno para depuración en Vercel si es necesario
  if (rawData.permissions && Object.keys(rawData.permissions).length > 0) {
     console.log(`[AUTH] Perfil cargado para ${rawData.email}. Permisos detected: ${Object.keys(rawData.permissions).length}`);
  } else {
     console.warn(`[AUTH] Advertencia: El perfil de ${rawData.email} no tiene permisos definidos.`);
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
    theme_config:      rawData.theme_config || null,
  };
}
