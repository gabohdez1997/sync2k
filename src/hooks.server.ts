// src/hooks.server.ts
// Gateway SSR — Supabase Auth + Fallback Local

import { redirect, type Handle } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { getUserProfile } from '$lib/server/auth';
import { jwtVerify } from 'jose';

// Rutas que NO requieren sesión activa
const PUBLIC_ROUTES = [
  '/',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/logout',
  '/api/login',
];

// Caché en memoria de tokens validados recientemente (evita peticiones HTTP repetidas a /auth/v1/user)
interface VerifiedTokenCache {
  user: any;
  expiresAt: number;
}
const verifiedTokensCache = new Map<string, VerifiedTokenCache>();
const TOKEN_CACHE_TTL_MS = 60 * 1000; // 60 segundos de gracia por token

export const handle: Handle = async ({ event, resolve }) => {
  // ── 1. Cliente Nube (Supabase SSR) ──
  const supabase = createServerClient(
    publicEnv.PUBLIC_SUPABASE_URL || '',
    publicEnv.PUBLIC_SUPABASE_ANON_KEY || '',
    {
      global: { fetch: event.fetch },
      cookies: {
        getAll:  () => event.cookies.getAll(),
        setAll: (cookiesToSet) => {
          const isHttps = event.url.protocol === 'https:';
          cookiesToSet.forEach(({ name, value, options }) => {
            event.cookies.set(name, value, { 
              ...options, 
              path: '/',
              secure: isHttps ? (options.secure ?? true) : false 
            });
          });
        }
      }
    }
  );

  event.locals.supabase = supabase;
  event.locals.session  = null;
  event.locals.profile  = null;

  // ── 2. Identificación Principal (Online con Caché de Validación) ────
  let authErrorObj = null;
  let session = null;

  try {
    const resAuth = await supabase.auth.getSession();
    if (resAuth.data.session) {
      const currentSession = resAuth.data.session;
      const accessToken = currentSession.access_token;
      const expiresAtSec = currentSession.expires_at || 0;
      const isTokenChronologicallyValid = expiresAtSec * 1000 > Date.now();

      if (isTokenChronologicallyValid) {
        const now = Date.now();
        const cachedToken = verifiedTokensCache.get(accessToken);

        if (cachedToken && cachedToken.expiresAt > now) {
          // Token ya validado en este proceso: reutilizar sin llamada de red a Supabase Auth
          session = currentSession;
          session.user = cachedToken.user;
        } else {
          // Validar con Supabase Auth con tolerancia total ante 500/502/timeout
          try {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error) {
              authErrorObj = error;
              console.warn('[HOOKS] getUser() arrojó error pero la sesión es válida hasta:', new Date(expiresAtSec * 1000).toISOString(), error.message);
              // Si el token en la sesión aún es cronológicamente válido, no descartar la sesión
              session = currentSession;
              if (currentSession.user) {
                session.user = currentSession.user;
                verifiedTokensCache.set(accessToken, {
                  user: currentSession.user,
                  expiresAt: now + 30 * 1000 // Cooldown de 30s para no martillar Supabase si está saturado
                });
              }
            } else if (user) {
              session = currentSession;
              session.user = user;
              verifiedTokensCache.set(accessToken, {
                user,
                expiresAt: now + TOKEN_CACHE_TTL_MS
              });
            }
          } catch (getUserErr: any) {
            console.warn('[HOOKS] Excepción en getUser(), preservando sesión válida:', getUserErr.message);
            session = currentSession;
            if (currentSession.user) {
              session.user = currentSession.user;
            }
          }
        }
      } else {
        // Token expirado: intentar obtener usuario / renovar
        const { data: { user }, error } = await supabase.auth.getUser();
        if (!error && user) {
          session = currentSession;
          session.user = user;
        }
      }
    }
    if (resAuth.error) authErrorObj = resAuth.error;
  } catch (err: any) {
    authErrorObj = err;
    console.warn('[HOOKS] Supabase Auth falló (¿Offline?):', err.message);
  }

  // Limpieza preventiva de caché si crece demasiado
  if (verifiedTokensCache.size > 500) {
    const now = Date.now();
    verifiedTokensCache.forEach((entry, t) => {
      if (entry.expiresAt <= now) verifiedTokensCache.delete(t);
    });
  }

  // ── 3. Identificación Fallback (Offline) ────────────────────────
  let isOfflineMode = false;

  if (!session) {
    const localToken = event.cookies.get('sync2k_local_session');
    if (localToken) {
      try {
        const secretRaw = privateEnv.LOCAL_JWT_SECRET || 'secret_fallback';
        const secret = new TextEncoder().encode(secretRaw);
        const { payload } = await jwtVerify(localToken, secret);
        
        if (payload && payload.sub) {
          isOfflineMode = true;
          session = {
            user: { id: payload.sub, email: payload.email as string },
            access_token: localToken,
            refresh_token: ''
          } as any;
        }
      } catch (err) {
        // Token inválido o expirado. Limpiar.
        event.cookies.delete('sync2k_local_session', { path: '/' });
      }
    }
  }

  // ── 4. Carga de Perfil ────────────────────────────────────────────
  if (session?.user) {
    event.locals.session = session;

    // Obtiene perfil (con deduplicación de consultas y caché Stale-While-Revalidate)
    const profile = await getUserProfile(session.user.id, event.fetch);

    if (profile?.active) {
      event.locals.profile = profile;
    } else if (profile && !profile.active) {
      event.locals.profile = null;
    }
  }

  // ── 5. Protección de rutas privadas ────────────────────────────────
  const path = event.url.pathname;
  const isPublic = PUBLIC_ROUTES.some(r =>
    r === '/' ? path === '/' : path.startsWith(r)
  );

  if (!isPublic) {
    const isApiRequest = path.startsWith('/api/');

    if (!event.locals.session) {
      if (isApiRequest) {
        return new Response(JSON.stringify({ error: 'unauthorized', message: 'Sesión no iniciada' }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        });
      }
      redirect(303, `/?redirectTo=${encodeURIComponent(path)}`);
    }

    if (!event.locals.profile) {
      console.warn(`[HOOKS] Perfil no disponible para usuario ${event.locals.session.user.id}.`);
      if (isApiRequest) {
        return new Response(JSON.stringify({ error: 'profile_not_found', message: 'Perfil no disponible temporalmente' }), {
          status: 503,
          headers: { 'content-type': 'application/json' }
        });
      }
      redirect(303, '/?error=profile_not_found');
    }
  }

  // ── 6. Respuesta ──────────────────────────────────────────────────
  return resolve(event, {
    filterSerializedResponseHeaders: (name) =>
      name === 'content-range' || name === 'x-supabase-api-version'
  });
};
