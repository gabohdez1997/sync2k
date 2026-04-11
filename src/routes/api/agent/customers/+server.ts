// src/routes/api/agent/customers/+server.ts
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
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const search = url.searchParams.get('search') || '';
		const params = new URLSearchParams();
		params.set('page', String(page));
		params.set('limit', String(limit));
		
		if (search) {
			const cleanSearch = search.trim();
			// Enviamos el término a múltiples campos para maximizar la probabilidad de coincidencia
			// ya que el RIF y el Código suelen ser iguales, y el nombre se busca por descripción.
			params.set('rif', cleanSearch);
			params.set('co_cli', cleanSearch);
			params.set('descripcion', cleanSearch);
			params.set('cli_des', cleanSearch); // Fallback común en Profit
		}

		const endpoint = search 
			? `/clientes/search?${params.toString()}`
			: `/clientes?${params.toString()}`;
			
		const resData = await agentClient.request<any>(endpoint);

		const pagination = resData.data?.pagination || resData.pagination || {};
		return json({
			success: true,
			data: resData.data?.items || resData.items || resData.data || (Array.isArray(resData) ? resData : []),
			pagination: {
				total: pagination.total || 0,
				page: pagination.currentPage || pagination.page || page,
				limit: pagination.limit || limit,
				totalPages: pagination.pages || pagination.totalPages || 0
			}
		});
	} catch (e: any) {
		console.error('[API CUSTOMERS] Error:', e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
