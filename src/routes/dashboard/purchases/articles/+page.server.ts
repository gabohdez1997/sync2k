import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { AgentClient } from '$lib/server/agent';

export const load: PageServerLoad = async ({ locals, url, fetch }) => {
	try {
		const profile = (locals as any).profile;
		if (!profile) return error(401, 'No autorizado o perfil no cargado.');

		const allowedBranches = profile.allowed_branches || [];
		if (allowedBranches.length === 0) {
			return { articles: [], branches: [], error: 'No tienes sucursales asignadas.' };
		}

		const searchTerm = (url.searchParams.get('search') || '').trim();
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = 12;
		const linea = (url.searchParams.get('linea') || '').trim();
		const categoria = (url.searchParams.get('categoria') || '').trim();
		const stockFilter = url.searchParams.get('stock_filter') || 'all';
		const soloPendientes = url.searchParams.get('solo_pendientes') === 'true';
		const conCosto = url.searchParams.get('con_costo') || 'all';

		const urlBranchId = url.searchParams.get('branch_id');
		const isConsolidated = !urlBranchId || urlBranchId === 'Todas';
		
		const targetBranches = isConsolidated 
			? allowedBranches 
			: allowedBranches.filter(b => b.id === urlBranchId);

		const fetchFromAgent = async (branch: any) => {
			try {
				const client = new AgentClient({
					slug: branch.id,
					agent_url: branch.agent_url,
					agent_api_key: branch.agent_token
				}, profile, fetch);

				const params = new URLSearchParams();
				params.set('page', page.toString());
				params.set('limit', limit.toString());
				if (searchTerm) params.set('search', searchTerm);
				if (linea) params.set('linea', linea);
				if (categoria) params.set('categoria', categoria);
				params.set('in_stock', stockFilter);
				if (soloPendientes) params.set('solo_pendientes', 'true');
				if (conCosto) params.set('con_costo', conCosto);

				const res = await client.request<any>(`/compras/articulos?${params.toString()}`);
				return res && res.success ? res : { data: [], pagination: { total: 0 } };
			} catch (e: any) {
				return { data: [], pagination: { total: 0 } };
			}
		};

		// 1. Cargar catálogos
		let catalogs = { lineas: [], categorias: [] };
		const firstBranch = allowedBranches.find(b => b.agent_url);
		if (firstBranch) {
			try {
				const client = new AgentClient({
					slug: firstBranch.id,
					agent_url: firstBranch.agent_url,
					agent_api_key: firstBranch.agent_token
				}, profile, fetch);
				const [lineasRes, catsRes] = await Promise.all([
					client.request<any>('/catalogos/lineas').catch(() => ({ data: [] })),
					client.request<any>('/catalogos/categorias').catch(() => ({ data: [] }))
				]);
				catalogs.lineas = (lineasRes as any).data || (lineasRes as any).items || (Array.isArray(lineasRes) ? lineasRes : []);
				catalogs.categorias = (catsRes as any).data || (catsRes as any).items || (Array.isArray(catsRes) ? catsRes : []);
			} catch (e) {}
		}

		// 2. Ejecutar peticiones
		const responses = await Promise.all(targetBranches.map(fetchFromAgent));

		// 3. Consolidar con inicialización de todas las sedes en CERO
		const consolidatedMap = new Map();
		let maxTotal = 0;

		responses.forEach((resp, index) => {
			const branchName = targetBranches[index].name;
			if ((resp.pagination?.total || 0) > maxTotal) maxTotal = resp.pagination.total;
			
			(resp.data || []).forEach((item: any) => {
				const stockDeEstaSede = item.total_stock || 0;
				
				if (!consolidatedMap.has(item.co_art)) {
					// INICIALIZACIÓN: Creamos el array con TODAS las sedes en cero
					const existenciaInicial = targetBranches.map(b => ({
						sede: b.name,
						stock: 0
					}));
					
					// Actualizamos el stock de la sede que sí respondió
					const entry = existenciaInicial.find(e => e.sede === branchName);
					if (entry) entry.stock = stockDeEstaSede;

					consolidatedMap.set(item.co_art, { 
						...item, 
						existencia_por_sede: existenciaInicial
					});
				} else {
					const existing = consolidatedMap.get(item.co_art);
					// Buscamos la entrada de esta sede en el array ya inicializado
					const entry = existing.existencia_por_sede.find((e: any) => e.sede === branchName);
					if (entry) {
						entry.stock = stockDeEstaSede;
					} else {
						// Por si acaso la sede no estaba en la lista inicial (ej. cambio de filtros)
						existing.existencia_por_sede.push({ sede: branchName, stock: stockDeEstaSede });
					}
					
					existing.total_stock = (existing.total_stock || 0) + stockDeEstaSede;
					existing.cantidad_por_llegar = (existing.cantidad_por_llegar || 0) + (item.cantidad_por_llegar || 0);
					if (item.fecha_ultima_compra && (!existing.fecha_ultima_compra || new Date(item.fecha_ultima_compra) > new Date(existing.fecha_ultima_compra))) {
						existing.fecha_ultima_compra = item.fecha_ultima_compra;
						existing.ultimo_costo = item.ultimo_costo;
						existing.ultimo_costo_om = item.ultimo_costo_om;
					}
				}
			});
		});

		let articles = Array.from(consolidatedMap.values());
		articles.sort((a, b) => a.descripcion.localeCompare(b.descripcion));

		return {
			articles,
			pagination: { total: maxTotal, page, limit, totalPages: Math.ceil(maxTotal / limit) },
			branches: allowedBranches,
			catalogs,
			searchTerm,
			selectedBranch: urlBranchId || '',
			crud: { 
				create: profile.permissions?.pur_articles?.create ?? true, 
				update: profile.permissions?.pur_articles?.update ?? true, 
				delete: false 
			}
		};
	} catch (err: any) {
		console.error('Error loading purchases articles:', err);
		return { articles: [], branches: [], error: err.message };
	}
};
