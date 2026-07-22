import type { PageServerLoad, Actions } from './$types';
import { protectLoad, protectAction } from '$lib/server/permissions';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient, agentFetch } from '$lib/server/agent';
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

	return {
		title: 'Nuevo Traslado entre Sedes',
		branches: dbBranches || [],
		userBranchId: profile?.branch_id,
		context: {
			lineas,
			categorias
		}
	};
});

export const actions: Actions = {
	default: protectAction('inv_transfers', async ({ request, fetch, locals }) => {
		const profile = (locals as any).profile;

		try {
			const formData = await request.formData();
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

			// 1. Invocar al Agente Profit de la Sede Origen para crear saAjuste (SALIDA)
			const agentRenglones = items.map((it: any) => ({
				co_art: it.co_art,
				co_alma: it.co_alma_source || '01',
				total_art: Number(it.total_art),
				cost_unit: Number(it.costo_unit || 0)
			}));

			const agentPayload = {
				branch_id: source_branch_id,
				tipo: 'SAL',
				co_tipo: '02',
				motivo,
				co_us_in: (profile.email || 'PROFIT').split('@')[0].substring(0, 6),
				renglones: agentRenglones
			};

			const agentRes = await agentFetch(fetch, '/api/v1/ajustes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(agentPayload)
			}, source_branch_id);

			const resJson = await agentRes.json();

			if (!agentRes.ok || !resJson.success) {
				console.error('[TRANSFERS NEW] Error en Agente Origen:', resJson);
				return fail(400, { error: resJson.message || 'Error al generar el Ajuste de Salida en la Sede Origen.' });
			}

			const sourceAjueNum = resJson.ajue_num;

			// 2. Generar número de traslado correlativo
			const now = new Date();
			const dateCode = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
			const randomSuffix = Math.floor(1000 + Math.random() * 9000);
			const transferNumber = `TR-${dateCode}-${randomSuffix}`;

			// 3. Insertar encabezado en Supabase / PG
			const { data: transferRecord, error: insertErr } = await supabaseAdmin
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
				costo_unit: Number(it.costo_unit || 0)
			}));

			const { error: itemsErr } = await supabaseAdmin
				.from('stock_transfer_items')
				.insert(dbItems);

			if (itemsErr) {
				console.error('[TRANSFERS NEW] Error guardando renglones en BD:', itemsErr);
			}

			console.log(`✅ [TRANSFERS NEW SUCCESS] Traslado ${transferNumber} creado con éxito. Ajuste Salida: ${sourceAjueNum}`);

		} catch (e: any) {
			console.error('[TRANSFERS NEW CRITICAL ERROR]:', e);
			return fail(500, { error: e.message || 'Error procesando el formulario.' });
		}

		throw redirect(303, '/dashboard/warehouse/transfers');
	}, 'create')
};
