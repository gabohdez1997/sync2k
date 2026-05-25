import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_price_checker', async ({ locals, url, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw new Error('Perfil no cargado.');

	try {
		const allowedBranches = profile.allowed_branches || [];
		if (allowedBranches.length === 0) {
			return {
				branches: [],
				error: 'No tienes sucursales asignadas en tu perfil.',
				tasa: 0,
				searchResults: [],
				pagination: { total: 0, page: 1, limit: 12, totalPages: 0 },
				articleDetails: null
			};
		}

		// Determinar sucursal seleccionada
		const urlBranchId = url.searchParams.get('branch_id');
		const selectedBranch = urlBranchId 
			? allowedBranches.find((b: any) => b.id === urlBranchId) 
			: allowedBranches[0];

		if (!selectedBranch || !selectedBranch.agent_url) {
			return {
				branches: allowedBranches,
				selectedBranchId: urlBranchId || allowedBranches[0]?.id || '',
				error: 'La sucursal seleccionada no posee un agente local configurado.',
				tasa: 0,
				searchResults: [],
				pagination: { total: 0, page: 1, limit: 12, totalPages: 0 },
				articleDetails: null
			};
		}

		const agentClient = new AgentClient({
			slug: selectedBranch.id,
			agent_url: selectedBranch.agent_url,
			agent_api_key: selectedBranch.agent_token
		}, profile, fetch);

		const search = url.searchParams.get('search') || url.searchParams.get('q') || '';
		const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
		const limit = 12;

		let searchResults: any[] = [];
		let pagination = { total: 0, page: 1, limit: 12, totalPages: 0 };
		let queryError = null;
		let tasa = 0;

		// 1. Cargar la tasa de cambio oficial de la sucursal activa
		const resCatalog = await agentClient.request<any>('/catalogos/tasa').catch(() => null) as any;
		if (resCatalog && (resCatalog as any).success) {
			const dataList = (resCatalog as any).data || [];
			if (Array.isArray(dataList) && dataList.length > 0) {
				tasa = Number(dataList[0].tasa || dataList[0].tasa_cambio || 0);
			} else if ((resCatalog as any).tasa) {
				tasa = Number((resCatalog as any).tasa || 0);
			}
		}

		// 2. Realizar búsqueda general de artículos si se proporciona un término
		if (search) {
			const cleanQuery = search.trim();
			console.log(`[PRICE CHECKER] Buscando artículos coincidentes con "${cleanQuery}" en sede ${selectedBranch.name}...`);
			
			const resSearch = await agentClient.request<any>(
				`/articulos/search?search=${encodeURIComponent(cleanQuery)}&in_stock=all&page=${page}&limit=${limit}`
			).catch((err) => {
				console.error('[PRICE CHECKER AGENT SEARCH ERROR]:', err);
				return null;
			});

			if (resSearch && (resSearch as any).success) {
				const rawItems = (resSearch as any).data?.items || (resSearch as any).items || (resSearch as any).data || [];
				
				// Consolidar el stock total sumando la disponibilidad de todos los almacenes locales de la sede
				searchResults = rawItems.map((item: any) => {
					const totalStock = (item.disponibilidad || []).reduce(
						(sum: number, d: any) => sum + (Number(d.stock) || 0), 
						0
					);
					return {
						...item,
						total_stock: totalStock
					};
				});

				const rawPagination = (resSearch as any).data?.pagination || (resSearch as any).pagination || {};
				const total = Number(rawPagination.total ?? rawPagination.total_items ?? searchResults.length ?? 0);
				const totalPages = Number(rawPagination.totalPages ?? rawPagination.pages ?? Math.ceil(total / limit) ?? 0);

				pagination = {
					total,
					page,
					limit,
					totalPages: totalPages > 0 ? totalPages : 1
				};
			} else {
				queryError = resSearch?.message || 'No se pudo realizar la búsqueda de artículos.';
			}
		}

		return {
			branches: allowedBranches,
			selectedBranchId: selectedBranch.id,
			search,
			tasa,
			searchResults,
			pagination,
			error: queryError
		};

	} catch (err: any) {
		console.error('[PRICE CHECKER LOAD ERROR]:', err);
		return {
			branches: [],
			tasa: 0,
			searchResults: [],
			pagination: { total: 0, page: 1, limit: 12, totalPages: 0 },
			error: 'Error de conexión del servidor: ' + err.message
		};
	}
});
