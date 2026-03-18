// src/routes/dashboard/sales/orders/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_orders', async () => {
    return {
        title: 'Pedidos'
    };
});
