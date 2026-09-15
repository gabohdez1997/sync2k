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

  const isAdmin = profile.roles?.some((r: any) => 
    (typeof r === 'string' && (r.toLowerCase().includes('admin') || r.toLowerCase().includes('administrador'))) || 
    (typeof r === 'object' && (r.name?.toLowerCase().includes('admin') || r.name?.toLowerCase().includes('administrador')))
  );

  if (isAdmin) {
    if (profile.permissions[optionId]?.[action] === false) {
      return false;
    }
    return true;
  }

  const hasIt = profile.permissions[optionId]?.[action] ?? false;

  if (!hasIt) {
    console.log(`[PERMISSIONS] Acceso DENEGADO para ${profile.email}: ${optionId}.${action}`);
    // console.log(`[PERMISSIONS] Permisos actuales:`, JSON.stringify(profile.permissions));
  }

  return hasIt;
}

interface CachedProfile {
  profile: Profile;
  expiresAt: number;
  staleUntil: number;
}

const profileCache = new Map<string, CachedProfile>();
const inFlightProfiles = new Map<string, Promise<Profile | null>>();
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos de cache fresco en memoria
const PROFILE_STALE_TTL_MS = 60 * 60 * 1000; // 1 hora de respaldo stale en caso de caída/saturación

export function clearProfileCache(userId?: string) {
  if (userId) {
    profileCache.delete(userId);
    inFlightProfiles.delete(userId);
  } else {
    profileCache.clear();
    inFlightProfiles.clear();
  }
}

/**
 * Obtiene el perfil completo del usuario desde la vista profile_complete.
 * Prioriza Supabase (Cloud). Si falla por red o saturación 500/502, usa PostgreSQL (Local) o sirve caché stale.
 */
export async function getUserProfile(userId: string, fetchFn?: typeof fetch): Promise<Profile | null> {
  const now = Date.now();
  const cached = profileCache.get(userId);

  // 1. Si el caché está fresco, retornar de inmediato
  if (cached && cached.expiresAt > now) {
    return cached.profile;
  }

  // 2. Si ya hay una consulta en curso a Supabase para este usuario, reutilizar la misma promesa (Promise Deduplication)
  if (inFlightProfiles.has(userId)) {
    return inFlightProfiles.get(userId)!;
  }

  const fetchPromise = (async () => {
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
        console.warn(`[AUTH ONLINE] Supabase error para ${userId}: ${error.message} (Code: ${error.code || 'N/A'})`);
        
        // Si la BD de Supabase está saturada (500, 502, timeout, etc.) y tenemos caché stale, usarlo sin expulsar al usuario
        if (cached && cached.staleUntil > now) {
          console.warn(`[AUTH ONLINE] Usando perfil en caché stale de respaldo para ${userId} tras error de Supabase.`);
          return cached.profile;
        }

        const isNetworkOrServerError = 
          error.message?.includes('fetch failed') || 
          error.message?.includes('Failed to fetch') ||
          error.message?.includes('502') ||
          error.message?.includes('500') ||
          error.message?.includes('503') ||
          error.message?.includes('504') ||
          error.message?.includes('upstream connect error') ||
          error.message?.includes('timeout') ||
          error.message?.includes('ETIMEDOUT');

        if (isNetworkOrServerError) {
          isOfflineFallback = true;
        } else {
          return null;
        }
      } else if (!results || results.length === 0) {
        console.warn(`[AUTH ONLINE] Perfil no encontrado para UID: ${userId}`);
        if (cached && cached.staleUntil > now) return cached.profile;
        return null;
      } else {
        rawData = results[0];
      }

    } catch (err: any) {
      console.warn(`[AUTH] Excepción consultando Supabase para ${userId}:`, err.message);
      if (cached && cached.staleUntil > now) {
        console.warn(`[AUTH] Usando perfil en caché stale para ${userId} tras excepción.`);
        return cached.profile;
      }
      isOfflineFallback = true;
    }

    // ── 2. Intento Offline (PostgreSQL Local) ──
    if (isOfflineFallback) {
      console.warn(`[AUTH] 🔴 Supabase no disponible o saturado. Intentando perfil de ${userId} desde BD Local...`);
      try {
        const { queryLocalDb } = await import('$lib/server/local-db');
        const res = await queryLocalDb('SELECT * FROM profile_complete WHERE id = $1', [userId]);

        if (res.rows.length > 0) {
          rawData = res.rows[0];
        } else {
          console.warn(`[AUTH OFFLINE] Perfil no encontrado localmente para UID: ${userId}`);
        }
      } catch (localErr: any) {
        console.warn(`[AUTH OFFLINE] Falló PG local para ${userId}:`, localErr.message);
      }
    }

    // ── 3. Parseo y formateo común ──
    if (!rawData) {
      if (cached && cached.staleUntil > now) {
        console.warn(`[AUTH] Usando perfil en caché de respaldo para ${userId} tras fallo en BDs.`);
        return cached.profile;
      }
      console.warn(`[AUTH] Perfil definitivamente no encontrado para UID: ${userId}`);
      return null;
    }

    // Fallback: Si la vista profile_complete no tiene theme_config (stale view)
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

    const profile: Profile = {
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

    profileCache.set(userId, {
      profile,
      expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
      staleUntil: Date.now() + PROFILE_STALE_TTL_MS
    });

    return profile;
  })();

  inFlightProfiles.set(userId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightProfiles.delete(userId);
  }
}
