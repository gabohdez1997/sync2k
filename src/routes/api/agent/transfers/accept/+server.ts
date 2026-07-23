import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';

export const POST: RequestHandler = async ({ request, fetch, locals }) => {
	const user = locals.user || (locals as any).session?.user;
	const profile = locals.profile;
	const supabase = (locals as any).supabase;

	if (!profile) {
		return json({ success: false, message: 'No se encontró sesión o perfil activo.' }, { status: 401 });
	}

	try {
		const { transfer_id, password } = await request.json();
		if (!transfer_id) {
			return json({ success: false, message: 'transfer_id es requerido' }, { status: 400 });
		}

		if (!password) {
			return json({ success: false, message: 'Debe ingresar su contraseña de confirmación.' }, { status: 400 });
		}

		// Validar contraseña del usuario activo
		const email = user?.email || profile?.email;
		let isPasswordValid = false;

		if (email && supabase?.auth) {
			const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
			if (!authErr) {
				isPasswordValid = true;
			}
		}

		if (!isPasswordValid && profile?.password_hash) {
			try {
				const bcrypt = (await import('bcryptjs')).default;
				isPasswordValid = await bcrypt.compare(password, profile.password_hash);
			} catch (e) {
				console.error('[ACCEPT TRANSFER] Error al verificar bcrypt:', e);
			}
		}

		if (!isPasswordValid) {
			return json({ success: false, message: 'Contraseña de confirmación incorrecta.' }, { status: 400 });
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

		const targetSucuCode = (Array.isArray(targetBranch.profit_branch_codes) ? targetBranch.profit_branch_codes[0] : targetBranch.profit_branch_codes) || '01';
		const userProfitCode = (profile.profit_user || '').trim().toUpperCase() || (profile.email || 'PROFIT').split('@')[0].toUpperCase().substring(0, 6);

		// 3. Preparar renglones para Ajuste de ENTRADA ('01') en la Sede Destino
		const renglones = transfer.items.map((it: any) => ({
			co_art: it.co_art,
			art_des: it.art_des,
			co_alma: it.co_alma_target || '01',
			total_art: Number(it.total_art),
			cost_unit: Number(it.costo_unit || 0)
		}));

		const agentPayload = {
			branch_id: transfer.target_branch_id,
			tipo: 'ENT',
			co_tipo: '01',
			motivo: `Ingreso Traslado Nro ${transfer.transfer_number} desde Sede Origen`,
			co_sucu_in: targetSucuCode,
			co_sucu_mo: targetSucuCode,
			co_us_in: userProfitCode,
			co_us_mo: userProfitCode,
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
			}, { status: 400 });
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

		// 6. Registrar en Auditoría
		try {
			const { logAction } = await import('$lib/server/audit');
			await logAction({
				uid: profile.id || null,
				user_email: profile.email,
				action: 'UPDATE',
				module: 'inv_transfers',
				record_id: transfer_id,
				old_data: { status: 'TRANSITO' },
				new_data: { status: 'ACEPTADO', target_ajue_num: targetAjueNum },
				branch_id: transfer.target_branch_id
			});
		} catch (auditErr) {
			console.error('[AUDIT] Error al guardar auditoria de aceptacion:', auditErr);
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
