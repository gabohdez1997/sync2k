// src/routes/+layout.server.ts
// Root layout server — pasa sesión y perfil al cliente de forma segura.
// Todos los layouts/pages hijos heredan este `data`.

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  const { session, profile, tenantId } = locals;

  return {
    session,
    tenantId,
    // Solo pasar datos seguros al cliente (nunca service_role keys, etc.)
    profile: profile
      ? {
          uid: profile.uid,
          full_name: profile.full_name,
          email: profile.email,
          permissions: profile.permissions,
          roles: profile.roles.map((r) => ({ id: r.id, name: r.name })),
          active: profile.active,
          company: profile.company || { id: 'default', name: 'Sync2K', slug: 'sync2k' }
        }
      : null
  };
};
