import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_articles', async ({ url, locals, fetch }) => {
	try {
		const userProfile = (locals as any).profile;

		// ─── 1. LOAD ALL BRANCHES FROM SUPABASE ────────────────────────────────
		let allBranches: any[] = [];
		const { data: dbBranches, error } = await supabaseAdmin
			.from('branches')
			.select('id, name, agent_url, agent_token, active, sort_order')
			.eq('active', true)
			.order('sort_order')
			.order('name');

		if (error) {
			console.error('[PUR_ARTICLES] Supabase branches error:', error.message);
		} else if (dbBranches) {
			allBranches = dbBranches;
		}

		// Filter branches by user permissions
		const profileAllowed = userProfile?.allowed_branches || [];
		const profileBranchIds: string[] = Array.isArray(profileAllowed) 
			? profileAllowed.map((b: any) => (typeof b === 'object' ? b.id : b))
			: [];
			
		const isAdmin = profileBranchIds.length === 0;

		const allowedBranches = isAdmin
			? allBranches
			: allBranches.filter(b => profileBranchIds.includes(b.id));

		// If no branches allowed/configured, fast return
		if (allowedBranches.length === 0) {
			return { articles: [], branches: allowedBranches, requireBranchSelection: true };
		}

		// Selected branch from URL or default
		const urlBranchId = url.searchParams.get('branch_id');
		const branchId = (urlBranchId && allowedBranches.some(b => b.id === urlBranchId))
			? urlBranchId
			: (allowedBranches[0]?.id || '');

		let selectedBranchObj = allowedBranches.find(b => b.id === branchId);

		if (!selectedBranchObj?.agent_url) {
			return { articles: [], branches: allowedBranches, requireBranchSelection: true };
		}

		// ─── 2. INIT AGENT CLIENT ────────────────────────────────────────────────
		const agentClient = new AgentClient({
			slug: selectedBranchObj.id,
			agent_url: selectedBranchObj.agent_url,
			agent_api_key: selectedBranchObj.agent_token
		}, (locals as any).profile || undefined, fetch);

		const pageIndex = parseInt(url.searchParams.get('page') || '1', 10);
		const limit = 20;
		const searchTerm = (url.searchParams.get('search') || '').trim();

		// ─── 3. BUILD ENDPOINT & FETCH ARTICLES ───────────────────────────────────
		const params = new URLSearchParams();
		params.set('page', pageIndex.toString());
		params.set('limit', limit.toString());
		params.set('sort', 'default');

		if (searchTerm) {
			const isCode = /^\d/.test(searchTerm);
			params.set(isCode ? 'co_art' : 'descripcion', searchTerm);
		}

		const endpoint = `/articulos/search?${params.toString()}`;
		let articles: any[] = [];
		let resData: any = { success: true, pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } };

		try {
			const response = await agentClient.request<any>(endpoint);
			articles = (response.data?.items || response.items || response.data || (Array.isArray(response) ? response : []));
			resData = response;
		} catch (e) {
			console.error('[PUR_ARTICLES] Fetch articles error:', e);
		}

		// Extraer permisos CRUD del usuario para esta sección
		const crud = userProfile?.permissions?.['pur_articles'] || { read: true, create: false, update: false, delete: false };

		return {
			articles,
			branches: allowedBranches,
			crud,
			pagination: {
				page: Number((resData as any).pagination?.currentPage || (resData as any).pagination?.page || pageIndex),
				totalPages: Number((resData as any).pagination?.pages || (resData as any).pagination?.totalPages || 1),
				totalItems: Number((resData as any).pagination?.total || articles.length)
			}
		};

	} catch (e: any) {
		console.error('[PUR_ARTICLES] Fatal error:', e);
		return { articles: [], error: `Error interno: ${e.message}`, branches: [] };
	}
});
