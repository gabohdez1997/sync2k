// src/routes/api/agent/payments/pending-documents/+server.ts
import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, fetch }) => {
	try {
		const profile = locals.profile;
		if (!profile) return json({ error: 'Sesión no válida' }, { status: 401 });

		const branchId = url.searchParams.get('branch_id');
		const allowedBranches = profile.allowed_branches || [];
		const branch = allowedBranches.find(b => b.id === branchId) || allowedBranches[0];

		if (!branch || !branch.agent_url) {
			return json({ error: 'Sucursal no configurada' }, { status: 400 });
		}

		const agentClient = new AgentClient({
			slug: branch.id,
			agent_url: branch.agent_url,
			agent_api_key: branch.agent_token
		}, profile, fetch);

		const search = url.searchParams.get('search') || '';
		const page = url.searchParams.get('page') || '1';
		const limit = url.searchParams.get('limit') || '50';

		const params = new URLSearchParams();
		if (search) params.set('search', search);
		params.set('page', page);
		params.set('limit', limit);

		const resData = await agentClient.request<any>(`/cobros/facturas/pendientes?${params.toString()}`);

		let enrichedData = resData.data || [];

		if (enrichedData.length > 0) {
			const { data: profiles } = await supabaseAdmin
				.from('profiles')
				.select('profit_user_id, full_name');
				
			if (profiles) {
				enrichedData = enrichedData.map((inv: any) => {
					const prof = profiles.find((p: any) => p.profit_user_id && inv.co_us_in && p.profit_user_id.trim().toUpperCase() === inv.co_us_in.trim().toUpperCase());
					return {
						...inv,
						cashier_name: prof ? prof.full_name : (inv.co_us_in || 'N/A')
					};
				});
			}
		}

		return json({
			success: resData.success !== false,
			data: enrichedData
		});
	} catch (e: any) {
		console.error('[API PENDING DOCUMENTS GET] Error:', e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
