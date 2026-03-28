// src/routes/dashboard/articles/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { adminDb, MasterCollections } from '$lib/server/firebase-admin';
import { logAction } from '$lib/server/audit';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = protectLoad('sec_articles', async ({ url, locals }) => {
	try {
		const userProfile = (locals as any).profile;

		// ─── 1. LOAD ALL TENANTS FROM FIRESTORE ─────────────────────────────────
		let allTenants: any[] = [];
		let companyInfo: any = null;
		const urlTenant = url.searchParams.get('tenant_id');

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
		});

		const pageIndex = parseInt(url.searchParams.get('page') || '1', 10);
		const limit = 12;

		// ─── 3. LOAD CATALOGS IN PARALLEL ───────────────────────────────────────
		let warehouseList: any[] = [];
		let configServers: any[] = []; // Branch list from Agent config (authoritative IDs)
		let lineas: any[] = [];
		let categorias: any[] = [];
		let ubicaciones: any[] = [];

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
		const isAdmin = profileBranches.length === 0;

		// Fetch Firestore branch configuration for reliable co_sucu and is_default metadata
		let firestoreBranches: any[] = [];
		// FALLBACK: Use companyInfo.id (already resolved above) or urlTenant
		const effectiveCompanyId = companyInfo?.id || companyInfo?.slug || urlTenant || '';
		
		if (effectiveCompanyId && adminDb) {
			try {
				const fbSnap = await adminDb.collection(MasterCollections.CONNECTIONS)
					.doc(effectiveCompanyId)
					.collection('branches')
					.get();
				firestoreBranches = fbSnap.docs.map(doc => ({ 
					id: doc.id,
					...doc.data() 
				}));
				console.log(`[ARTICLES LOAD] Firestore branches found: ${firestoreBranches.length} for effective tenant: ${effectiveCompanyId}`);
			} catch (err: any) {
				console.warn(`[ARTICLES LOAD] Firestore branches fetch error (likely tenantId mismatch):`, err.message);
			}
		}

		// Build branch list from Agent config servers
		let allBranches = configServers.map((s: any) => {
			const fsConfig = firestoreBranches.find(fb => fb.id === s.id) || 
			                 firestoreBranches.find(fb => fb.name?.trim().toLowerCase() === (s.name || s.nombre)?.trim().toLowerCase());
			
			const mappedCode = fsConfig?.co_sucur || fsConfig?.co_sucu || fsConfig?.co_sede || fsConfig?.sucursal || s.co_sucur || s.co_sucu || s.sucursal || '';
			
			if (fsConfig) {
				console.log(`[ARTICLES LOAD] Match found for ${s.name}: ${mappedCode || 'no-code'}`);
			} else {
				console.log(`[ARTICLES LOAD] NO Match found in Firestore for Agent branch ${s.name} (${s.id})`);
			}

			return {
				id: s.id,
				name: s.name || s.nombre || s.description || s.id,
				is_default: fsConfig?.is_default || !!s.is_default || false,
				co_sucu: mappedCode
			};
		});

		// Fallback to warehouse sede information if agent config is missing
		if (allBranches.length === 0) {
			const seenIds = new Set<string>();
			warehouseList.forEach((a: any) => {
				const sedeId = a.sede_id || a.co_sede || a.co_sucur;
				const sedeName = a.sede_nombre || a.sede_des || a.nombre_sede;
				if (sedeId && sedeName && !seenIds.has(sedeId)) {
					seenIds.add(sedeId);
					const fsConfig = firestoreBranches.find(fb => fb.id === sedeId) ||
					                 firestoreBranches.find(fb => fb.name === sedeName);
					
					allBranches.push({ 
						id: sedeId, 
						name: sedeName, 
						is_default: fsConfig?.is_default || !!a.is_default,
						co_sucu: fsConfig?.co_sucur || fsConfig?.co_sucu || fsConfig?.sucursal || a.co_sucur || a.co_sucu || ''
					});
				}
			});
		}

		console.log(`[ARTICLES LOAD] Final allBranches mapping:`, JSON.stringify(allBranches.map(b => ({ id: b.id, s: b.co_sucu }))));

		// Filter branches by user permissions (no fallback — if restricted, only show allowed)
		const allowedBranches = isAdmin
			? allBranches
			: allBranches.filter(b => profileBranches.includes(b.id));

		// Selected branch from URL or default branch
		const urlBranchId = url.searchParams.get('branch_id');
		const defaultBranch = allowedBranches.find(b => b.is_default);
		
		console.log(`[ARTICLES LOAD] Branch count: ${allowedBranches.length}. Default: ${defaultBranch?.name || 'none'}`);
		
		const branchId = (urlBranchId && allowedBranches.some(b => b.id === urlBranchId))
			? urlBranchId
			: (defaultBranch?.id || allowedBranches[0]?.id || '');

		let selectedBranchObj = allowedBranches.find(b => b.id === branchId);
		console.log(`[ARTICLES LOAD] Selected Branch: ${branchId}. co_sucu: ${selectedBranchObj?.co_sucu}`);

		// ─── 4.5. FETCH UBICACIONES (Needs branchId) ───────────────────────────
		try {
			const ubicRes = await agentClient.request<any>(`/ubicaciones${branchId ? `?sede_id=${branchId}` : ''}`).catch(() => ({ data: [] }));
			ubicaciones = (ubicRes as any).data || (ubicRes as any).items || (Array.isArray(ubicRes) ? ubicRes : []);
		} catch (e) {
			console.error('[ARTICLES] Ubicaciones fetch error:', e);
		}

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
		const ubicacionId = url.searchParams.get('co_ubicacion') || '';

		let endpoint: string;
		const params = new URLSearchParams();
		params.set('page', String(pageIndex));
		params.set('limit', String(limit));

		if (searchTerm || lineaId || categoriaId || ubicacionId) {
			// Use search endpoint
			if (searchTerm) {
				const isCode = /^\d/.test(searchTerm.trim());
				params.set(isCode ? 'co_art' : 'descripcion', searchTerm);
			}
			if (lineaId) params.set('linea', lineaId);
			if (categoriaId) params.set('categoria', categoriaId);
			if (ubicacionId) params.set('co_ubicacion', ubicacionId);
			if (branchId) {
				params.set('sede_id', branchId);
				params.set('sede', branchId);
			}
			if (warehouseId) params.set('co_alma', warehouseId);
			if (ubicacionId) params.set('co_ubicacion', ubicacionId);
			endpoint = `/articulos/search?${params.toString()}`;
		} else {
			// Use paginated listing
			if (branchId) {
				params.set('sede_id', branchId);
				params.set('sede', branchId);
			}
			if (warehouseId) params.set('co_alma', warehouseId);
			if (ubicacionId) params.set('co_ubicacion', ubicacionId);
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
					ubicaciones,
					ubicacionId,
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
				ubicaciones,
				ubicacionId,
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

export const actions: Actions = {
	assignLocations: async ({ request, locals }) => {
		const data = await request.formData();
		const co_art = data.get('co_art') as string;
		const co_ubicacion = (data.get('co_ubicacion') as string) || '';
		const co_ubicacion2 = (data.get('co_ubicacion2') as string) || '';
		const co_ubicacion3 = (data.get('co_ubicacion3') as string) || '';
		const co_alma = (data.get('co_alma') as string) || '01';
		const co_sucu = (data.get('co_sucu') as string) || '';
		const tenantId = data.get('tenantId') as string;
		const sede_id = (data.get('sede_id') as string) || '';
		const sede_name = (data.get('sede_name') as string) || '';

		if (!co_art || !tenantId) {
			return fail(400, { error: 'Faltan datos requeridos (código de artículo o empresa).' });
		}

		try {
			const { adminDb, MasterCollections } = await import('$lib/server/firebase-admin');
			let companyInfo: any = null;
			const snap = await adminDb!.collection(MasterCollections.CONNECTIONS).doc(tenantId).get();
			if (snap.exists) {
				companyInfo = snap.data();
			} else {
				// Buscar por slug
				const query = await adminDb!.collection(MasterCollections.CONNECTIONS).where('slug', '==', tenantId).get();
				if (!query.empty) companyInfo = query.docs[0].data();
			}

			if (!companyInfo?.agent_url) {
				return fail(400, { error: 'No se encontró la configuración del Agente para la empresa seleccionada.' });
			}

			const agentClient = new AgentClient({
				slug: companyInfo.slug,
				agent_url: companyInfo.agent_url,
				agent_api_key: companyInfo.agent_api_key
			});

			// CRITICAL: Fetch the technical code (co_sucu) directly from Firestore using the UUID (sede_id)
			// This bypasses any client-side mapping issues and ensures the Profit engine gets a valid code.
			let verifiedCoSucu = co_sucu;
			try {
				const branchesRef = adminDb!.collection(MasterCollections.CONNECTIONS)
					.doc(companyInfo.id || tenantId)
					.collection('branches');
				
				const branchDoc = await branchesRef.doc(sede_id).get();
				
				if (branchDoc.exists) {
					const bData = branchDoc.data();
					verifiedCoSucu = bData?.co_sucur || bData?.co_sucu || bData?.sucursal || co_sucu;
					console.log(`[ASSIGN LOCATIONS] Server-side verified co_sucu by UUID ${sede_id}: ${verifiedCoSucu}`);
				} else {
					console.warn(`[ASSIGN LOCATIONS] Branch UUID ${sede_id} not found. Attempting name-based fallback lookup for: ${sede_name}`);
					// Fallback: If UUID fails, find any branch for this tenant that matches the name/code
					const allBranchesSnap = await branchesRef.get();
					const fallbackMatch = allBranchesSnap.docs.find(doc => {
						const d = doc.data();
						return d.name?.trim().toLowerCase() === sede_name?.trim().toLowerCase() ||
						       d.co_sucur === co_sucu || d.co_sucu === co_sucu;
					});
					
					if (fallbackMatch) {
						const d = fallbackMatch.data();
						verifiedCoSucu = d.co_sucur || d.co_sucu;
						console.log(`[ASSIGN LOCATIONS] Fallback match found by name (${sede_name}): ${verifiedCoSucu}`);
					}
				}
			} catch (err: any) {
				console.error(`[ASSIGN LOCATIONS] Error fetching branch metadata:`, err);
			}

			const payload: any = { 
				co_alma, 
				// The agent's SQL routine likely expects the technical code in the JSON body's sede_id
				sede_id: verifiedCoSucu || sede_id 
			};
			
			// Optional fields: ONLY send if not empty
			if (verifiedCoSucu) payload.co_sucu = verifiedCoSucu;
			payload.usuario_id = locals.profile?.profit_user || 'ADMIN';
			
			if (co_ubicacion) payload.co_ubicacion = co_ubicacion;
			if (co_ubicacion2) payload.co_ubicacion2 = co_ubicacion2;
			if (co_ubicacion3) payload.co_ubicacion3 = co_ubicacion3;

			const endpoint = `/articulos/${co_art}/ubicaciones?sede=${sede_id}`;
			const payloadLog = { ...payload };
			console.log(`[ASSIGN LOCATIONS] REQ: PUT ${endpoint}`, JSON.stringify(payloadLog, null, 2));
			
			let res = await agentClient.request(endpoint, {
				method: 'PUT',
				body: JSON.stringify(payload)
			});

			// SELF-HEALING RETRY: If Agent says "Sede not found" for the UUID, 
			// retry using the technical short code (verifiedCoSucu).
			let wasRetried = false;
			if (!res.success && (res.message?.toLowerCase().includes('no encontrada')) && verifiedCoSucu && verifiedCoSucu !== sede_id) {
				const retryEndpoint = `/articulos/${co_art}/ubicaciones?sede=${verifiedCoSucu}`;
				console.log(`[ASSIGN LOCATIONS] RETRYING with short code: PUT ${retryEndpoint}`);
				res = await agentClient.request(retryEndpoint, {
					method: 'PUT',
					body: JSON.stringify(payload)
				});
				wasRetried = true;
			}

			if ((res as any).success === false) {
				const agentMsg = (res as any).message || (res as any).error || 'Error sin mensaje del agente';
				const agentDetail = (res as any).details || (res as any).data || '';
				return fail(400, { 
					error: `Fallo del Agente: ${agentMsg}${wasRetried ? ' (Retry Failed)' : ''}`,
					detail: `REQ: ${co_art} | SEDE_URL: ${sede_id} | SEDE_JSON: ${payload.sede_id} | SUCU: ${verifiedCoSucu} | USER: ${payload.usuario_id} | ERR: ${typeof agentDetail === 'object' ? JSON.stringify(agentDetail) : agentDetail}`
				});
			}

			return { success: true, co_art };

		} catch (err: any) {
			console.error('[ASSIGN LOCATIONS] Error:', err);
			return fail(500, { error: `Error interno: ${err.message}` });
		}
	}
};

