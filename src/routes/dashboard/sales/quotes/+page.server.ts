// src/routes/dashboard/sales/quotes/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_quotes', async ({ url, locals }) => {
	try {
		const profile = (locals as any).profile;
		if (!profile) throw new Error('Perfil no cargado.');

		// 1. Obtener sucursales autorizadas del perfil
		const allowedBranches = profile.allowed_branches || [];
		
		if (allowedBranches.length === 0) {
			return {
				articles: [],
				branches: [],
				error: 'No tienes sucursales asignadas.'
			};
		}

		// 2. Seleccionar sucursal activa
		const urlBranchId = url.searchParams.get('branch_id');
		const selectedBranch = urlBranchId 
			? allowedBranches.find(b => b.id === urlBranchId)
			: allowedBranches[0];

		if (!selectedBranch || !selectedBranch.agent_url) {
			return {
				articles: [],
				branches: allowedBranches,
				error: 'Sucursal no configurada correctamente.'
			};
		}

		// 3. Inicializar AgentClient
		const agentClient = new AgentClient({
			slug: selectedBranch.id,
			agent_url: selectedBranch.agent_url,
			agent_api_key: selectedBranch.agent_token
		}, profile);

		const pageIndex = parseInt(url.searchParams.get('page') || '1', 10);
		const limit = 12;

		// 4. Cargar catálogos (Almacenes, Líneas, Categorías)
		let warehouseList: any[] = [];
		let lineas: any[] = [];
		let categorias: any[] = [];

		try {
			const [almaRes, lineasRes, catsRes] = await Promise.all([
				agentClient.request<any>('/catalogos/almacenes'),
				agentClient.request<any>('/catalogos/lineas'),
				agentClient.request<any>('/catalogos/categorias').catch(() => ({ data: [] }))
			]);

			warehouseList = (almaRes as any).data || (almaRes as any).items || (Array.isArray(almaRes) ? almaRes : []);
			lineas = (lineasRes as any).data || (lineasRes as any).items || (Array.isArray(lineasRes) ? lineasRes : []);
			categorias = (catsRes as any).data || (catsRes as any).items || (Array.isArray(catsRes) ? catsRes : []);
		} catch (e) {
			console.error('[QUOTES] Catalog fetch error:', e);
		}

		// 5. Filtrar almacenes por permisos
		const profileWarehouses: string[] = profile.allowed_warehouses || [];
		const isAdmin = profileWarehouses.length === 0;

		const branchWarehouseList = warehouseList.filter((a: any) => {
			const co_sucu = a.co_sucu || a.co_sucur || a.sede_id || a.co_sede;
			return co_sucu === selectedBranch.profit_branch_code || !co_sucu;
		});

		const allowedWarehouses = isAdmin
			? branchWarehouseList
			: branchWarehouseList.filter((a: any) => {
				const almaId = a.co_alma || a.id || a.warehouse_id;
				return profileWarehouses.includes(almaId);
			  });

		const finalWarehouseIds = allowedWarehouses.map((a: any) => a.co_alma || a.id || a.warehouse_id).filter(Boolean);

		const urlWarehouseId = url.searchParams.get('co_alma');
		const warehouseId = (urlWarehouseId && finalWarehouseIds.includes(urlWarehouseId))
			? urlWarehouseId
			: '';

		// 6. Consultar Artículos (Cotización)
		const searchTerm = url.searchParams.get('search') || '';
		const lineaId = url.searchParams.get('linea') || '';
		const categoriaId = url.searchParams.get('categoria') || '';

		const params = new URLSearchParams();
		params.set('page', String(pageIndex));
		params.set('limit', String(limit));

		if (searchTerm) params.set('descripcion', searchTerm);
		if (lineaId) params.set('linea', lineaId);
		if (categoriaId) params.set('categoria', categoriaId);
		
		params.set('sede_id', selectedBranch.id);
		if (warehouseId) params.set('co_alma', warehouseId);

		const endpoint = (searchTerm || lineaId || categoriaId) 
			? `/articulos/search?${params.toString()}`
			: `/articulos?${params.toString()}`;

		const resData = await agentClient.request<any>(endpoint);

		return {
			articles: resData.data?.items || resData.items || resData.data || [],
			branches: allowedBranches,
			selectedBranchId: selectedBranch.id,
			context: {
				branchId: selectedBranch.id,
				warehouseId,
				finalWarehouseIds,
				lineas,
				categorias,
				warehouses: allowedWarehouses
			},
			pagination: resData.pagination || { total: 0, pages: 1, currentPage: 1 }
		};

	} catch (e: any) {
		console.error('[QUOTES] Fatal error:', e);
		return { articles: [], error: `Error interno: ${e.message}`, branches: [] };
	}
});
