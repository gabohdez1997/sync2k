// src/routes/+layout.server.ts
// Pasa la sesión y el perfil a todas las páginas

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    session: locals.session,
    profile: locals.profile
  };
};
