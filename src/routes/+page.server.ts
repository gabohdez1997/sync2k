import type { PageServerLoad } from './$types';
import { getSystemSettings } from '$lib/server/settings';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	// Si ya hay sesión, redirigir al dashboard
	if (locals.session && locals.profile) {
		redirect(303, '/dashboard');
	}

	// Obtener configuraciones de branding
	const systemSettings = await getSystemSettings();

	return {
		systemSettings
	};
};
