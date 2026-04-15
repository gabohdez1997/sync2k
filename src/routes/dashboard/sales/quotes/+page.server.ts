import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { redirect, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_quotes', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw new Error('Perfil no cargado.');

	// SEGURIDAD:
	// - Nueva cotización: requiere create
	// - Edición (doc_num): requiere update
	const docNumInUrl = url.searchParams.get('doc_num');
	const canCreate = hasPermission(profile, 'sales_quotes', 'create');
	const canUpdate = hasPermission(profile, 'sales_quotes', 'update');
	const canAccess = docNumInUrl ? canUpdate : canCreate;
	if (!canAccess) {
		throw redirect(303, '/dashboard/sales/quotes/history');
	}

	try {
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
		}, profile, fetch);

		const pageIndex = parseInt(url.searchParams.get('page') || '1', 10);
		const limit = 12;

		// 4. Cargar catálogos (Almacenes, Líneas, Categorías, Zonas)
		let warehouseList: any[] = [];
		let lineas: any[] = [];
		let categorias: any[] = [];
		let zonas: any[] = [];

		try {
			const [almaRes, lineasRes, catsRes, zonRes] = await Promise.all([
				agentClient.request<any>('/catalogos/almacenes'),
				agentClient.request<any>('/catalogos/lineas'),
				agentClient.request<any>('/catalogos/categorias').catch(e => { console.error('Error cats:', e.message); return { data: [] }; }),
				agentClient.getZonas().catch(e => { console.error('Error zonas:', e.message); return { data: [] }; })
			]);

			warehouseList = (almaRes as any).data || (almaRes as any).items || (Array.isArray(almaRes) ? almaRes : []);
			lineas = (lineasRes as any).data || (lineasRes as any).items || (Array.isArray(lineasRes) ? lineasRes : []);
			categorias = (catsRes as any).data || (catsRes as any).items || (Array.isArray(catsRes) ? catsRes : []);
			zonas = (zonRes as any).data || (zonRes as any).items || (Array.isArray(zonRes) ? zonRes : []);
			console.log(`[QUOTES LOAD] Zonas recuperadas: ${zonas.length}`);
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

		const allowedWarehousesForBranch = isAdmin
			? branchWarehouseList
			: branchWarehouseList.filter((a: any) => {
				const almaId = a.co_alma || a.id || a.warehouse_id;
				return profileWarehouses.includes(almaId);
			  });

		const finalWarehouseIds = allowedWarehousesForBranch.map((a: any) => a.co_alma || a.id || a.warehouse_id).filter(Boolean);

		const urlWarehouseId = url.searchParams.get('co_alma');
		const warehouseId = (urlWarehouseId && finalWarehouseIds.includes(urlWarehouseId))
			? urlWarehouseId
			: '';

		// 6. Cargar cotización pre-existente si viene en el URL (EDICIÓN)
		const doc_num = url.searchParams.get('doc_num');
		let preloadedQuote = null;
		if (doc_num) {
			try {
				const qRes = await agentClient.request<any>(`/cotizaciones/${doc_num}`);
				if (qRes.success && qRes.data) {
					const q = Array.isArray(qRes.data) ? qRes.data[0] : qRes.data;
					const status = String(q?.status ?? '').trim();
					const isAnulada = !!q?.anulado;
					if (!isAnulada && status === '0') {
						preloadedQuote = q;
					} else {
						console.warn(`[QUOTES] Bloqueada edición de ${doc_num}. status=${status}, anulado=${isAnulada}`);
					}
				}
			} catch (e) {
				console.error('[QUOTES] Error loading quote for edit:', e);
			}
		}

		// --- SEGURIDAD: Artículos se cargan en el cliente ---
		return {
			articles: [],
			pagination: { total: 0, page: 1, limit: 12, totalPages: 0 },
			branches: allowedBranches,
			selectedBranchId: selectedBranch.id,
			preloadedQuote,
			context: {
				branchId: selectedBranch.id,
				warehouseId,
				finalWarehouseIds,
				lineas,
				categorias,
				zonas,
				warehouses: allowedWarehousesForBranch
			}
		};
	} catch (err: any) {
		console.error('[QUOTES] Load error:', err);
		return {
			articles: [],
			pagination: { total: 0, page: 1, limit: 12, totalPages: 1 },
			error: 'Error al conectar con la sucursal: ' + err.message,
			context: { branches: [] }
		};
	}
});

export const actions: Actions = {
	searchClient: protectAction('sales_quotes', async ({ request, locals, fetch }) => {
		const profile = locals.profile;
		if (!profile) return fail(401, { message: 'Sesión expirada' });

		const formData = await request.formData();
		// Estandarizar RIF: Mayúsculas y sin guiones
		const rifRaw = formData.get('rif') as string;
		const rif = rifRaw?.trim().toUpperCase().replace(/[-\s]/g, '');
		const branchId = formData.get('branch_id') as string;

		if (!rif) return fail(400, { message: 'El RIF es requerido' });

		const branch = profile.allowed_branches?.find(b => b.id === branchId);
		if (!branch) return fail(404, { message: 'Sucursal no encontrada' });

		const agentClient = new AgentClient(branch, profile, fetch);
		try {
			// Buscar por código (co_cli) ya que RIF = Código
			const res = await agentClient.request<any>(`/clientes/${rif}`);
			
			if (res.success && res.data) {
				// El agente devuelve un array de resultados por sede
				const clientData = Array.isArray(res.data) ? res.data.find(c => !c.error) : res.data;
				if (clientData) {
					return { success: true, client: clientData };
				}
			}

			// Fallback: búsqueda general si falla el directo
			const searchRes = await agentClient.request<any>(`/clientes/search?rif=${rif}`);
			const items = Array.isArray(searchRes.data) ? searchRes.data : (searchRes.data?.items || searchRes.items || []);
			
			const client = items.find((c: any) => 
				c.rif?.toUpperCase().replace(/[-\s]/g, '') === rif || 
				c.co_cli?.toUpperCase().replace(/[-\s]/g, '') === rif
			);

			if (!client) {
				return { success: true, client: null, message: 'Cliente no encontrado. Proceda a crearlo.' };
			}

			return { success: true, client };
		} catch (e: any) {
			// Si es 404 de la API directa, retornar null para que el front ofrezca registro
			if (e.status === 404) return { success: true, client: null };
			return fail(500, { message: 'Error en búsqueda: ' + e.message });
		}
	}),

	saveCustomer: protectAction('sales_quotes', async ({ request, locals, fetch }) => {
		const profile = locals.profile;
		const formData = await request.formData();
		const branchId = formData.get('branch_id') as string;
		const branch = profile.allowed_branches?.find(b => b.id === branchId);
		if (!branch) return fail(404, { message: 'Sucursal no encontrada' });

		const agentClient = new AgentClient(branch, profile, fetch);
		const data = Object.fromEntries(formData.entries());

		try {
			const res: any = await agentClient.request('/clientes', {
				method: 'POST',
				body: JSON.stringify(data)
			});

			if (res.success) {
				return { success: true, client: res.data || res.items?.[0] };
			} else {
				return fail(400, { message: res.message || 'Error al crear cliente' });
			}
		} catch (e: any) {
			return fail(500, { message: e.message });
		}
	}),

	saveQuote: protectAction('sales_quotes', async ({ request, locals, fetch }) => {
		const profile = locals.profile;
		const formData = await request.formData();
		const branchId = formData.get('branch_id') as string;
		const quoteDataStr = formData.get('quote_data') as string;
		
		if (!quoteDataStr) return fail(400, { message: 'Datos de cotización no recibidos' });

		const branch = profile.allowed_branches?.find(b => b.id === branchId);
		if (!branch) return fail(404, { message: 'Sucursal no encontrada' });

		const agentClient = new AgentClient(branch, profile, fetch);
		try {
			const quoteData = JSON.parse(quoteDataStr);
			const isEdit = !!quoteData?.doc_num;

			// Permisos granulares por operación
			if (isEdit && !hasPermission(profile, 'sales_quotes', 'update')) {
				return fail(403, { message: 'No tienes permiso para editar cotizaciones.' });
			}
			if (!isEdit && !hasPermission(profile, 'sales_quotes', 'create')) {
				return fail(403, { message: 'No tienes permiso para crear cotizaciones.' });
			}
			
			// Vincular Vendedor y Moneda basados en el perfil y la interfaz
			const enrichedQuoteData = {
				...quoteData,
				co_ven: profile.profit_user, // Tomado de PostgreSQL/Supabase
				isUSD: quoteData.showUSD // Dejar que el Agente decida el código exacto de moneda
			};

			const res: any = await agentClient.request('/cotizaciones', {
				method: 'POST',
				body: JSON.stringify(enrichedQuoteData)
			});

			if (res.success || (res.results && res.results[0]?.success)) {
				return { success: true, message: 'Cotización guardada correctamente en Profit Plus' };
			} else {
				let errorMsg = res.message || 'Error al guardar en Profit';
				
				// Capturar Conflicto de Vendedor (Llave Foránea)
				if (errorMsg.includes('FK_saCotizacionCliente_saVendedor')) {
					errorMsg = "Su usuario no está registrado como Vendedor en Profit Plus para esta sede. Por favor contacte al administrador.";
				}

				const details = res.details ? JSON.stringify(res.details) : null;
				return fail(400, { 
					message: errorMsg,
					details 
				});
			}
		} catch (e: any) {
			return fail(500, { message: e.message });
		}
	})
};
