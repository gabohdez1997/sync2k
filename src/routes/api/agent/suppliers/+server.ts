// src/routes/api/agent/suppliers/+server.ts
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
		const limit = parseInt(url.searchParams.get('limit') || '5000');
		const search = url.searchParams.get('search') || '';

		let resData: any;
		if (search) {
			const cleanSearch = search.trim();
			const isRIF = /^[VEJGvejg]\d+(-?\d+)?$/i.test(cleanSearch.replace(/[-\s]/g, ''));
			
			let filters: any = {};
			if (isRIF) {
				filters.rif = cleanSearch;
				filters.co_prov = cleanSearch;
			} else {
				filters.prov_des = cleanSearch;
				filters.descripcion = cleanSearch;
				filters.q = cleanSearch;
			}
			resData = await agentClient.searchSuppliers(filters, page, limit);
		} else {
			resData = await agentClient.getSuppliers(page, limit);
		}

		const items = resData?.data?.items || resData?.items || resData?.data || (Array.isArray(resData) ? resData : []);
		const pagination = resData?.data?.pagination || resData?.pagination || {};

		return json({
			success: true,
			data: items,
			pagination: {
				total: pagination.total || items.length,
				page: pagination.currentPage || pagination.page || page,
				limit: pagination.limit || limit,
				totalPages: pagination.pages || pagination.totalPages || 1
			}
		});
	} catch (e: any) {
		console.error('[API SUPPLIERS] Error:', e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
