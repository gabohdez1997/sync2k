// src/routes/api/agent/payments/+server.ts
import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
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

		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '12');
		const search = url.searchParams.get('search') || '';
		const co_cli = url.searchParams.get('co_cli') || '';
		const fec_d = url.searchParams.get('fec_d') || '';
		const fec_h = url.searchParams.get('fec_h') || '';

		const params = new URLSearchParams();
		params.set('page', String(page));
		params.set('limit', String(limit));
		if (search) params.set('search', search);
		if (co_cli) params.set('co_cli', co_cli);
		if (fec_d) params.set('fec_d', fec_d);
		if (fec_h) params.set('fec_h', fec_h);

		const resData = await agentClient.request<any>(`/cobros?${params.toString()}`);

		const pagination = resData.data?.pagination || resData.pagination || {};
		return json({
			success: true,
			data: resData.data?.items || resData.items || resData.data || [],
			pagination: {
				total: pagination.total || 0,
				page: pagination.currentPage || pagination.page || page,
				limit: pagination.limit || limit,
				totalPages: pagination.pages || pagination.totalPages || 0
			}
		});
	} catch (e: any) {
		console.error('[API PAYMENTS GET] Error:', e.message);
		return json({ error: e.message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, url, locals, fetch }) => {
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

		const body = await request.json();

		const resData = await agentClient.request<any>(`/cobros`, {
			method: 'POST',
			body: JSON.stringify(body)
		});

		return json(resData);
	} catch (e: any) {
		console.error('[API PAYMENTS POST] Error:', e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
