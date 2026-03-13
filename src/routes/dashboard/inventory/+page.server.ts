// src/routes/dashboard/inventory/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('consultar_stock', async ({ locals }) => {
	const { supabase, profile } = locals;

	// Simulación de productos filtrados por empresa
	// En un caso real, haríamos: 
	// const { data: products } = await supabase.from('products').select('*').eq('company_id', profile.company_id);

	return {
		products: [
			{ id: '1', name: 'Laptop Pro 16"', sku: 'LAP-16-P', stock: 12, price: 1200 },
			{ id: '2', name: 'Monitor 4K 27"', sku: 'MON-27-4K', stock: 5, price: 450 },
			{ id: '3', name: 'Teclado Mecánico', sku: 'KBD-MECH', stock: 45, price: 80 },
			{ id: '4', name: 'Ratón Inalámbrico', sku: 'MSE-WIRE', stock: 0, price: 45 },
		]
	};
});
