import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, fetch }) => {
	try {
		const profile = locals.profile;
		if (!profile) return json({ error: 'Sesión no válida' }, { status: 401 });

		const branchId = url.searchParams.get('branch_id');
		const co_tab = url.searchParams.get('co_tab');
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

		const q = co_tab ? `?co_tab=${encodeURIComponent(co_tab)}` : '';
		const resData = await agentClient.request<any>(`/pagos/conceptos-islr${q}`);

		return json({
			success: resData.success !== false,
			data: resData.data || [],
			unidad_tributaria: resData.unidad_tributaria || 43,
			tabuladores: resData.tabuladores || []
		});
	} catch (e: any) {
		console.error('[API PAYABLES CONCEPTOS ISLR GET] Error:', e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
