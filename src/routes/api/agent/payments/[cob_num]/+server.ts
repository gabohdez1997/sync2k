// src/routes/api/agent/payments/[cob_num]/+server.ts
import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals, fetch }) => {
	try {
		const profile = locals.profile;
		if (!profile) return json({ error: 'Sesión no válida' }, { status: 401 });

		const { cob_num } = params;
		if (!cob_num) {
			return json({ error: 'Número de cobro obligatorio' }, { status: 400 });
		}

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

		const endpoint = `/cobros/${encodeURIComponent(cob_num)}`;
		const resData = await agentClient.request<any>(endpoint);

		return json({
			success: resData.success !== false,
			data: resData.data || null
		});
	} catch (e: any) {
		console.error(`[API PAYMENT DETAIL] Error para cobro ${params.cob_num}:`, e.message);
		return json({ error: e.message }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, url, locals, request, fetch }) => {
	try {
		const profile = locals.profile;
		if (!profile) return json({ error: 'Sesión no válida' }, { status: 401 });

		const { cob_num } = params;
		if (!cob_num) {
			return json({ error: 'Número de cobro obligatorio' }, { status: 400 });
		}

		const branchId = url.searchParams.get('branch_id');
		const allowedBranches = profile.allowed_branches || [];
		const branch = allowedBranches.find(b => b.id === branchId) || allowedBranches[0];

		if (!branch || !branch.agent_url) {
			return json({ error: 'Sucursal no configurada' }, { status: 400 });
		}

		const payload = await request.json();

		const agentClient = new AgentClient({
			slug: branch.id,
			agent_url: branch.agent_url,
			agent_api_key: branch.agent_token
		}, profile, fetch);

		const endpoint = `/cobros/${encodeURIComponent(cob_num)}?sede=${encodeURIComponent(branch.id)}`;
		const resData = await agentClient.request<any>(endpoint, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		return json(resData);
	} catch (e: any) {
		console.error(`[API PUT PAYMENT] Error actualizando cobro ${params.cob_num}:`, e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
