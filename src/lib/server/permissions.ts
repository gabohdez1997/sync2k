// src/lib/server/permissions.ts
//
// Decorador/utilidad para proteger Actions y Load functions
// en +page.server.ts con verificación de permisos por clave.
//
// Uso en una action:
//
//   export const actions: Actions = {
//     crearFactura: protectAction('facturar', async ({ locals }) => {
//       // ... lógica segura
//     })
//   };
//
// Uso en un load:
//
//   export const load = protectLoad('consultar_stock', async ({ locals }) => {
//     // ... datos protegidos
//   });

import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { hasPermission, type Profile } from './auth';

// ─── Tipos auxiliares ────────────────────────────────────────
type ActionHandler<T = unknown> = (event: RequestEvent) => Promise<T> | T;
type LoadHandler<T = unknown> = (event: RequestEvent) => Promise<T> | T;

/**
 * Obtiene el perfil del usuario desde locals (ya poblado por hooks.server.ts).
 * Lanza 401 si no hay sesión, 403 si no tiene el permiso requerido.
 */
function assertPermission(locals: App.Locals, permission: string): Profile {
  const profile = locals.profile;

  if (!profile) {
    redirect(303, '/auth/login');
  }

  if (!hasPermission(profile, permission)) {
    error(403, {
      message: `No tienes permiso para realizar esta acción. Se requiere: "${permission}"`
    });
  }

  return profile;
}

/**
 * Protege una Action de SvelteKit con un permiso requerido.
 *
 * @param permission  Clave del permiso (ej: 'facturar')
 * @param handler     La función action original
 */
export function protectAction<T>(
  permission: string,
  handler: ActionHandler<T>
): ActionHandler<T> {
  return (event: RequestEvent) => {
    assertPermission(event.locals, permission);
    return handler(event);
  };
}

/**
 * Protege una función load de SvelteKit con un permiso requerido.
 *
 * @param permission  Clave del permiso (ej: 'consultar_stock')
 * @param handler     La función load original
 */
export function protectLoad<T>(
  permission: string,
  handler: LoadHandler<T>
): LoadHandler<T> {
  return (event: RequestEvent) => {
    assertPermission(event.locals, permission);
    return handler(event);
  };
}

/**
 * Alias para verificar múltiples permisos (OR logic — basta con uno).
 * Útil cuando un mismo recurso puede ser accedido por diferentes permisos.
 */
export function protectActionAny<T>(
  permissions: string[],
  handler: ActionHandler<T>
): ActionHandler<T> {
  return (event: RequestEvent) => {
    const profile = event.locals.profile;
    if (!profile) redirect(303, '/auth/login');

    const authorized = permissions.some((p) => hasPermission(profile, p));
    if (!authorized) {
      error(403, {
        message: `Se requiere alguno de los siguientes permisos: ${permissions.join(', ')}`
      });
    }

    return handler(event);
  };
}
