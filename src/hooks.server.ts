// src/hooks.server.ts
import { redirect, type Handle } from '@sveltejs/kit';
import { adminAuth } from '$lib/server/firebase-admin';
import { getUserProfile } from '$lib/server/auth';

// ─── Rutas que NO requieren autenticación ────────────────────
const PUBLIC_ROUTES = [
  '/',
  '/auth/register',
  '/auth/forgot-password',
  '/api/login',
  '/api/repair-auth'
];



export const handle: Handle = async ({ event, resolve }) => {
  // ... (existing logic for tenant and session)
  const host = event.request.headers.get('host') || '';
  let tenantId: string | null = null;
  
  // Limpiar el puerto si existe
  const hostName = host.split(':')[0];
  const parts = hostName.split('.');

  // Lógica de Subdominio:
  // 1. Si es algo.localhost o algo.midominio.com (3+ partes)
  if (parts.length >= 2) {
    // Si la última parte es localhost y hay algo antes
    if (parts[parts.length - 1] === 'localhost' && parts.length > 1) {
      tenantId = parts[0];
    } 
    // Para dominios reales (ej: cliente.sync2k.com)
    else if (parts.length >= 3 && parts[0] !== 'www') {
      tenantId = parts[0];
    }
  }

  // Fallback a query param solo para debugging rápido en localhost pelado
  if (!tenantId && hostName === 'localhost') {
    tenantId = event.url.searchParams.get('tenant') || 'default_tenant';
  }

  event.locals.tenantId = tenantId;

  const path = event.url.pathname;
  const isPublicRoute = PUBLIC_ROUTES.some((r) => 
    r === '/' ? path === '/' : path.startsWith(r)
  );

  const sessionCookie = event.cookies.get('session');
  event.locals.session = null;
  event.locals.profile = null;

  if (sessionCookie && adminAuth) {
    try {
      event.locals.session = await adminAuth.verifySessionCookie(sessionCookie, true);
    } catch (error) {
      event.cookies.delete('session', { path: '/' });
    }
  }

  if (event.locals.session) {
    const profile = await getUserProfile(event.locals.session.uid, event.locals.tenantId);
    if (profile) {
      if (profile.active) {
        event.locals.profile = profile;
      } else if (!isPublicRoute) {
        redirect(303, '/?error=account_disabled');
      }
    } else if (!isPublicRoute) {
      event.cookies.delete('session', { path: '/' });
      redirect(303, '/?error=profile_not_found');
    }
  }

  if (!isPublicRoute) {
    if (!event.locals.session) {
      redirect(303, `/?redirectTo=${encodeURIComponent(path)}`);
    }

    const profile = event.locals.profile;
    if (!profile) {
      // Si llegamos aquí sin perfil y no es ruta pública, algo falló arriba
      redirect(303, '/?error=profile_not_found');
    }
  }

  return resolve(event);
};
