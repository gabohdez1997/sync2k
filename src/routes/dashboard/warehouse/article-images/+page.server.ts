import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { logAction } from '$lib/server/audit';
import { fail } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = protectLoad('sec_article_images', async ({ url, locals, fetch }) => {
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
		}, (locals as any).profile || undefined, fetch);

		const pageIndex = parseInt(url.searchParams.get('page') || '1', 10);
		const limit = 12;
		const showAll = url.searchParams.get('show_all') === 'true';
		const searchTerm = (url.searchParams.get('search') || '').trim();
		const linea = (url.searchParams.get('linea') || '').trim();
		const categoria = (url.searchParams.get('categoria') || '').trim();
		const ubicacionId = (url.searchParams.get('co_ubicacion') || '').trim();

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
		// Filter warehouses by user permissions
		const allowedWarehousesForBranch = isAdmin || profileWarehouses.length === 0
			? warehouseList
			: warehouseList.filter((a: any) => {
				const almaId = a.co_alma || a.id || a.warehouse_id;
				return profileWarehouses.includes(almaId);
			  });

		const finalWarehouseIds = allowedWarehousesForBranch.map((a: any) => a.co_alma || a.id || a.warehouse_id).filter(Boolean);

		// ─── 5. BUILD ENDPOINT & FETCH ARTICLES ───────────────────────────────────
		const params = new URLSearchParams();
		params.set('page', pageIndex.toString());
		params.set('limit', limit.toString());
		if (showAll) params.set('in_stock', 'all');
		if (linea) params.set('linea', linea);
		if (categoria) params.set('categoria', categoria);
		if (ubicacionId) params.set('co_ubicacion', ubicacionId);

		if (searchTerm) {
			params.set('search', searchTerm);
		}

		// Bypass /articulos endpoint size issue by forcing /search with a sort filter fallback
		params.set('sort', url.searchParams.get('sort') || 'default');

		const endpoint = `/articulos/search?${params.toString()}`;

		let articles: any[] = [];
		let resData: any = { success: true, pagination: { total: 0, page: 1, limit: 12, totalPages: 0 } };

		try {
			const response = await agentClient.request<any>(endpoint);
			articles = (response.data?.items || response.items || response.data || (Array.isArray(response) ? response : []));
			resData = response;
		} catch (e) {
			console.error('[ARTICLES] Fetch articles error:', e);
		}

		// Extraer permisos CRUD del usuario para esta sección
		const crud = userProfile?.permissions?.['sec_article_images'] || { read: true, create: false, update: false, delete: false };

		const returnedData = {
			articles,
			branches: allowedBranches,
			crud,
			context: {
				branchId,
				finalWarehouseIds,
				lineas,
				categorias,
				ubicaciones,
				ubicacionId,
				branches: allowedBranches,
				warehouses: allowedWarehousesForBranch
			},
			pagination: {
				page: Number((resData as any).pagination?.currentPage || (resData as any).pagination?.page || pageIndex),
				totalPages: Number((resData as any).pagination?.pages || (resData as any).pagination?.totalPages || 1),
				totalItems: Number((resData as any).pagination?.total || articles.length)
			}
		};
		console.log('[DEBUG PAGINATION]', JSON.stringify(returnedData.pagination));
		return returnedData;

	} catch (e: any) {
		console.error('[ARTICLES] Fatal error:', e);
		return { articles: [], error: `Error interno: ${e.message}`, branches: [] };
	}
});

export const actions: Actions = {
	updateImage: protectAction('sec_article_images', async ({ request, locals, fetch }) => {
		const data = await request.formData();
		const co_art = data.get('co_art') as string;
		const imageFile = data.get('imageFile') as File | null;
		const branchId = data.get('branchId') as string;
		const oldImageFile = data.get('oldImageFile') as string | null;

		if (!co_art || !branchId || !imageFile) {
			return fail(400, { error: 'Faltan datos requeridos (código de artículo, imagen o sucursal).' });
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
		}

		try {
			// Fetch ALL branches from Supabase to update the image in ALL of them
			const { data: dbBranches, error: branchErr } = await supabaseAdmin
				.from('branches')
				.select('id, name, agent_url, agent_token, profit_branch_codes, active')
				.eq('active', true);

			if (branchErr || !dbBranches || dbBranches.length === 0) {
				return fail(400, { error: 'No se encontraron sucursales activas configuradas.' });
			}

			// --- UPLOAD TO SUPABASE ---
			const fileName = `${co_art.trim()}-${Date.now()}.webp`;
			const arrayBuffer = await imageFile.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

			const { error: uploadError } = await supabaseAdmin.storage
				.from('articulos')
				.upload(fileName, buffer, {
					contentType: 'image/webp',
					cacheControl: '3600',
					upsert: true
				});

			if (uploadError) {
				return fail(500, { error: `Error subiendo imagen: ${uploadError.message}` });
			}

			// Eliminar la imagen anterior del bucket si existe
			if (oldImageFile) {
				const { error: removeError } = await supabaseAdmin.storage
					.from('articulos')
					.remove([oldImageFile]);
				
				if (removeError) {
					console.error('[SUPABASE] Error eliminando imagen antigua:', removeError.message);
					// No bloqueamos la ejecución si falla el borrado
				}
			}

			const { data: publicUrlData } = supabaseAdmin.storage.from('articulos').getPublicUrl(fileName);
			const imageUrl = publicUrlData.publicUrl;

			let hasAnySuccess = false;
			let errors = [];

			// Sincronizar con todos los agentes
			for (const dbBranch of dbBranches) {
				if (!dbBranch.agent_url) continue;

				let verifiedCoSucu = '';
				if (Array.isArray(dbBranch.profit_branch_codes) && dbBranch.profit_branch_codes.length > 0) {
					const def = dbBranch.profit_branch_codes.find((c: any) => c.is_default);
					verifiedCoSucu = def ? def.code : dbBranch.profit_branch_codes[0].code;
				}

				const agentClient = new AgentClient({
					slug: dbBranch.id,
					agent_url: dbBranch.agent_url as string,
					agent_api_key: dbBranch.agent_token
				}, (locals as any).profile || undefined, fetch);

				const payload: any = { 
					sede: dbBranch.id,
					co_sucu: verifiedCoSucu, 
					imageUrl: fileName, // Enviamos SOLO el nombre del archivo para no exceder los 60 caracteres
					usuario_id: locals.profile?.profit_user || 'ADMIN'
				};
				
				const endpoint = `/articulos/${co_art}/imagen`;
				
				try {
					let res = await agentClient.request(endpoint, {
						method: 'PUT',
						body: JSON.stringify(payload)
					});

					if ((res as any).success === false && verifiedCoSucu && verifiedCoSucu !== dbBranch.id) {
						if ((res as any).message?.toLowerCase().includes('no encontrada')) {
							payload.sede = verifiedCoSucu;
							res = await agentClient.request(endpoint, {
								method: 'PUT',
								body: JSON.stringify(payload)
							});
						}
					}

					if ((res as any).success === false) {
						const agentMsg = (res as any).message || (res as any).error || 'Error desconocido';
						errors.push(`[${dbBranch.name}] ${agentMsg}`);
					} else {
						hasAnySuccess = true;
					}
				} catch (e: any) {
					errors.push(`[${dbBranch.name}] Error de conexión.`);
				}
			}

			if (!hasAnySuccess) {
				return fail(400, { 
					error: `Fallo del Agente en todas las sedes`,
					detail: errors.join(' | ')
				});
			}

			// Auditoría
			await logAction({
				uid:          locals.profile?.id ?? null,
				user_email:   locals.profile?.email ?? 'system',
				action:       'UPDATE',
				module:       'ARTICLE_IMAGES',
				record_id:    co_art,
				branch_id:    branchId,
				old_data:     oldData,
				new_data:     { imageUrl },
				source:       'cloud'
			});

			return { success: true, co_art, imageUrl: fileName };

		} catch (err: any) {
			console.error('[ASSIGN LOCATIONS] Error:', err);
			return fail(500, { error: `Error interno: ${err.message}` });
		}
	})
};
