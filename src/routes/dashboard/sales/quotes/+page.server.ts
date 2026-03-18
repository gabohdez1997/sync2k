// src/routes/dashboard/sales/quotes/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_quotes', async () => {
    return {
        title: 'Cotizaciones'
    };
});
