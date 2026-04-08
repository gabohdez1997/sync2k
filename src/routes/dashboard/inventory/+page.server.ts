// src/routes/dashboard/inventory/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('inv_catalog', async ({ locals }) => {
	// TODO: Implementar consulta real a través del AgentClient 
    // similar a la lógica de quotes/articulos

	return {
		products: [],
	};
});
