// src/routes/dashboard/purchases/returns/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_returns', async () => {
    return {
        title: 'Devoluciones',
        subtitle: 'Gestión de devoluciones de mercancía y créditos.'
    };
});
