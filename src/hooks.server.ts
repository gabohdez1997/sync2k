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

  // ── 2. Identificación Principal (Online) ──────────────────────────
  let authErrorObj = null;
  let session = null;

  try {
    const resAuth = await supabase.auth.getSession();
    if (resAuth.data.session) {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        authErrorObj = error;
        // Resiliencia: si el token en la sesión aún es cronológicamente válido,
        // no descartar la sesión por un hipo de red con Supabase Cloud
        const expiresAtSec = resAuth.data.session.expires_at || 0;
        if (expiresAtSec * 1000 > Date.now() && resAuth.data.session.user) {
          console.warn('[HOOKS] getUser() falló pero la sesión es válida hasta:', new Date(expiresAtSec * 1000).toISOString(), error.message);
          session = resAuth.data.session;
        }
      } else {
        session = resAuth.data.session;
        session.user = user;
      }
    }
    if (resAuth.error) authErrorObj = resAuth.error;
  } catch (err: any) {
    authErrorObj = err;
    console.warn('[HOOKS] Supabase Auth falló (¿Offline?):', err.message);
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
          
          // Opcional: si hay red, podríamos intentar redirigir a login o forzar limpieza, 
          // pero dejémoslo usar su sesión local sin problema por hoy.
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

    // Obtiene perfil (automáticamente hace fallback a BD local si Supabase se cae)
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
    if (!event.locals.session) {
      redirect(303, `/?redirectTo=${encodeURIComponent(path)}`);
    }
    if (!event.locals.profile) {
      console.warn(`[HOOKS] Perfil no disponible para usuario ${event.locals.session.user.id}. Redirigiendo a inicio.`);
      redirect(303, '/?error=profile_not_found');
    }
  }

  // ── 6. Respuesta ──────────────────────────────────────────────────
  return resolve(event, {
    filterSerializedResponseHeaders: (name) =>
      name === 'content-range' || name === 'x-supabase-api-version'
  });
};
