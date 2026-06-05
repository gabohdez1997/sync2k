import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('reports_detailed_account', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw new Error('Perfil no cargado.');

	try {
		const allowedBranches = profile.allowed_branches || [];
		if (allowedBranches.length === 0) {
			return { 
				report: { data: [], metrics: null, page: 1, limit: 10, total_items: 0, total_pages: 0 }, 
				branches: [], 
				error: 'No tienes sucursales asignadas.' 
			};
		}

		const urlBranchId = url.searchParams.get('branch_id');
		const selectedBranch = urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : allowedBranches[0];

		if (!selectedBranch || !selectedBranch.agent_url) {
			return { 
				report: { data: [], metrics: null, page: 1, limit: 10, total_items: 0, total_pages: 0 }, 
				branches: allowedBranches, 
				error: 'La sucursal seleccionada no tiene agente configurado.' 
			};
		}

		const agentClient = new AgentClient({
			slug: selectedBranch.id, 
			agent_url: selectedBranch.agent_url, 
			agent_api_key: selectedBranch.agent_token
		}, profile, fetch);

		// Filtrado de seguridad por Vendedor
		const hasOthers = hasPermission(profile, 'reports_detailed_account', 'others');
		let coVenFilter = '';
		if (!hasOthers) {
			coVenFilter = profile.profit_user || '';
		}

		const page = url.searchParams.get('page') || '1';
		const limit = url.searchParams.get('limit') || '1000';
		const search = url.searchParams.get('search') || '';
		const status = url.searchParams.get('status') || 'all';

		const query = new URLSearchParams();
		query.set('page', page);
		query.set('limit', limit);
		if (search) query.set('search', search);
		if (status) query.set('status', status);
		if (coVenFilter) query.set('co_ven', coVenFilter);

		console.log(`[DETAILED ACCOUNT SERVER] Solicitando Cuenta Detallada a agente sucursal ${selectedBranch.name || selectedBranch.id}...`);
		const response = await agentClient.request<any>(`/reportes/cuenta-detallada?${query.toString()}`);

		if (!response || !response.success) {
			return {
				report: { data: [], metrics: null, page: 1, limit: 10, total_items: 0, total_pages: 0 },
				branches: allowedBranches,
				selectedBranchId: selectedBranch.id,
				error: response?.message || 'Error al obtener reporte del agente local.'
			};
		}

		return {
			report: response,
			branches: allowedBranches,
			selectedBranchId: selectedBranch.id,
			hasOthers
		};

	} catch (err: any) {
		console.error("[DETAILED ACCOUNT SERVER LOAD ERROR]:", err);
		return { 
			report: { data: [], metrics: null, page: 1, limit: 10, total_items: 0, total_pages: 0 }, 
			branches: [], 
			error: 'Error de servidor: ' + err.message 
		};
	}
});
