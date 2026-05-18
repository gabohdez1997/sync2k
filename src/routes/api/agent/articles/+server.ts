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
		const rawCoArt = (params.get('co_art') || '').trim();
		const rawPage = Number.parseInt(params.get('page') || '1', 10);
		const rawLimit = Number.parseInt(params.get('limit') || '12', 10);
		const sort = (params.get('sort') || '').trim();
		const isPriceSort = sort === 'price_asc' || sort === 'price_desc';

		// Detección de servicios: Línea 09 o búsquedas que empiezan por 09
		const isServiceSearch = rawLinea === '09' || rawSearch.startsWith('09');

		if (isServiceSearch) {
			params.set('in_stock', 'all'); 
		}

		// Normalizar query para el endpoint /articulos/search del agente.
		const agentParams = new URLSearchParams();
		agentParams.set('page', Number.isFinite(rawPage) && rawPage > 0 ? String(rawPage) : '1');
		agentParams.set('limit', Number.isFinite(rawLimit) && rawLimit > 0 ? String(rawLimit) : '12');

		// /articulos/search requiere al menos sort o un filtro.
		agentParams.set('sort', sort || 'default');

		const coAlma = (params.get('co_alma') || '').trim();
		const linea = (params.get('linea') || '').trim();
		const categoria = (params.get('categoria') || '').trim();
		const hasScopedFilters = Boolean(rawSearch || rawCoArt || coAlma || linea || categoria);

		if (coAlma) agentParams.set('co_alma', coAlma);
		if (linea) agentParams.set('linea', linea);
		if (categoria) agentParams.set('categoria', categoria);

		// Rehidratación/consulta puntual por código.
		if (rawCoArt) {
			agentParams.set('co_art', rawCoArt);
		}

		// Búsqueda global (código, descripción, modelo, referencia)
		if (rawSearch) {
			agentParams.set('search', rawSearch);
		}

		if (isServiceSearch) {
			agentParams.set('in_stock', 'all');
		}

		// Regla de negocio:
		// - Con búsqueda/filtro: ordenar por precio sobre TODO el resultado encontrado.
		// - Sin búsqueda/filtro: ordenar por precio solo sobre los ítems visibles de la página.
		// Para lograr lo segundo, al agente le pedimos sort=default y ordenamos localmente.
		if (isPriceSort && !hasScopedFilters) {
			agentParams.set('sort', 'default');
		}

		const extractItems = (payload: any): any[] =>
			(payload?.data?.items || payload?.items || payload?.data || (Array.isArray(payload) ? payload : [])) as any[];

		const getPrice = (item: any): number => {
			const precioBase = Number(item?.precio_base);
			if (Number.isFinite(precioBase) && precioBase > 0) return precioBase;
			const precios = Array.isArray(item?.precios) ? item.precios : [];
			const base =
				precios.find((p: any) => String(p?.id_precio || '').trim() === '01') ||
				precios[0];
			return Number(base?.precio ?? 0);
		};

		// branch_id es parámetro interno del web; no se reenvía al agente.
		const endpoint = `/articulos/search?${agentParams.toString()}`;

		const resData = await agentClient.request<any>(endpoint);
		const pagination = resData.data?.pagination || resData.pagination || resData;
		let page = Number(
			pagination.currentPage ??
				pagination.page ??
				resData.page ??
				rawPage ??
				1
		);
		let limit = Number(
			pagination.limit ??
				resData.limit ??
				rawLimit ??
				12
		);
		let total = Number(
			pagination.total ??
				pagination.total_items ??
				resData.total ??
				resData.total_items ??
				0
		);
		let totalPages = Number(
			pagination.pages ??
				pagination.totalPages ??
				pagination.total_pages ??
				resData.total_pages ??
				Math.ceil((total || 0) / Math.max(limit || 1, 1))
		);
		
		let items = extractItems(resData);

		// Ordenamiento local por precio solo para catálogo sin filtros.
		if (isPriceSort && !hasScopedFilters && Array.isArray(items)) {
			items.sort((a, b) => {
				const diff = getPrice(a) - getPrice(b);
				return sort === 'price_desc' ? -diff : diff;
			});
		}

		// Ordenamiento global por precio para resultados buscados/filtrados:
		// obtenemos el set completo filtrado, ordenamos localmente y luego paginamos.
		if (isPriceSort && hasScopedFilters) {
			const allParams = new URLSearchParams(agentParams);
			allParams.set('page', '1');
			allParams.set('limit', '10000');
			allParams.set('sort', 'default');

			const allEndpoint = `/articulos/search?${allParams.toString()}`;
			const allResData = await agentClient.request<any>(allEndpoint);
			const allItems = extractItems(allResData);

			allItems.sort((a, b) => {
				const diff = getPrice(a) - getPrice(b);
				return sort === 'price_desc' ? -diff : diff;
			});

			const safePage = Number.isFinite(page) && page > 0 ? page : 1;
			const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 12;
			const start = (safePage - 1) * safeLimit;
			const end = safePage * safeLimit;

			items = allItems.slice(start, end);
			total = allItems.length;
			totalPages = Math.ceil(total / safeLimit);
			page = safePage;
			limit = safeLimit;
		}

		return json({
			success: true,
			data: items,
			pagination: {
				total: Number.isFinite(total) ? total : 0,
				page: Number.isFinite(page) && page > 0 ? page : 1,
				limit: Number.isFinite(limit) && limit > 0 ? limit : 12,
				totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 0
			}
		});
	} catch (e: any) {
		console.error('[API ARTICLES] Error:', e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
