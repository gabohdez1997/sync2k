// src/routes/dashboard/cash/payments/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('cash_payments', async () => {
    return {
        title: 'Gestión de Cobros'
    };
});
