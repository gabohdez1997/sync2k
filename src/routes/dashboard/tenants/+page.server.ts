// src/routes/dashboard/tenants/+page.server.ts
// DEPRECADO — La gestión multi-tenant se eliminó.
// Las sucursales ahora se gestionan en /dashboard/branches
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  redirect(301, '/dashboard/branches');
};
