// src/routes/dashboard/articles/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { logAction } from '$lib/server/audit';
import { fail } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = protectLoad('sec_articles', async ({ url, locals }) => {
	try {
		const userProfile = (locals as any).profile;

		// ─── 1. LOAD ALL BRANCHES FROM SUPABASE ────────────────────────────────
		let allBranches: any[] = [];
		const { data: dbBranches, error } = await supabaseAdmin
			.from('branches')
			.select('id, name, agent_url, agent_token, profit_branch_codes, active, sort_order')
			.eq('active', true)
			.order('sort_order')
			.order('name');

		if (error) {
			console.error('[ARTICLES] Supabase branches error:', error.message);
		} else if (dbBranches) {
			allBranches = dbBranches.map(b => {
				// Evaluar codigo asociado por el Agente (Profit)
				let defaultCode = '';
				let isDefault = false;
				if (Array.isArray(b.profit_branch_codes) && b.profit_branch_codes.length > 0) {
					const def = b.profit_branch_codes.find((c: any) => c.is_default);
					if (def) {
						defaultCode = def.code;
						isDefault = true;
					} else {
						defaultCode = b.profit_branch_codes[0].code;
					}
				}

				return {
					id: b.id,
					name: b.name,
					agent_url: b.agent_url,
					agent_token: b.agent_token,
					co_sucu: defaultCode,
					is_default: isDefault
				};
			});
		}

		// Filter branches by user permissions
		const profileAllowed = userProfile?.allowed_branches || [];
		const profileBranchIds: string[] = Array.isArray(profileAllowed) 
			? profileAllowed.map((b: any) => (typeof b === 'object' ? b.id : b))
			: [];
		
		const profileWarehouses: string[] = userProfile?.allowed_warehouses || [];
			
		const isAdmin = profileBranchIds.length === 0;

		const allowedBranches = isAdmin
			? allBranches
			: allBranches.filter(b => profileBranchIds.includes(b.id));

		// If no branches allowed/configured, fast return
		if (allowedBranches.length === 0) {
			return {
				articles: [],
				branches: allowedBranches,
				context: null,
				requireBranchSelection: true
			};
		}

		// Selected branch from URL or default
		const urlBranchId = url.searchParams.get('branch_id');
		const defaultBranch = allowedBranches.find(b => b.is_default);
		
		const branchId = (urlBranchId && allowedBranches.some(b => b.id === urlBranchId))
			? urlBranchId
			: (defaultBranch?.id || allowedBranches[0]?.id || '');

		let selectedBranchObj = allowedBranches.find(b => b.id === branchId);

		if (!selectedBranchObj?.agent_url) {
			return {
				articles: [],
				branches: allowedBranches,
				context: null,
				requireBranchSelection: true
			};
		}

		// ─── 2. INIT AGENT CLIENT ────────────────────────────────────────────────
		const agentClient = new AgentClient({
			slug: selectedBranchObj.id,
			agent_url: selectedBranchObj.agent_url,
			agent_api_key: selectedBranchObj.agent_token
		}, (locals as any).profile || undefined);

		const pageIndex = parseInt(url.searchParams.get('page') || '1', 10);
		const limit = 12;
		const showAll = url.searchParams.get('show_all') === 'true';

		// ─── 3. LOAD CATALOGS IN PARALLEL ───────────────────────────────────────
		let warehouseList: any[] = [];
		let lineas: any[] = [];
		let categorias: any[] = [];
		let ubicaciones: any[] = [];

		try {
			const [almaRes, lineasRes, catsRes, ubicRes] = await Promise.all([
				agentClient.request<any>('/catalogos/almacenes').catch(() => ({ data: [] })),
				agentClient.request<any>('/catalogos/lineas').catch(() => ({ data: [] })),
				agentClient.request<any>('/catalogos/categorias').catch(() => ({ data: [] })),
				agentClient.request<any>(`/ubicaciones${branchId ? `?sede_id=${branchId}` : ''}`).catch(() => ({ data: [] }))
			]);

			warehouseList = (almaRes as any).data || (almaRes as any).items || (Array.isArray(almaRes) ? almaRes : []);
			lineas = (lineasRes as any).data || (lineasRes as any).items || (Array.isArray(lineasRes) ? lineasRes : []);
			categorias = (catsRes as any).data || (catsRes as any).items || (Array.isArray(catsRes) ? catsRes : []);
			ubicaciones = (ubicRes as any).data || (ubicRes as any).items || (Array.isArray(ubicRes) ? ubicRes : []);
		} catch (e) {
			console.error('[ARTICLES] Catalog fetch error:', e);
		}

		// ─── 4. BUILD WAREHOUSE MAPS ───────────────────────────────────
		// Build warehouse list filtered by selected branch
		const allWarehousesForBranch = warehouseList;

		// Filter warehouses by user permissions
		const allowedWarehousesForBranch = isAdmin || profileWarehouses.length === 0
			? allWarehousesForBranch
			: allWarehousesForBranch.filter((a: any) => {
				const almaId = a.co_alma || a.id || a.warehouse_id;
				return profileWarehouses.includes(almaId);
			  });

		const finalWarehouseIds = allowedWarehousesForBranch.map((a: any) => a.co_alma || a.id || a.warehouse_id).filter(Boolean);

		let urlWarehouseId = url.searchParams.get('co_alma') || '';
		let warehouseId = '';

		if (urlWarehouseId && finalWarehouseIds.includes(urlWarehouseId)) {
			warehouseId = urlWarehouseId;
		} else if (profileWarehouses.length > 0 && !isAdmin && finalWarehouseIds.length > 0) {
			warehouseId = finalWarehouseIds[0];
		}

		// ─── 5. FETCH ARTICLES ───────────────────────────────────────────────────
		const searchTerm = url.searchParams.get('search') || '';
		const lineaId = url.searchParams.get('linea') || '';
		const categoriaId = url.searchParams.get('categoria') || '';
		const ubicacionId = url.searchParams.get('co_ubicacion') || '';

		let endpoint: string;
		const params = new URLSearchParams();
		params.set('page', String(pageIndex));
		params.set('limit', String(limit));
		
		// DEFAULT: only show items in stock unless 'show_all' is specified
		if (showAll) {
			params.set('in_stock', 'all');
		} else {
			// In our agent, any value that is not 'all' triggers stock filtering if no 'all' is sent.
			// Actually, the agent's logic is: if (in_stock !== 'all') -> filter stock > 0.
			params.delete('in_stock'); 
		}

		if (searchTerm || lineaId || categoriaId || ubicacionId) {
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
				branches: allowedBranches,
				context: {
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

		// Extraer permisos CRUD del usuario para esta sección
		const crud = userProfile?.permissions?.['sec_articles'] || { read: true, create: false, update: false, delete: false };

		return {
			articles,
			endpoint,
			branches: allowedBranches,
			crud,
			context: {
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
		return { articles: [], error: `Error interno: ${e.message}`, branches: [] };
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
		const branchId = data.get('branchId') as string;

		if (!co_art || !branchId) {
			return fail(400, { error: 'Faltan datos requeridos (código de artículo o sucursal).' });
		}

		// --- PERMISSION VALIDATION ---
		const userProfile = locals.profile;
		if (!userProfile) {
			return fail(401, { error: 'Sesión inválida o expirada.' });
		}

		const isAdmin = !userProfile.allowed_branches || userProfile.allowed_branches.length === 0;
		
		if (!isAdmin) {
			const allowedBranchIds = (userProfile.allowed_branches as any[]).map(b => typeof b === 'object' ? b.id : b);
			if (!allowedBranchIds.includes(branchId)) {
				return fail(403, { error: 'No tienes permiso para operar en esta sede.' });
			}
			if (userProfile.allowed_warehouses && userProfile.allowed_warehouses.length > 0) {
				const allowedWarehouseIds = userProfile.allowed_warehouses as string[];
				if (!allowedWarehouseIds.includes(co_alma)) {
					return fail(403, { error: 'No tienes permiso para operar en este almacén.' });
				}
			}
		}

		try {
			// Fetch branch from Supabase to get Agent details explicitly
			const { data: dbBranch, error: branchErr } = await supabaseAdmin
				.from('branches')
				.select('id, name, agent_url, agent_token, profit_branch_codes')
				.eq('id', branchId)
				.single();

			if (branchErr || !dbBranch?.agent_url) {
				return fail(400, { error: 'No se encontró la configuración del Agente para la sucursal seleccionada.' });
			}

			// Parse profit_branch_codes to find the co_sucu code to send to Profit
			let verifiedCoSucu = '';
			if (Array.isArray(dbBranch.profit_branch_codes) && dbBranch.profit_branch_codes.length > 0) {
				const def = dbBranch.profit_branch_codes.find((c: any) => c.is_default);
				verifiedCoSucu = def ? def.code : dbBranch.profit_branch_codes[0].code;
			}

			const agentClient = new AgentClient({
				slug: dbBranch.id,
				agent_url: dbBranch.agent_url as string,
				agent_api_key: dbBranch.agent_token
			}, (locals as any).profile || undefined);

			const payload: any = { 
				co_alma, 
				// El agente Profit requiere 'sede' y 'co_sucu'
				sede: branchId,
				co_sucu: verifiedCoSucu, 
				co_ubicacion,
				co_ubicacion2,
				co_ubicacion3,
				usuario_id: locals.profile?.profit_user || 'ADMIN'
			};
			
			const endpoint = `/articulos/${co_art}/ubicaciones`;
			
			// --- STEP 1: GET OLD DATA FOR AUDIT ---
			let oldData: any = null;
			try {
				const currentRes = await agentClient.request(endpoint);
				if ((currentRes as any).success !== false) {
					oldData = (currentRes as any).data || currentRes;
				}
			} catch (e) {
				console.warn('[AUDIT] No se pudo obtener el estado anterior:', e);
			}

			console.log(`[ASSIGN LOCATIONS] REQ: PUT ${endpoint}`, JSON.stringify(payload, null, 2));
			
			let res = await agentClient.request(endpoint, {
				method: 'PUT',
				body: JSON.stringify(payload)
			});

			if ((res as any).success === false) {
				// Retry with technical code on sede if normal branchId fails to map correctly inside Agent
				if ((res as any).message?.toLowerCase().includes('no encontrada') && verifiedCoSucu && verifiedCoSucu !== branchId) {
					payload.sede = verifiedCoSucu;
					console.log(`[ASSIGN LOCATIONS] RETRYING with technical code: ${verifiedCoSucu}`);
					res = await agentClient.request(endpoint, {
						method: 'PUT',
						body: JSON.stringify(payload)
					});
				}
			}

			if ((res as any).success === false) {
				const agentMsg = (res as any).message || (res as any).error || 'Error sin mensaje del agente';
				const agentDetail = (res as any).details || (res as any).data || '';
				return fail(400, { 
					error: `Fallo del Agente: ${agentMsg}`,
					detail: `REQ: ${co_art} | SUCU/SEDE: ${verifiedCoSucu} | ERR: ${typeof agentDetail === 'object' ? JSON.stringify(agentDetail) : agentDetail}`
				});
			}

			// Auditoría
			await logAction({
				uid:          locals.profile?.id ?? null,
				user_email:   locals.profile?.email ?? 'system',
				action:       'UPDATE',
				module:       'sec_articles',
				record_id:    co_art,
				branch_id:    branchId,
				old_data:     oldData,
				new_data:     { co_alma, co_ubicacion, co_ubicacion2, co_ubicacion3 },
				source:       'cloud'
			});

			return { success: true, co_art };

		} catch (err: any) {
			console.error('[ASSIGN LOCATIONS] Error:', err);
			return fail(500, { error: `Error interno: ${err.message}` });
		}
	}
};
