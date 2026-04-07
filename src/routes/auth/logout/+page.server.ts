// src/routes/auth/logout/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ locals }) => {
    await locals.supabase.auth.signOut();
    redirect(303, '/');
  }
};
