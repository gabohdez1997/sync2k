// src/routes/dashboard/inventory/shipping/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('inv_shipping', async () => {
    return {
        title: 'Despacho de Mercancía'
    };
});
