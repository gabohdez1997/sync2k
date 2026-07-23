import type { PageServerLoad, Actions } from './$types';
import { protectLoad, protectAction } from '$lib/server/permissions';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = protectLoad('inv_transfers', async ({ locals, fetch, url }) => {
	const profile = (locals as any).profile;

	const { data: dbBranches, error: bErr } = await supabaseAdmin
		.from('branches')
		.select('*')
		.eq('active', true)
		.order('name');

	if (bErr) {
		console.error('[TRANSFERS NEW] Error al cargar sucursales:', bErr);
	}

	const allowedBranches = profile?.allowed_branches || [];
	const selectedBranchId = url.searchParams.get('branch_id') || profile?.branch_id || allowedBranches[0]?.id || dbBranches?.[0]?.id;
	const selectedBranch = allowedBranches.find(b => b.id === selectedBranchId) || dbBranches?.find((b: any) => b.id === selectedBranchId);

	let lineas: any[] = [];
	let categorias: any[] = [];

	if (selectedBranch && selectedBranch.agent_url) {
		try {
			const agentClient = new AgentClient({
				slug: selectedBranch.id,
				agent_url: selectedBranch.agent_url,
				agent_api_key: selectedBranch.agent_token
			}, profile, fetch);

			const [lineasRes, catsRes] = await Promise.all([
				agentClient.request<any>('/catalogos/lineas').catch(() => ({ data: [] })),
				agentClient.request<any>('/catalogos/categorias').catch(() => ({ data: [] }))
			]);

			lineas = (lineasRes as any).data || (lineasRes as any).items || (Array.isArray(lineasRes) ? lineasRes : []);
			categorias = (catsRes as any).data || (catsRes as any).items || (Array.isArray(catsRes) ? catsRes : []);
		} catch (e) {
			console.error('[TRANSFERS NEW] Error al cargar catálogos del agente:', e);
		}
	}

	const profileWarehouses: string[] = profile?.allowed_warehouses || [];
	const isAdmin = profileWarehouses.length === 0 || profile?.role === 'admin' || (Array.isArray(profile?.roles) && profile.roles.includes('admin'));

	const editingId = url.searchParams.get('id');
	let editingTransfer: any = null;

	if (editingId) {
		const { data: extTransfer, error: extErr } = await supabaseAdmin
			.from('stock_transfers')
			.select(`
				*,
				items:stock_transfer_items(*)
			`)
			.eq('id', editingId)
			.single();

		if (!extErr && extTransfer) {
			if (extTransfer.status === 'TRANSITO') {
				editingTransfer = extTransfer;
			}
		}
	}

	return {
		title: editingTransfer ? `Editar Traslado ${editingTransfer.transfer_number}` : 'Nuevo Traslado entre Sedes',
		branches: dbBranches || [],
		userBranchId: profile?.branch_id,
		allowedWarehouses: profileWarehouses,
		isAdmin,
		editingTransfer,
		context: {
			lineas,
			categorias,
			allowedWarehouses: profileWarehouses,
			isAdmin
		}
	};
});

export const actions: Actions = {
	default: protectAction('inv_transfers', async ({ request, fetch, locals }) => {
		const profile = (locals as any).profile;

		try {
			const formData = await request.formData();
			const editing_id = formData.get('editing_id')?.toString();
			const source_branch_id = formData.get('source_branch_id')?.toString();
			const target_branch_id = formData.get('target_branch_id')?.toString();
			const motivo = formData.get('motivo')?.toString() || 'Traslado entre sedes';
			const itemsJson = formData.get('items')?.toString() || '[]';

			if (!source_branch_id || !target_branch_id) {
				return fail(400, { error: 'Debe seleccionar Sede Origen y Sede Destino.' });
			}

			if (source_branch_id === target_branch_id) {
				return fail(400, { error: 'La Sede Origen y la Sede Destino no pueden ser la misma.' });
			}

			const items = JSON.parse(itemsJson);
			if (!Array.isArray(items) || items.length === 0) {
				return fail(400, { error: 'Debe agregar al menos un artículo al traslado.' });
			}

			// Cargar sucursal de origen
			const { data: sourceBranch, error: branchErr } = await supabaseAdmin
				.from('branches')
				.select('*')
				.eq('id', source_branch_id)
				.single();

			if (branchErr || !sourceBranch || !sourceBranch.agent_url) {
				return fail(400, { error: 'Sede origen no encontrada o no configurada con agente.' });
			}

			let sourceSucuCode = '01';
			if (Array.isArray(sourceBranch.profit_branch_codes) && sourceBranch.profit_branch_codes.length > 0) {
				const def = sourceBranch.profit_branch_codes.find((c: any) => c && typeof c === 'object' && c.is_default);
				if (def && def.code) {
					sourceSucuCode = def.code;
				} else {
					const first = sourceBranch.profit_branch_codes[0];
					sourceSucuCode = typeof first === 'string' ? first : (first.code || '01');
				}
			} else if (typeof sourceBranch.profit_branch_codes === 'string' && sourceBranch.profit_branch_codes.trim()) {
				sourceSucuCode = sourceBranch.profit_branch_codes.trim();
			}
			const userProfitCode = (profile.profit_user || '').trim().toUpperCase() || (profile.email || 'PROFIT').split('@')[0].toUpperCase().substring(0, 6);

			const agentRenglones = items.map((it: any) => ({
				co_art: it.co_art,
				art_des: it.art_des,
				co_alma: it.co_alma_source || '01',
				total_art: Number(it.total_art),
				cost_unit: Number(it.costo_unit || 0)
			}));

			const agentPayload = {
				branch_id: source_branch_id,
				tipo: 'SAL',
				co_tipo: '02',
				motivo,
				co_sucu_in: sourceSucuCode,
				co_sucu_mo: sourceSucuCode,
				co_us_in: userProfitCode,
				co_us_mo: userProfitCode,
				renglones: agentRenglones
			};

			const agentClient = new AgentClient({
				slug: sourceBranch.id,
				agent_url: sourceBranch.agent_url,
				agent_api_key: sourceBranch.agent_token
			}, profile, fetch);

			let transferRecord: any = null;

			if (editing_id) {
				// MODO EDICIÓN
				const { data: existingTransfer } = await supabaseAdmin
					.from('stock_transfers')
					.select('*')
					.eq('id', editing_id)
					.single();

				if (!existingTransfer || existingTransfer.status !== 'TRANSITO') {
					return fail(400, { error: 'El traslado no existe o ya fue aceptado.' });
				}

				const resJson: any = await agentClient.request(`/ajustes/${encodeURIComponent(existingTransfer.source_ajue_num)}`, {
					method: 'PUT',
					body: JSON.stringify(agentPayload)
				});

				if (!resJson || !resJson.success) {
					console.error('[TRANSFERS EDIT] Error en Agente Origen:', resJson);
					return fail(400, { error: resJson?.message || 'Error al actualizar el Ajuste de Salida en la Sede Origen.' });
				}

				// Actualizar encabezado en Supabase
				const { data: updatedRec, error: upErr } = await supabaseAdmin
					.from('stock_transfers')
					.update({
						source_branch_id,
						target_branch_id,
						motivo,
						updated_at: new Date().toISOString()
					})
					.eq('id', editing_id)
					.select()
					.single();

				if (upErr || !updatedRec) {
					return fail(500, { error: 'Error al actualizar el traslado en la base de datos.' });
				}

				transferRecord = updatedRec;

				// Eliminar renglones anteriores e insertar los nuevos
				await supabaseAdmin.from('stock_transfer_items').delete().eq('transfer_id', editing_id);

			} else {
				// MODO CREACIÓN
				const resJson: any = await agentClient.request('/ajustes', {
					method: 'POST',
					body: JSON.stringify(agentPayload)
				});

				if (!resJson || !resJson.success) {
					console.error('[TRANSFERS NEW] Error en Agente Origen:', resJson);
					return fail(400, { error: resJson?.message || 'Error al generar el Ajuste de Salida en la Sede Origen.' });
				}

				const sourceAjueNum = resJson.ajue_num || resJson.data?.ajue_num;

				const now = new Date();
				const dateCode = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
				const randomSuffix = Math.floor(1000 + Math.random() * 9000);
				const transferNumber = `TR-${dateCode}-${randomSuffix}`;

				const { data: insertedRec, error: insertErr } = await supabaseAdmin
					.from('stock_transfers')
					.insert({
						transfer_number: transferNumber,
						source_branch_id,
						target_branch_id,
						source_ajue_num: sourceAjueNum,
						status: 'TRANSITO',
						motivo,
						created_by: profile.email
					})
					.select()
					.single();

				if (insertErr || !insertedRec) {
					console.error('[TRANSFERS NEW] Error guardando encabezado en BD:', insertErr);
					return fail(500, { error: 'Error interno al registrar el traslado en la base de datos.' });
				}

				transferRecord = insertedRec;
			}

			if (insertErr || !transferRecord) {
				console.error('[TRANSFERS NEW] Error guardando encabezado en BD:', insertErr);
				return fail(500, { error: 'Error interno al registrar el traslado en la base de datos.' });
			}

			// 4. Insertar renglones en stock_transfer_items
			const dbItems = items.map((it: any) => ({
				transfer_id: transferRecord.id,
				co_art: it.co_art,
				art_des: it.art_des,
				co_alma_source: it.co_alma_source || '01',
				co_alma_target: it.co_alma_target || '01',
				total_art: Number(it.total_art),
				accepted_art: 0,
				costo_unit: Number(it.costo_unit || 0),
				co_uni: it.co_uni || 'UND'
			}));

			const { error: itemsErr } = await supabaseAdmin
				.from('stock_transfer_items')
				.insert(dbItems);

			if (itemsErr) {
				console.error('[TRANSFERS NEW] Error guardando renglones en BD:', itemsErr);
			}

			// 5. Registrar en Auditoría
			try {
				const { logAction } = await import('$lib/server/audit');
				await logAction({
					uid: profile.id || null,
					user_email: profile.email,
					action: 'CREATE',
					module: 'inv_transfers',
					record_id: transferRecord.id,
					new_data: {
						transfer_number: transferNumber,
						source_branch_id,
						target_branch_id,
						source_ajue_num: sourceAjueNum,
						items_count: items.length
					},
					branch_id: source_branch_id
				});
			} catch (auditErr) {
				console.error('[AUDIT] Error al guardar auditoria de traslado:', auditErr);
			}

			console.log(`✅ [TRANSFERS NEW SUCCESS] Traslado ${transferNumber} creado con éxito. Ajuste Salida: ${sourceAjueNum}`);

		} catch (e: any) {
			console.error('[TRANSFERS NEW CRITICAL ERROR]:', e);
			return fail(500, { error: e.message || 'Error procesando el formulario.' });
		}

		throw redirect(303, '/dashboard/warehouse/transfers');
	}, 'create')
};
