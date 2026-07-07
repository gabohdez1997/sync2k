// src/routes/dashboard/articles/labels/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('inv_articles', async ({ url, locals, fetch }) => {
	try {
        const profile = (locals as any).profile;
		if (!profile) throw new Error('Perfil no cargado.');

		// 1. Obtener sucursales autorizadas del perfil (Supabase)
		const allowedBranches = profile.allowed_branches || [];
		
		if (allowedBranches.length === 0) {
			return { articles: [], error: 'No tienes sucursales asignadas.', companyName: 'GalpeApp' };
		}

		// 2. Seleccionar sucursal activa
		const urlBranchId = url.searchParams.get('branch_id');
		const selectedBranch = urlBranchId 
			? allowedBranches.find(b => b.id === urlBranchId)
			: allowedBranches[0];

		if (!selectedBranch || !selectedBranch.agent_url) {
			return { articles: [], error: 'Sucursal no configurada correctamente.', companyName: 'GalpeApp' };
		}

		// 3. Inicializar AgentClient
		const agentClient = new AgentClient({
			slug: selectedBranch.id,
			agent_url: selectedBranch.agent_url,
			agent_api_key: selectedBranch.agent_token
		}, profile, fetch);

		// 4. Parámetros de búsqueda
		const warehouseId = url.searchParams.get('co_alma');
		const coArtsParam = url.searchParams.get('co_arts'); // Códigos seleccionados

		let articles: any[] = [];

		if (coArtsParam) {
			// MODO SELECCIÓN: buscar códigos específicos
			const codes = coArtsParam.split(',').map(c => c.trim()).filter(Boolean);
			
			const baseParams = new URLSearchParams();
			baseParams.set('sede_id', selectedBranch.id);
			baseParams.set('sede', selectedBranch.profit_branch_code || selectedBranch.id);
			if (warehouseId) baseParams.set('co_alma', warehouseId);
			baseParams.set('in_stock', 'all');

			const results = await Promise.allSettled(
				codes.map(code => {
					const p = new URLSearchParams(baseParams);
					p.set('co_art', code);
					p.set('limit', '1');
					return agentClient.request<any>(`/articulos/search?${p.toString()}`);
				})
			);

			for (const result of results) {
				if (result.status === 'fulfilled') {
					const res = result.value as any;
					const items = res?.data?.items || res?.items || res?.data || (Array.isArray(res) ? res : []);
					if (Array.isArray(items) && items.length > 0) articles.push(items[0]);
				}
			}
		} else {
			// MODO FILTRO: buscar por términos
			const searchTerm = url.searchParams.get('search') || '';
			const lineaId = url.searchParams.get('linea') || '';
			const categoriaId = url.searchParams.get('categoria') || '';
			const ubicacionId = url.searchParams.get('co_ubicacion');

			const params = new URLSearchParams();
			params.set('limit', '500');
			params.set('in_stock', 'all');

			if (searchTerm) {
				params.set('search', searchTerm);
			}
			if (lineaId) params.set('linea', lineaId);
			if (categoriaId) params.set('categoria', categoriaId);
            
			params.set('sede_id', selectedBranch.id);
            params.set('sede', selectedBranch.profit_branch_code || selectedBranch.id);
			if (warehouseId) params.set('co_alma', warehouseId);
			if (ubicacionId) params.set('co_ubicacion', ubicacionId);

			const endpoint = (searchTerm || lineaId || categoriaId || ubicacionId)
				? `/articulos/search?${params.toString()}`
				: `/articulos?${params.toString()}`;

			const resData = await agentClient.request<any>(endpoint);
			const rawItems = resData?.data?.items || resData?.items || resData?.data || (Array.isArray(resData) ? resData : []);
			articles = Array.isArray(rawItems) ? rawItems : [];
		}

		return {
			articles,
			companyName: 'GalpeApp',
			companyLogo: '' // Se maneja en el layout global o por settings si se requiere
		};

	} catch (e: any) {
		console.error('[LABELS] Fatal error:', e);
		return { articles: [], error: `Error interno: ${e.message}`, companyName: 'GalpeApp' };
	}
});
