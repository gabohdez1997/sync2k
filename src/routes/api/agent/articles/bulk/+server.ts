// src/routes/api/agent/articles/bulk/+server.ts
import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, locals, fetch }) => {
	try {
		const profile = locals.profile;
		if (!profile) return json({ success: false, error: 'Sesión no válida' }, { status: 401 });

		const body = await request.json().catch(() => ({}));
		const branchId = body.branch_id || url.searchParams.get('branch_id');
		const allowedBranches = profile.allowed_branches || [];
		const branch = allowedBranches.find(b => b.id === branchId) || allowedBranches[0];

		if (!branch || !branch.agent_url) {
			return json({ success: false, error: 'Sucursal no configurada o sin agente' }, { status: 400 });
		}

		const codes = Array.isArray(body.codes) ? body.codes : [];
		if (codes.length === 0) {
			return json({ success: false, error: 'Debe proporcionar una lista de códigos' }, { status: 400 });
		}

		const agentClient = new AgentClient({
			slug: branch.id,
			agent_url: branch.agent_url,
			agent_api_key: branch.agent_token
		}, profile, fetch);

		const resData = await agentClient.request<any>('/articulos/bulk', {
			method: 'POST',
			body: JSON.stringify({
				codes,
				sede_id: branch.id,
				sede: branch.id
			})
		});

		if (!resData.success && !resData.data) {
			return json({
				success: false,
				message: resData.message || 'Error al consultar artículos en el agente',
				data: []
			}, { status: 500 });
		}

		return json({
			success: true,
			count: resData.count || (Array.isArray(resData.data) ? resData.data.length : 0),
			data: resData.data || []
		});
	} catch (err: any) {
		console.error('[API/AGENT/ARTICLES/BULK ERROR]:', err);
		return json({
			success: false,
			message: err?.message || 'Error interno del servidor',
			data: []
		}, { status: 500 });
	}
};
