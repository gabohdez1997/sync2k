import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { logAction } from '$lib/server/audit';
import { supabaseAdmin } from '$lib/server/supabase';
import { redirect, fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_orders', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw new Error('Perfil no cargado.');

	const docNumInUrl = url.searchParams.get('doc_num');
	const canCreate = hasPermission(profile, 'pur_orders', 'create');
	const canUpdate = hasPermission(profile, 'pur_orders', 'update');
	const canAccess = docNumInUrl ? canUpdate : canCreate;
	if (!canAccess) {
		throw redirect(303, '/dashboard/purchases/orders/history');
	}

	try {
		// 1. Obtener todas las sucursales de Supabase
		let allBranches: any[] = [];
		const { data: dbBranches, error } = await supabaseAdmin
			.from('branches')
			.select('id, name, agent_url, agent_token, profit_branch_codes, active, sort_order')
			.eq('active', true)
			.order('sort_order')
			.order('name');

		if (error) {
			console.error('[PUR_ORDERS] Supabase branches error:', error.message);
		} else if (dbBranches) {
			allBranches = dbBranches.map(b => {
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
					profit_branch_code: defaultCode,
					profit_branch_codes: b.profit_branch_codes,
					is_default: isDefault
				};
			});
		}

		// Filtrar sucursales según permisos del perfil
		const profileAllowed = profile?.allowed_branches || [];
		const profileBranchIds: string[] = Array.isArray(profileAllowed) 
			? profileAllowed.map((b: any) => (typeof b === 'object' ? b.id : b))
			: [];
			
		const isAdmin = profileBranchIds.length === 0;

		const allowedBranches = isAdmin
			? allBranches
			: allBranches.filter(b => profileBranchIds.includes(b.id));

		if (allowedBranches.length === 0) return { articles: [], branches: [], error: 'No tienes sucursales asignadas.' };

		const urlBranchId = url.searchParams.get('branch_id');
		const defaultBranch = allowedBranches.find(b => b.is_default);
		const selectedBranch = urlBranchId 
			? allowedBranches.find(b => b.id === urlBranchId) 
			: (defaultBranch || allowedBranches[0]);

		if (!selectedBranch || !selectedBranch.agent_url) return { articles: [], branches: allowedBranches, error: 'Sucursal no configurada.' };

		const agentClient = new AgentClient({
			slug: selectedBranch.id, agent_url: selectedBranch.agent_url, agent_api_key: selectedBranch.agent_token
		}, profile, fetch);

		let warehouseList: any[] = [];
		let lineas: any[] = [];
		let categorias: any[] = [];
		let zonas: any[] = [];
		let tiposProveedor: any[] = [];
		let condicionesPago: any[] = [];
		let segmentos: any[] = [];

		try {
			const [almaRes, lineasRes, catsRes, zonRes, tpRes, condRes, segRes] = await Promise.all([
				agentClient.request<any>('/catalogos/almacenes').catch(() => null),
				agentClient.request<any>('/catalogos/lineas').catch(() => null),
				agentClient.request<any>('/catalogos/categorias').catch(() => null),
				agentClient.getZonas().catch(() => null),
				agentClient.getTiposProveedor().catch(() => null),
				agentClient.getCondicionesPago().catch(() => null),
				agentClient.request<any>('/catalogos/segmentos').catch(() => null)
			]);
			warehouseList = (almaRes as any)?.data || (almaRes as any)?.items || (Array.isArray(almaRes) ? almaRes : []);
			lineas = (lineasRes as any)?.data || (lineasRes as any)?.items || (Array.isArray(lineasRes) ? lineasRes : []);
			categorias = (catsRes as any)?.data || (catsRes as any)?.items || (Array.isArray(catsRes) ? catsRes : []);
			zonas = (zonRes as any)?.data || (zonRes as any)?.items || (Array.isArray(zonRes) ? zonRes : []);
			tiposProveedor = (tpRes as any)?.data || (tpRes as any)?.items || (Array.isArray(tpRes) ? tpRes : []);
			condicionesPago = (condRes as any)?.data || (condRes as any)?.items || (Array.isArray(condRes) ? condRes : []);
			segmentos = (segRes as any)?.data || (segRes as any)?.items || (Array.isArray(segRes) ? segRes : []);
		} catch (e) { console.error('[PUR_ORDERS] Catalog fetch error:', e); }

		const profileWarehouses: string[] = profile.allowed_warehouses || [];
		const branchWarehouseList = warehouseList.filter((a: any) => {
			const co_sucu = a.co_sucu || a.co_sucur || a.sede_id || a.co_sede;
			if (!co_sucu) return true;
			if (co_sucu === selectedBranch.id) return true;
			if (Array.isArray(selectedBranch.profit_branch_codes)) {
				return selectedBranch.profit_branch_codes.some((c: any) => (typeof c === 'string' ? c : c.code) === co_sucu);
			}
			return true;
		});

		const allowedWarehousesForBranch = isAdmin ? branchWarehouseList : branchWarehouseList.filter((a: any) => {
			const almaId = a.co_alma || a.id || a.warehouse_id;
			return profileWarehouses.includes(almaId);
		});

		const finalWarehouseIds = allowedWarehousesForBranch.map((a: any) => a.co_alma || a.id || a.warehouse_id).filter(Boolean);
		const doc_num = url.searchParams.get('doc_num');
		let preloadedOrder = null;
		if (doc_num) {
			try {
				const oRes = await agentClient.getPurchaseOrder(doc_num);
				if (oRes.success && oRes.data) {
					const o = Array.isArray(oRes.data) ? oRes.data[0] : oRes.data;
					if (!o?.anulado && String(o?.status ?? '').trim() === '0') preloadedOrder = o;
				}
			} catch (e) { console.error('[PUR_ORDERS] Error loading order for edit:', e); }
		}

		return {
			articles: [], pagination: { total: 0, page: 1, limit: 12, totalPages: 0 },
			branches: allowedBranches, selectedBranchId: selectedBranch.id, preloadedOrder,
			context: {
				branchId: selectedBranch.id,
				warehouseId: '',
				finalWarehouseIds,
				lineas,
				categorias,
				zonas,
				tiposProveedor,
				condicionesPago,
				segmentos,
				warehouses: allowedWarehousesForBranch
			}
		};
	} catch (err: any) {
		return { articles: [], pagination: { total: 0, page: 1, limit: 12, totalPages: 1 }, error: 'Error: ' + err.message, context: { branches: [] } };
	}
});

export const actions: Actions = {
	searchSupplier: protectAction('pur_orders', async ({ request, locals, fetch }) => {
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
				const res = await agentClient.request<any>(`/proveedores/${searchTerm}?sede=${branch.id}`);
				if (res.success && res.data) {
					const supplierData = Array.isArray(res.data) ? res.data.find(c => !c.error) : res.data;
					if (supplierData) return { success: true, supplier: supplierData, suppliers: [supplierData] };
				}
				const searchRes = await agentClient.request<any>(`/proveedores/search?rif=${encodeURIComponent(searchTerm)}&sede=${branch.id}`);
				const items = Array.isArray(searchRes.data) ? searchRes.data : (searchRes.data?.items || searchRes.items || []);
				if (items.length === 1) return { success: true, supplier: items[0], suppliers: items };
				if (items.length > 1) return { success: true, supplier: null, suppliers: items };
				return { success: true, supplier: null, suppliers: [], message: 'Proveedor no encontrado.' };
			} else {
				const searchRes = await agentClient.request<any>(`/proveedores/search?q=${encodeURIComponent(searchTerm)}&sede=${branch.id}`);
				const items = Array.isArray(searchRes.data) ? searchRes.data : (searchRes.data?.items || searchRes.items || []);
				if (items.length === 1) return { success: true, supplier: items[0], suppliers: items };
				if (items.length > 1) return { success: true, supplier: null, suppliers: items };
				return { success: true, supplier: null, suppliers: [], message: 'Proveedor no encontrado.' };
			}
		} catch (e: any) {
			if (e.status === 404) return { success: true, supplier: null, suppliers: [] };
			return fail(500, { message: 'Error: ' + e.message });
		}
	}),

	saveSupplier: protectAction('pur_orders', async ({ request, locals, fetch }) => {
		const profile = locals.profile;
		const formData = await request.formData();
		const payload = { 
			...Object.fromEntries(formData), 
			contribu_e: formData.has('contribu_e') || formData.has('contribuu_e'), 
			porc_esp: parseFloat(formData.get('porc_esp') as string) || 0 
		};

		// Broadcast: crear proveedor en todas las sedes autorizadas
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

		let successCount = 0; let failedBranches: string[] = []; let createdSupplier = null;
		console.log(`[PUR_ORDERS SAVE SUPPLIER BROADCAST] Creando proveedor en ${targetBranches.length} sedes...`);
		for (const branch of targetBranches) {
			if (!branch.agent_url) { failedBranches.push(`${branch.name || branch.id}: Sin URL de Agente`); continue; }
			try {
				let verifiedCoSucu = '';
				if (Array.isArray(branch.profit_branch_codes) && branch.profit_branch_codes.length > 0) {
					const def = branch.profit_branch_codes.find((c: any) => c.is_default);
					verifiedCoSucu = def ? def.code : branch.profit_branch_codes[0].code;
				}
				const agent = new AgentClient({ slug: branch.id, agent_url: branch.agent_url, agent_api_key: branch.agent_token }, profile, fetch);
				const response = await agent.saveSupplier(payload, true, verifiedCoSucu || branch.id);
				if (response.success) { successCount++; if (!createdSupplier) createdSupplier = response.data || payload; }
				else failedBranches.push(`${branch.name}: ${response.message}`);
			} catch (err: any) { failedBranches.push(`${branch.name}: ${err.message}`); }
		}
		if (successCount > 0) {
			try {
				await logAction({
					uid:        profile.id ?? null,
					user_email: profile.email ?? 'system',
					action:     'CREATE',
					module:     'PROVEEDORES',
					record_id:  (payload.co_prov || payload.rif) as string,
					branch_id:  targetBranches[0].id,
					old_data:   null,
					new_data:   {
						co_prov: payload.co_prov || payload.rif,
						prov_des: payload.prov_des || payload.descripcion,
						broadcast: true,
						success_count: successCount,
						failures: failedBranches,
						source: 'purchase_orders_module'
					},
					source: 'cloud'
				});
			} catch (auditErr) {
				console.error('[AUDIT] Error registrando auditoría de proveedor:', auditErr);
			}
		}
		return successCount === 0 ? fail(500, { message: 'Error: ' + failedBranches.join(' | ') }) : { success: true, message: 'Proveedor creado', supplier: createdSupplier };
	}),

	saveOrder: protectAction('pur_orders', async ({ request, locals, fetch }) => {
		const profile = locals.profile;
		const formData = await request.formData();
		const branchId = formData.get('branch_id') as string;
		const orderDataStr = formData.get('order_data') as string;
		if (!orderDataStr) return fail(400, { message: 'Faltan datos de la orden' });
		const branch = profile.allowed_branches?.find(b => b.id === branchId);
		if (!branch) return fail(404, { message: 'Sucursal no encontrada' });
		const agentClient = new AgentClient(branch, profile, fetch);
		try {
			const orderData = JSON.parse(orderDataStr);
			const isEdit = !!orderData?.doc_num;
			if (isEdit && !hasPermission(profile, 'pur_orders', 'update')) return fail(403, { message: 'Sin permiso para actualizar órdenes de compra' });
			if (!isEdit && !hasPermission(profile, 'pur_orders', 'create')) return fail(403, { message: 'Sin permiso para crear órdenes de compra' });
			
			const enrichedOrderData = { 
				...orderData, 
				co_cta_ingr_egr: "02", 
				isUSD: orderData.showUSD 
			};
			
			const res: any = await agentClient.savePurchaseOrder(enrichedOrderData, branchId);
			if (res.success || (res.results && res.results[0]?.success)) {
				const finalDocNum = res.doc_num || res.data?.doc_num || res.results?.[0]?.doc_num || res.results?.[0]?.data?.doc_num || orderData.doc_num;
				
				let calculatedTotal = 0;
				if (orderData.renglones && Array.isArray(orderData.renglones)) {
					calculatedTotal = orderData.renglones.reduce((sum: number, r: any) => {
						const qty = Number(r.cantidad || 0);
						const price = Number(r.precio || r.cost_unit || 0);
						const taxRate = Number(r.porc_imp || 0) / 100;
						return sum + (qty * price * (1 + taxRate));
					}, 0);
				}

				try {
					await logAction({
						uid:        profile.id ?? null,
						user_email: profile.email ?? 'system',
						action:     isEdit ? 'UPDATE' : 'CREATE',
						module:     'ORDENES_COMPRA',
						record_id:  String(finalDocNum),
						branch_id:  branchId,
						old_data:   isEdit ? { doc_num: orderData.doc_num } : null,
						new_data:   { 
							doc_num: String(finalDocNum),
							co_prov: enrichedOrderData.co_prov,
							total: calculatedTotal, 
							items: orderData.renglones?.length,
							isUSD: enrichedOrderData.isUSD 
						},
						source: 'cloud'
					});
				} catch (auditErr) {
					console.error('[AUDIT] Error registrando auditoría de orden de compra:', auditErr);
				}
				return { success: true, message: 'Orden de compra guardada', doc_num: finalDocNum };
			}
			return fail(400, { message: res.message || 'Error en Profit' });
		} catch (e: any) { return fail(500, { message: e.message }); }
	})
};
