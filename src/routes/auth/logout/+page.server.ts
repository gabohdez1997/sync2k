import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ cookies }) => {
        // Destroy the firebase session cookie
		cookies.delete('session', { path: '/' });
		redirect(303, '/');
	}
};
