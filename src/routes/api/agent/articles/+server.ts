// src/routes/api/agent/articles/+server.ts
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

		const params = new URLSearchParams(url.search);
		const rawSearch = (params.get('search') || '').trim();
		const rawLinea = (params.get('linea') || '').trim();

		// Detección de servicios: Línea 09 o búsquedas que empiezan por 09
		const isServiceSearch = rawLinea === '09' || rawSearch.startsWith('09');

		// Estandarizar parámetros para el agente
		if (params.has('search')) {
			const searchTerm = params.get('search');
			const isCode = /^\d/.test(searchTerm?.trim() || '');
			params.set(isCode ? 'co_art' : 'descripcion', searchTerm || '');
		}

		if (isServiceSearch) {
			params.set('in_stock', 'all'); // Sincronizado con el Agente
		}

		const endpoint = params.has('search') || params.has('linea') || params.has('categoria') || params.has('co_art')
			? `/articulos/search?${params.toString()}`
			: `/articulos?${params.toString()}`;

		const resData = await agentClient.request<any>(endpoint);
		const pagination = resData.data?.pagination || resData.pagination || {};
		
		return json({
			success: true,
			data: resData.data?.items || resData.items || resData.data || (Array.isArray(resData) ? resData : []),
			pagination: {
				total: pagination.total || 0,
				page: pagination.currentPage || pagination.page || 1,
				limit: pagination.limit || 12,
				totalPages: pagination.pages || pagination.totalPages || 0
			}
		});
	} catch (e: any) {
		console.error('[API ARTICLES] Error:', e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
