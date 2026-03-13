// src/routes/+layout.server.ts
// Root layout server — pasa sesión y perfil al cliente de forma segura.
// Todos los layouts/pages hijos heredan este `data`.

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  const { session, profile } = locals;

  return {
    session,
    // Solo pasar datos seguros al cliente (nunca service_role keys, etc.)
    profile: profile
      ? {
          id: profile.id,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          permissions: profile.permissions,
          roles: profile.roles.map((r) => ({ id: r.id, name: r.name })),
          company: profile.company
            ? {
                id: profile.company.id,
                name: profile.company.name,
                slug: profile.company.slug
              }
            : null
        }
      : null
  };
};
