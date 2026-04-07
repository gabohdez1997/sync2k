import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { adminDb, MasterCollections } from '$lib/server/firebase-admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sec_articles', async ({ url, locals }) => {
	try {
		const userProfile = (locals as any).profile;
		const urlTenant = url.searchParams.get('tenant_id');
		
		// Resolve which company to use
		const profileSlug = userProfile?.company?.slug;
		const targetId = urlTenant || profileSlug;

		if (!targetId) {
			return { articles: [], error: 'Empresa no especificada.' };
		}

		// 1. FETCH COMPANY INFO FROM FIRESTORE
		let companyInfo: any = null;
		const snap = await adminDb!.collection(MasterCollections.CONNECTIONS).doc(targetId).get();
		if (snap.exists) {
			companyInfo = snap.data();
		} else {
			const query = await adminDb!.collection(MasterCollections.CONNECTIONS).where('slug', '==', targetId).get();
			if (!query.empty) companyInfo = query.docs[0].data();
		}

		if (!companyInfo?.agent_url) {
			return { articles: [], error: 'No se encontró la configuración del Agente.' };
		}

		const companyLogo: string = companyInfo?.logo || '';

		// 2. INIT AGENT CLIENT
		const agentClient = new AgentClient({
			slug: companyInfo.slug,
			agent_url: companyInfo.agent_url,
			agent_api_key: companyInfo.agent_api_key
		}, locals.profile);

		// 3. FETCH ARTICLES
		const branchId = url.searchParams.get('branch_id');
		const warehouseId = url.searchParams.get('co_alma');
		const coArtsParam = url.searchParams.get('co_arts'); // comma-separated selected codes

		let articles: any[] = [];

		if (coArtsParam) {
			// ── SELECTION MODE: fetch specific articles by code ──────────────────
			const codes = coArtsParam.split(',').map(c => c.trim()).filter(Boolean);
			console.log(`[LABELS] Selection mode: fetching ${codes.length} specific articles`);

			const baseParams = new URLSearchParams();
			if (branchId) { baseParams.set('sede_id', branchId); baseParams.set('sede', branchId); }
			if (warehouseId) baseParams.set('co_alma', warehouseId);

			// Fetch all selected codes in parallel (batch of individual lookups)
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
			// ── FILTER MODE: fetch all matching the filters (up to 500) ──────────
			const searchTerm = url.searchParams.get('search') || '';
			const lineaId = url.searchParams.get('linea') || '';
			const categoriaId = url.searchParams.get('categoria') || '';
			const ubicacionId = url.searchParams.get('co_ubicacion');

			const params = new URLSearchParams();
			params.set('limit', '500');

			if (searchTerm) {
				const isCode = /^\d/.test(searchTerm.trim());
				params.set(isCode ? 'co_art' : 'descripcion', searchTerm);
			}
			if (lineaId) params.set('linea', lineaId);
			if (categoriaId) params.set('categoria', categoriaId);
			if (branchId) { params.set('sede_id', branchId); params.set('sede', branchId); }
			if (warehouseId) params.set('co_alma', warehouseId);
			if (ubicacionId) params.set('co_ubicacion', ubicacionId);

			const endpoint = (searchTerm || lineaId || categoriaId || ubicacionId)
				? `/articulos/search?${params.toString()}`
				: `/articulos?${params.toString()}`;

			console.log(`[LABELS] Filter mode, fetching from: ${endpoint}`);
			const resData = await agentClient.request<any>(endpoint);

			const rawItems = (resData as any).data?.items
				|| (resData as any).items
				|| (resData as any).data
				|| (Array.isArray(resData) ? resData : []);
			articles = Array.isArray(rawItems) ? rawItems : [];
		}

		console.log(`[LABELS] Total articles to print: ${articles.length}`);

		return {
			articles,
			companyName: companyInfo.name || targetId,
			companyLogo
		};

	} catch (e: any) {
		console.error('[LABELS] Fatal error:', e);
		return { articles: [], error: `Error interno: ${e.message}` };
	}
});

