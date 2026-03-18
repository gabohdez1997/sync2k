// src/routes/dashboard/inventory/void/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('inv_void', async () => {
    return {
        title: 'Anulación de Documentos'
    };
});
