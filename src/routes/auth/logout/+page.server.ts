// src/routes/auth/logout/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	// Cerramos sesión de Supabase si existe
	await locals.supabase.auth.signOut();
	
	// Limpieza de sesiones locales legacy si quedaran
	cookies.delete('sync2k_local_session', { path: '/' });

	// Redirigir siempre a la raíz
	redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ locals, cookies }) => {
		await locals.supabase.auth.signOut();
		cookies.delete('sync2k_local_session', { path: '/' });
		redirect(303, '/');
	}
};
