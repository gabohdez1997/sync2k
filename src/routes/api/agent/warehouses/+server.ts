import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';

/**
 * GET /api/agent/warehouses?branch_id=...
 * Migrado de Firestore → Supabase.
 * Obtiene los almacenes desde el agente asociado a una sucursal específica.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	// Simple auth check
	if (!locals.profile?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const branchId = url.searchParams.get('branch_id');
	if (!branchId) {
		return json({ error: 'branch_id is required' }, { status: 400 });
	}

	try {
		// Buscamos la sucursal en Supabase (Única fuente de verdad)
		const { data: branch, error } = await supabaseAdmin
			.from('branches')
			.select('*')
			.eq('id', branchId)
			.single();

		if (error || !branch) {
			return json({ error: 'Sucursal no encontrada' }, { status: 404 });
		}
		
		if (!branch.agent_url) {
			return json({ error: 'La sucursal no tiene un agente configurado' }, { status: 404 });
		}

		const agentClient = new AgentClient({
			slug: branch.id,
			agent_url: branch.agent_url,
			agent_api_key: branch.agent_token
		});

		// Fetch warehouses from Agent
		const resData = await agentClient.request<any>('/catalogos/almacenes');

		if (resData.success === false) {
			return json({ error: resData.message || 'Error del Agente' }, { status: 500 });
		}

		let warehouses = (resData as any)?.data || (Array.isArray(resData) ? resData : []);
		if (!Array.isArray(warehouses)) warehouses = [];

		const profileWarehouses: string[] = locals.profile?.allowed_warehouses || [];
		const isAdmin = profileWarehouses.length === 0 || locals.profile?.role === 'admin' || (Array.isArray(locals.profile?.roles) && locals.profile.roles.includes('admin'));

		if (!isAdmin && profileWarehouses.length > 0) {
			warehouses = warehouses.filter((a: any) => {
				const almaId = String(a.co_alma || a.id || a.warehouse_id || '').trim();
				return profileWarehouses.some(pw => String(pw).trim() === almaId);
			});
		}

		return json({ warehouses });

	} catch (err: any) {
		console.error('[API WAREHOUSES] Error:', err.message);
		return json({ error: err.message }, { status: 500 });
	}
};
