// src/hooks.server.ts
//
// Hook global de SvelteKit. Responsabilidades:
//  1. Crear el cliente Supabase con la sesión del request (auth-helpers).
//  2. Refrescar el token si expiró.
//  3. Cargar el perfil completo del usuario (con roles y permisos) en locals.
//  4. Redirigir rutas protegidas si no hay sesión.
//  5. Redirigir rutas de admin si el usuario no tiene el permiso correcto.

import { createServerClient } from '@supabase/auth-helpers-sveltekit';
import { redirect, type Handle } from '@sveltejs/kit';
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY
} from '$env/static/public';
import { getUserProfile } from '$lib/server/auth';
import type { Database } from '$lib/types/supabase';

// ─── Rutas que NO requieren autenticación ────────────────────
const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/callback'          // Supabase OAuth callback
];

// ─── Reglas de permisos por ruta ─────────────────────────────
// Cada entrada: [prefijo de ruta, permiso requerido]
const ROUTE_PERMISSIONS: [string, string][] = [
  ['/dashboard/users',    'gestionar_usuarios'],
  ['/dashboard/billing',  'facturar'],
  ['/dashboard/inventory','consultar_stock'],
  ['/dashboard/settings', 'gestionar_empresa']
];

export const handle: Handle = async ({ event, resolve }) => {
  // ── 1. Crear cliente Supabase con cookies del request ──────
  event.locals.supabase = createServerClient<Database>(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (key) => event.cookies.get(key),
        set: (key, value, options) => event.cookies.set(key, value, { ...options, path: '/' }),
        remove: (key, options) => event.cookies.delete(key, { ...options, path: '/' })
      }
    }
  );

  // ── 2. Helper para obtener sesión (refresca token auto) ────
  event.locals.getSession = async () => {
    const {
      data: { session }
    } = await event.locals.supabase.auth.getSession();
    return session;
  };

  const path = event.url.pathname;
  const isPublicRoute = PUBLIC_ROUTES.some((r) => path.startsWith(r));

  // ── 3. Cargar perfil si la ruta no es pública ──────────────
  if (!isPublicRoute) {
    const session = await event.locals.getSession();

    // Sin sesión → redirigir al login
    if (!session) {
      redirect(303, `/auth/login?redirectTo=${encodeURIComponent(path)}`);
    }

    // Cargar perfil completo (empresa + roles + permisos)
    const profile = await getUserProfile(event.locals.supabase);

    if (!profile) {
      // Usuario autenticado pero sin perfil (error de datos) → logout
      await event.locals.supabase.auth.signOut();
      redirect(303, '/auth/login?error=profile_not_found');
    }

    if (!profile.is_active) {
      redirect(303, '/auth/login?error=account_disabled');
    }

    // Guardar en locals (disponible en todos los load/actions de la request)
    event.locals.profile = profile;
    event.locals.session = session;

    // ── 4. Verificar permisos por ruta ─────────────────────
    for (const [routePrefix, permission] of ROUTE_PERMISSIONS) {
      if (path.startsWith(routePrefix)) {
        if (!profile.permissions.includes(permission)) {
          redirect(303, '/dashboard?error=no_permission');
        }
        break;
      }
    }
  }

  // ── 5. Resolver la request normalmente ─────────────────────
  return resolve(event, {
    // Necesario para que Supabase pueda setear cookies
    filterSerializedResponseHeaders(name) {
      return name === 'content-range' || name === 'x-supabase-api-version';
    }
  });
};
