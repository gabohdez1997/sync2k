// src/routes/dashboard/articles/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_quotes', async ({ url, locals }) => {
	try {
		const userProfile = (locals as any).profile;

		// ─── 1. LOAD ALL TENANTS FROM FIRESTORE ─────────────────────────────────
		let allTenants: any[] = [];
		let companyInfo: any = null;

		try {
			const { adminDb, MasterCollections } = await import('$lib/server/firebase-admin');
			const snap = await adminDb!.collection(MasterCollections.CONNECTIONS).get();
			const rawTenants = snap.docs.map(doc => {
				const d = doc.data();
				return {
					id: doc.id,
					name: d.name || doc.id,
					slug: d.slug || doc.id,
					agent_url: d.agent_url,
					agent_api_key: d.agent_api_key
				};
			});

			// Resolve which company to use: URL param > profile slug
			const urlTenant = url.searchParams.get('tenant_id');
			const profileSlug = userProfile?.company?.slug;

			if (profileSlug) {
				// ── SUBDOMAIN MODE ──────────────────────────────────────────────────
				// User is tied to a specific company via their profile.
				// Restrict allTenants to ONLY their company (security: prevents cross-tenant access).
				companyInfo = rawTenants.find(t => t.id === profileSlug || t.slug === profileSlug);
				allTenants = companyInfo ? [companyInfo] : [];
			} else {
				// ── GLOBAL MODE (Admin) ─────────────────────────────────────────────
				// Admin can see all companies and switch between them.
				allTenants = rawTenants;
				const targetId = urlTenant;
				if (targetId) {
					companyInfo = allTenants.find(t => t.id === targetId || t.slug === targetId);
				}

				// Auto-select if there is exactly one tenant
				if (!companyInfo && allTenants.length === 1) {
					companyInfo = allTenants[0];
				}
			}
		} catch (e) {
			console.error('[ARTICLES] Firestore error:', e);
		}

		// If no company found, ask user to select one
		if (!companyInfo?.agent_url) {
			return {
				articles: [],
				tenants: allTenants,
				context: null,
				requireTenantSelection: true
			};
		}

		// ─── 2. INIT AGENT CLIENT ────────────────────────────────────────────────
		const agentClient = new AgentClient({
			slug: companyInfo.slug,
			agent_url: companyInfo.agent_url,
			agent_api_key: companyInfo.agent_api_key
		}, locals.profile);

		const pageIndex = parseInt(url.searchParams.get('page') || '1', 10);
		const limit = 12;

		// ─── 3. LOAD CATALOGS IN PARALLEL ───────────────────────────────────────
		let warehouseList: any[] = [];
		let configServers: any[] = []; // Branch list from Agent config (authoritative IDs)
		let lineas: any[] = [];
		let categorias: any[] = [];

		try {
			const [configRes, almaRes, lineasRes, catsRes] = await Promise.all([
				agentClient.getDatabaseConfig().catch(() => null),
				agentClient.request<any>('/catalogos/almacenes'),
				agentClient.request<any>('/catalogos/lineas'),
				agentClient.request<any>('/catalogos/categorias').catch(() => ({ data: [] }))
			]);

			// Agent config servers — each has an 'id' matching the UUID in allowed_branches
			const configAny = configRes as any;
			configServers = configAny?.data?.servers || configAny?.servers || (Array.isArray(configAny) ? configAny : []);

			warehouseList = (almaRes as any).data || (almaRes as any).items || (Array.isArray(almaRes) ? almaRes : []);
			lineas = (lineasRes as any).data || (lineasRes as any).items || (Array.isArray(lineasRes) ? lineasRes : []);
			categorias = (catsRes as any).data || (catsRes as any).items || (Array.isArray(catsRes) ? catsRes : []);
		} catch (e) {
			console.error('[ARTICLES] Catalog fetch error:', e);
		}

		// ─── 4. BUILD BRANCH & WAREHOUSE MAPS ───────────────────────────────────
		const profileBranches: string[] = userProfile?.allowed_branches || [];
		const profileWarehouses: string[] = userProfile?.allowed_warehouses || [];
		const isAdmin = profileBranches.length === 0; // Admin = no restrictions

		// Build branch list from Agent config servers (authoritative source of branch IDs)
		// Each server.id = UUID stored in allowed_branches
		let allBranches = configServers.map((s: any) => ({
			id: s.id,
			name: s.name || s.nombre || s.description || s.id
		}));

		// If getDatabaseConfig didn't work, fall back to almacenes sede info
		if (allBranches.length === 0) {
			const seenIds = new Set<string>();
			warehouseList.forEach((a: any) => {
				const sedeId = a.sede_id || a.co_sede || a.co_sucur;
				const sedeName = a.sede_nombre || a.sede_des || a.nombre_sede;
				if (sedeId && sedeName && !seenIds.has(sedeId)) {
					seenIds.add(sedeId);
					allBranches.push({ id: sedeId, name: sedeName });
				}
			});
		}

		// Filter branches by user permissions (no fallback — if restricted, only show allowed)
		const allowedBranches = isAdmin
			? allBranches
			: allBranches.filter(b => profileBranches.includes(b.id));

		// Selected branch from URL (validate it's allowed) or first allowed
		const urlBranchId = url.searchParams.get('branch_id');
		const branchId = (urlBranchId && allowedBranches.some(b => b.id === urlBranchId))
			? urlBranchId
			: (allowedBranches[0]?.id || '');

		// Build warehouse list filtered by selected branch
		const allWarehousesForBranch = branchId
			? warehouseList.filter((a: any) => {
				const sedeId = a.sede_id || a.co_sede || a.co_sucur || a.id;
				return sedeId === branchId;
			  })
			: warehouseList;

		// Filter warehouses by user permissions
		const allowedWarehousesForBranch = isAdmin || profileWarehouses.length === 0
			? allWarehousesForBranch
			: allWarehousesForBranch.filter((a: any) => {
				const almaId = a.co_alma || a.id || a.warehouse_id;
				return profileWarehouses.includes(almaId);
			  });

		const finalWarehouseIds = allowedWarehousesForBranch.map((a: any) => a.co_alma || a.id || a.warehouse_id).filter(Boolean);

		const urlWarehouseId = url.searchParams.get('co_alma');
		const warehouseId = (urlWarehouseId && finalWarehouseIds.includes(urlWarehouseId))
			? urlWarehouseId
			: '';

		// ─── 6. FETCH ARTICLES ───────────────────────────────────────────────────
		const searchTerm = url.searchParams.get('search') || '';
		const lineaId = url.searchParams.get('linea') || '';
		const categoriaId = url.searchParams.get('categoria') || '';

		let endpoint: string;
		const params = new URLSearchParams();
		params.set('page', String(pageIndex));
		params.set('limit', String(limit));

		if (searchTerm || lineaId || categoriaId) {
			// Use search endpoint
			if (searchTerm) {
				const isCode = /^\d/.test(searchTerm.trim());
				params.set(isCode ? 'co_art' : 'descripcion', searchTerm);
			}
			if (lineaId) params.set('linea', lineaId);
			if (categoriaId) params.set('categoria', categoriaId);
			if (branchId) {
				params.set('sede_id', branchId);
				params.set('sede', branchId);
			}
			if (warehouseId) params.set('co_alma', warehouseId);
			endpoint = `/articulos/search?${params.toString()}`;
		} else {
			// Use paginated listing
			if (branchId) {
				params.set('sede_id', branchId);
				params.set('sede', branchId);
			}
			if (warehouseId) params.set('co_alma', warehouseId);
			endpoint = `/articulos?${params.toString()}`;
		}

		console.log(`[ARTICLES] Endpoint: ${endpoint}`);
		const resData = await agentClient.request<any>(endpoint);

		if ((resData as any).success === false) {
			return {
				articles: [],
				tenants: allTenants,
				context: {
					tenantId: companyInfo.slug || companyInfo.id,
					branchId,
					warehouseId,
					finalWarehouseIds,
					lineas,
					categorias,
					branches: allowedBranches,
					warehouses: allowedWarehousesForBranch
				},
				error: `Error del agente: ${(resData as any).message || 'Desconocido'}`
			};
		}

		const rawItems = (resData as any).data?.items
			|| (resData as any).items
			|| (resData as any).data
			|| (Array.isArray(resData) ? resData : []);
		const articles = Array.isArray(rawItems) ? rawItems : [];

		return {
			articles,
			endpoint,
			tenants: allTenants,
			context: {
				tenantId: companyInfo.slug || companyInfo.id,
				branchId,
				warehouseId,
				finalWarehouseIds,
				lineas,
				categorias,
				branches: allowedBranches,
				warehouses: allowedWarehousesForBranch
			},
			pagination: {
				page: (resData as any).pagination?.currentPage || pageIndex,
				totalPages: (resData as any).pagination?.pages || 1,
				totalItems: (resData as any).pagination?.total || articles.length
			}
		};

	} catch (e: any) {
		console.error('[ARTICLES] Fatal error:', e);
		return { articles: [], error: `Error interno: ${e.message}`, tenants: [] };
	}
});

