// src/routes/dashboard/billing/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('cash_billing', async () => {
    return {
        title: 'Facturas / Nota de Entrega'
    };
});
