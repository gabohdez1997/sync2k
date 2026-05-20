import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { logAction } from '$lib/server/audit';
import { supabaseAdmin } from '$lib/server/supabase';
import { redirect, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_quotes', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw new Error('Perfil no cargado.');

	const docNumInUrl = url.searchParams.get('doc_num');
	const canCreate = hasPermission(profile, 'sales_quotes', 'create');
	const canUpdate = hasPermission(profile, 'sales_quotes', 'update');
	const canAccess = docNumInUrl ? canUpdate : canCreate;
	if (!canAccess) {
		throw redirect(303, '/dashboard/sales/quotes/history');
	}

	try {
		const allowedBranches = profile.allowed_branches || [];
		if (allowedBranches.length === 0) return { articles: [], branches: [], error: 'No tienes sucursales asignadas.' };

		const urlBranchId = url.searchParams.get('branch_id');
		const selectedBranch = urlBranchId ? allowedBranches.find(b => b.id === urlBranchId) : allowedBranches[0];

		if (!selectedBranch || !selectedBranch.agent_url) return { articles: [], branches: allowedBranches, error: 'Sucursal no configurada.' };

		const agentClient = new AgentClient({
			slug: selectedBranch.id, agent_url: selectedBranch.agent_url, agent_api_key: selectedBranch.agent_token
		}, profile, fetch);

		let warehouseList: any[] = [];
		let lineas: any[] = [];
		let categorias: any[] = [];
		let zonas: any[] = [];
		let tiposCliente: any[] = [];

		try {
			const [almaRes, lineasRes, catsRes, zonRes, tcRes] = await Promise.all([
				agentClient.request<any>('/catalogos/almacenes'),
				agentClient.request<any>('/catalogos/lineas'),
				agentClient.request<any>('/catalogos/categorias').catch(() => ({ data: [] })),
				agentClient.getZonas().catch(() => ({ data: [] })),
				agentClient.getTiposCliente().catch(() => ({ data: [] }))
			]);
			warehouseList = (almaRes as any).data || (almaRes as any).items || (Array.isArray(almaRes) ? almaRes : []);
			lineas = (lineasRes as any).data || (lineasRes as any).items || (Array.isArray(lineasRes) ? lineasRes : []);
			categorias = (catsRes as any).data || (catsRes as any).items || (Array.isArray(catsRes) ? catsRes : []);
			zonas = (zonRes as any).data || (zonRes as any).items || (Array.isArray(zonRes) ? zonRes : []);
			tiposCliente = (tcRes as any).data || (tcRes as any).items || (Array.isArray(tcRes) ? tcRes : []);
		} catch (e) { console.error('[QUOTES] Catalog fetch error:', e); }

		const profileWarehouses: string[] = profile.allowed_warehouses || [];
		const isAdmin = profileWarehouses.length === 0;
		const branchWarehouseList = warehouseList.filter((a: any) => {
			const co_sucu = a.co_sucu || a.co_sucur || a.sede_id || a.co_sede;
			return co_sucu === selectedBranch.profit_branch_code || !co_sucu;
		});

		const allowedWarehousesForBranch = isAdmin ? branchWarehouseList : branchWarehouseList.filter((a: any) => {
			const almaId = a.co_alma || a.id || a.warehouse_id;
			return profileWarehouses.includes(almaId);
		});

		const finalWarehouseIds = allowedWarehousesForBranch.map((a: any) => a.co_alma || a.id || a.warehouse_id).filter(Boolean);
		const doc_num = url.searchParams.get('doc_num');
		let preloadedQuote = null;
		if (doc_num) {
			try {
				const qRes = await agentClient.request<any>(`/cotizaciones/${doc_num}`);
				if (qRes.success && qRes.data) {
					const q = Array.isArray(qRes.data) ? qRes.data[0] : qRes.data;
					if (!q?.anulado && String(q?.status ?? '').trim() === '0') preloadedQuote = q;
				}
			} catch (e) { console.error('[QUOTES] Error loading quote for edit:', e); }
		}

		return {
			articles: [], pagination: { total: 0, page: 1, limit: 12, totalPages: 0 },
			branches: allowedBranches, selectedBranchId: selectedBranch.id, preloadedQuote,
			context: { branchId: selectedBranch.id, warehouseId: '', finalWarehouseIds, lineas, categorias, zonas, tiposCliente, warehouses: allowedWarehousesForBranch }
		};
	} catch (err: any) {
		return { articles: [], pagination: { total: 0, page: 1, limit: 12, totalPages: 1 }, error: 'Error: ' + err.message, context: { branches: [] } };
	}
});

export const actions: Actions = {
	searchClient: protectAction('sales_quotes', async ({ request, locals, fetch }) => {
		const profile = locals.profile;
		if (!profile) return fail(401, { message: 'Sesión expirada' });
		const formData = await request.formData();
		const rawInput = (formData.get('rif') as string)?.trim() || '';
		const isCodeLike = /^[VJEGPCvjegpc]?[\d]+$/.test(rawInput.replace(/[-\s]/g, ''));
		const searchTerm = isCodeLike ? rawInput.toUpperCase().replace(/[-\s]/g, '') : rawInput;
		const branchId = formData.get('branch_id') as string;
		if (!searchTerm) return fail(400, { message: 'El término de búsqueda es requerido' });
		const branch = profile.allowed_branches?.find(b => b.id === branchId);
		if (!branch) return fail(404, { message: 'Sucursal no encontrada' });
		const agentClient = new AgentClient(branch, profile, fetch);
		try {
			if (isCodeLike) {
				const res = await agentClient.request<any>(`/clientes/${searchTerm}`);
				if (res.success && res.data) {
					const clientData = Array.isArray(res.data) ? res.data.find(c => !c.error) : res.data;
					if (clientData) return { success: true, client: clientData, clients: [clientData] };
				}
				const searchRes = await agentClient.request<any>(`/clientes/search?rif=${searchTerm}`);
				const items = Array.isArray(searchRes.data) ? searchRes.data : (searchRes.data?.items || searchRes.items || []);
				const client = items.find((c: any) => c.rif?.toUpperCase().replace(/[-\s]/g, '') === searchTerm || c.co_cli?.toUpperCase().replace(/[-\s]/g, '') === searchTerm);
				if (client) return { success: true, client: client, clients: [client] };
				return { success: true, client: null, clients: [], message: 'Cliente no encontrado.' };
			} else {
				const searchRes = await agentClient.request<any>(`/clientes/search?descripcion=${encodeURIComponent(searchTerm)}`);
				const items = Array.isArray(searchRes.data) ? searchRes.data : (searchRes.data?.items || searchRes.items || []);
				if (items.length === 1) return { success: true, client: items[0], clients: items };
				if (items.length > 1) return { success: true, client: null, clients: items };
				return { success: true, client: null, clients: [], message: 'Cliente no encontrado.' };
			}
		} catch (e: any) {
			if (e.status === 404) return { success: true, client: null, clients: [] };
			return fail(500, { message: 'Error: ' + e.message });
		}
	}),

	saveCustomer: protectAction('sales_quotes', async ({ request, locals, fetch }) => {
		const profile = locals.profile;
		const formData = await request.formData();
		const payload = { ...Object.fromEntries(formData), contribuyente: formData.has('contribuyente'), contribu_e: formData.has('contribu_e') || formData.has('contribuu_e'), porc_esp: parseFloat(formData.get('porc_esp') as string) || 0 };

		// Broadcast: obtener TODAS las sucursales activas desde Supabase (igual que customers)
		let targetBranches: any[] = [];
		const profileAllowed = profile.allowed_branches || [];
		const isAdmin = !profileAllowed || profileAllowed.length === 0;
		if (isAdmin) {
			const { data } = await supabaseAdmin.from('branches').select('*').eq('active', true);
			targetBranches = data || [];
		} else {
			const allowedIds = profileAllowed.map((b: any) => (typeof b === 'object' ? b.id : b));
			const { data } = await supabaseAdmin.from('branches').select('*').in('id', allowedIds).eq('active', true);
			targetBranches = data || [];
		}
		if (targetBranches.length === 0) return fail(403, { message: 'No se encontraron sucursales activas autorizadas.' });

		let successCount = 0; let failedBranches: string[] = []; let createdClient = null;
		console.log(`[QUOTES SAVE BROADCAST] Creando cliente en ${targetBranches.length} sedes...`);
		for (const branch of targetBranches) {
			if (!branch.agent_url) { failedBranches.push(`${branch.name || branch.id}: Sin URL de Agente`); continue; }
			try {
				let verifiedCoSucu = '';
				if (Array.isArray(branch.profit_branch_codes) && branch.profit_branch_codes.length > 0) {
					const def = branch.profit_branch_codes.find((c: any) => c.is_default);
					verifiedCoSucu = def ? def.code : branch.profit_branch_codes[0].code;
				}
				const agent = new AgentClient({ slug: branch.id, agent_url: branch.agent_url, agent_api_key: branch.agent_token }, profile, fetch);
				const response = await agent.saveCustomer(payload, true, verifiedCoSucu || branch.id);
				if (response.success) { successCount++; if (!createdClient) createdClient = response.data || payload; }
				else failedBranches.push(`${branch.name}: ${response.message}`);
			} catch (err: any) { failedBranches.push(`${branch.name}: ${err.message}`); }
		}
		if (successCount > 0) {
			try {
				await logAction({
					uid:        profile.id ?? null,
					user_email: profile.email ?? 'system',
					action:     'CREATE',
					module:     'CLIENTES',
					record_id:  payload.co_cli as string,
					branch_id:  targetBranches[0].id,
					old_data:   null,
					new_data:   {
						co_cli: payload.co_cli,
						cli_des: payload.cli_des || payload.descripcion,
						broadcast: true,
						success_count: successCount,
						failures: failedBranches,
						source: 'quotes_module'
					},
					source: 'cloud'
				});
			} catch (auditErr) {
				console.error('[AUDIT] Error registrando auditoría de cliente:', auditErr);
			}
		}
		return successCount === 0 ? fail(500, { message: 'Error: ' + failedBranches.join(' | ') }) : { success: true, message: 'Cliente creado', client: createdClient };
	}),

	saveQuote: protectAction('sales_quotes', async ({ request, locals, fetch }) => {
		const profile = locals.profile;
		const formData = await request.formData();
		const branchId = formData.get('branch_id') as string;
		const quoteDataStr = formData.get('quote_data') as string;
		if (!quoteDataStr) return fail(400, { message: 'Faltan datos' });
		const branch = profile.allowed_branches?.find(b => b.id === branchId);
		if (!branch) return fail(404, { message: 'Sucursal no encontrada' });
		const agentClient = new AgentClient(branch, profile, fetch);
		try {
			const quoteData = JSON.parse(quoteDataStr);
			const isEdit = !!quoteData?.doc_num;
			if (isEdit && !hasPermission(profile, 'sales_quotes', 'update')) return fail(403, { message: 'Sin permiso update' });
			if (!isEdit && !hasPermission(profile, 'sales_quotes', 'create')) return fail(403, { message: 'Sin permiso create' });
			const enrichedQuoteData = { ...quoteData, co_ven: profile.profit_user, co_cta_ingr_egr: "", isUSD: quoteData.showUSD };
			const res: any = await agentClient.request('/cotizaciones', { method: 'POST', body: JSON.stringify(enrichedQuoteData) });
			if (res.success || (res.results && res.results[0]?.success)) {
				// Extraer el doc_num desde cualquiera de las posibles respuestas del Agente
				const finalDocNum = res.doc_num || res.data?.doc_num || res.results?.[0]?.doc_num || res.results?.[0]?.data?.doc_num || quoteData.doc_num;
				
				// Calcular el total_neto desde los renglones (ya que no se envía desde la web por seguridad)
				let calculatedTotal = 0;
				if (quoteData.renglones && Array.isArray(quoteData.renglones)) {
					calculatedTotal = quoteData.renglones.reduce((sum: number, r: any) => {
						const qty = Number(r.cantidad || 0);
						const price = Number(r.precio || 0);
						const taxRate = Number(r.porc_imp || 0) / 100;
						return sum + (qty * price * (1 + taxRate));
					}, 0);
				}

				try {
					await logAction({
						uid:        profile.id ?? null,
						user_email: profile.email ?? 'system',
						action:     isEdit ? 'UPDATE' : 'CREATE',
						module:     'COTIZACIONES',
						record_id:  String(finalDocNum),
						branch_id:  branchId,
						old_data:   isEdit ? { doc_num: quoteData.doc_num } : null,
						new_data:   { 
							doc_num: String(finalDocNum),
							co_cli: enrichedQuoteData.co_cli,
							total: calculatedTotal, 
							items: quoteData.renglones?.length,
							isUSD: enrichedQuoteData.isUSD 
						},
						source: 'cloud'
					});
				} catch (auditErr) {
					console.error('[AUDIT] Error registrando auditoría de cotización:', auditErr);
				}
				return { success: true, message: 'Cotización guardada' };
			}
			return fail(400, { message: res.message || 'Error en Profit' });
		} catch (e: any) { return fail(500, { message: e.message }); }
	})
};
