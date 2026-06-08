import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('reports_payables', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw new Error('Perfil no cargado.');

	try {
		const allowedBranches = profile.allowed_branches || [];
		if (allowedBranches.length === 0) {
			return { 
				cxp: { data: [], metrics: null, page: 1, limit: 10, total_items: 0, total_pages: 0 }, 
				branches: [], 
				error: 'No tienes sucursales asignadas.' 
			};
		}

		const urlBranchId = url.searchParams.get('branch_id');
		const selectedBranch = urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : allowedBranches[0];

		if (!selectedBranch || !selectedBranch.agent_url) {
			return { 
				cxp: { data: [], metrics: null, page: 1, limit: 10, total_items: 0, total_pages: 0 }, 
				branches: allowedBranches, 
				error: 'La sucursal seleccionada no tiene agente configurado.' 
			};
		}

		const agentClient = new AgentClient({
			slug: selectedBranch.id, 
			agent_url: selectedBranch.agent_url, 
			agent_api_key: selectedBranch.agent_token
		}, profile, fetch);

		const hasOthers = hasPermission(profile, 'reports_payables', 'others');
		const canEdit = hasPermission(profile, 'reports_payables', 'update');

		const page = url.searchParams.get('page') || '1';
		const limit = url.searchParams.get('limit') || '1000';
		const search = url.searchParams.get('search') || '';
		const tipo_doc = url.searchParams.get('tipo_doc') || 'all';
		const status = url.searchParams.get('status') || 'all';

		const query = new URLSearchParams();
		query.set('page', page);
		query.set('limit', limit);
		if (search) query.set('search', search);
		if (tipo_doc) query.set('tipo_doc', tipo_doc);
		if (status) query.set('status', status);

		console.log(`[CXP REPORT SERVER] Solicitando CxP a agente sucursal ${selectedBranch.name || selectedBranch.id}...`);
		const response = await agentClient.request<any>(`/reportes/cxp?${query.toString()}`);

		if (!response || !response.success) {
			return {
				cxp: { data: [], metrics: null, page: 1, limit: 10, total_items: 0, total_pages: 0 },
				branches: allowedBranches,
				selectedBranchId: selectedBranch.id,
				error: response?.message || 'Error al obtener reporte del agente local.',
				canEdit
			};
		}

		return {
			cxp: response,
			branches: allowedBranches,
			selectedBranchId: selectedBranch.id,
			hasOthers,
			canEdit
		};

	} catch (err: any) {
		console.error("[CXP REPORT SERVER LOAD ERROR]:", err);
		return { 
			cxp: { data: [], metrics: null, page: 1, limit: 10, total_items: 0, total_pages: 0 }, 
			branches: [], 
			error: 'Error de servidor: ' + err.message 
		};
	}
});
