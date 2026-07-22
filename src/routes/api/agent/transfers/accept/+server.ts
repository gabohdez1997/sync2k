import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';

export const POST: RequestHandler = async ({ request, fetch, locals }) => {
	const user = locals.user;
	const profile = locals.profile;
	if (!user || !profile) {
		return json({ success: false, message: 'No autorizado' }, { status: 401 });
	}

	try {
		const { transfer_id } = await request.json();
		if (!transfer_id) {
			return json({ success: false, message: 'transfer_id es requerido' }, { status: 400 });
		}

		// 1. Cargar datos del traslado
		const { data: transfer, error: fetchErr } = await supabaseAdmin
			.from('stock_transfers')
			.select(`
				*,
				items:stock_transfer_items(*)
			`)
			.eq('id', transfer_id)
			.single();

		if (fetchErr || !transfer) {
			return json({ success: false, message: 'Traslado no encontrado.' }, { status: 404 });
		}

		if (transfer.status === 'ACEPTADO') {
			return json({ success: false, message: 'El traslado ya fue aceptado anteriormente.' }, { status: 400 });
		}

		if (!transfer.items || transfer.items.length === 0) {
			return json({ success: false, message: 'El traslado no contiene renglones de artículos.' }, { status: 400 });
		}

		// 2. Obtener la sucursal de destino desde Supabase
		const { data: targetBranch, error: branchErr } = await supabaseAdmin
			.from('branches')
			.select('*')
			.eq('id', transfer.target_branch_id)
			.single();

		if (branchErr || !targetBranch || !targetBranch.agent_url) {
			return json({ success: false, message: 'Sucursal de destino no encontrada o no configurada.' }, { status: 404 });
		}

		// 3. Preparar renglones para Ajuste de ENTRADA ('01') en la Sede Destino
		const renglones = transfer.items.map((it: any) => ({
			co_art: it.co_art,
			co_alma: it.co_alma_target || '01',
			total_art: Number(it.total_art),
			cost_unit: Number(it.costo_unit || 0)
		}));

		const agentPayload = {
			branch_id: transfer.target_branch_id,
			tipo: 'ENT',
			co_tipo: '01',
			motivo: `Ingreso Traslado Nro ${transfer.transfer_number} desde Sede Origen`,
			co_us_in: (profile.email || 'PROFIT').split('@')[0].substring(0, 6),
			renglones
		};

		// 4. Invocar al Agente de la Sede Destino
		const agentClient = new AgentClient({
			slug: targetBranch.id,
			agent_url: targetBranch.agent_url,
			agent_api_key: targetBranch.agent_token
		}, profile, fetch);

		const resJson: any = await agentClient.request('/ajustes', {
			method: 'POST',
			body: JSON.stringify(agentPayload)
		});

		if (!resJson.success) {
			console.error('[TRANSFERS ACCEPT] Error en Agente Destino:', resJson);
			return json({
				success: false,
				message: resJson.message || 'Error al generar el Ajuste de Entrada en la Sede Destino.'
			}, { status: 500 });
		}

		const targetAjueNum = resJson.ajue_num || resJson.data?.ajue_num;

		// 5. Actualizar estado del traslado en Supabase
		const nowStr = new Date().toISOString();
		const { error: updateErr } = await supabaseAdmin
			.from('stock_transfers')
			.update({
				target_ajue_num: targetAjueNum,
				status: 'ACEPTADO',
				accepted_by: profile.email,
				accepted_at: nowStr,
				updated_at: nowStr
			})
			.eq('id', transfer_id);

		if (updateErr) {
			console.error('[TRANSFERS ACCEPT] Error actualizando BD:', updateErr);
		}

		return json({
			success: true,
			message: `Traslado ${transfer.transfer_number} aceptado con éxito. Ajuste de Entrada: ${targetAjueNum}`,
			target_ajue_num: targetAjueNum
		});

	} catch (e: any) {
		console.error('[TRANSFERS ACCEPT CRITICAL ERROR]:', e);
		return json({ success: false, message: e.message || 'Error interno del servidor.' }, { status: 500 });
	}
};
