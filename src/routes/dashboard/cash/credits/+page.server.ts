// src/routes/dashboard/cash/credits/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('cash_credits', async () => {
    return {
        title: 'Devoluciones / Notas de Crédito'
    };
});
