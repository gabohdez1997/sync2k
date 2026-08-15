// src/routes/dashboard/reports/analisis-compras/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
    const search = url.search;
    throw redirect(307, `/dashboard/reports/purchases-analysis${search}`);
};
