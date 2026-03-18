// src/routes/dashboard/purchases/pending/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_pending', async () => {
    return {
        title: 'Compras Pendientes'
    };
});
