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
				console.error('[VOID ENTRY TRANSFER] Error al verificar bcrypt:', e);
			}
		}

		if (!isPasswordValid) {
			return json({ success: false, message: 'Contraseña de confirmación incorrecta.' }, { status: 400 });
		}

		// 1. Cargar datos del traslado
		const { data: transfer, error: fetchErr } = await supabaseAdmin
			.from('stock_transfers')
			.select('*')
			.eq('id', transfer_id)
			.single();

		if (fetchErr || !transfer) {
			return json({ success: false, message: 'Traslado no encontrado.' }, { status: 404 });
		}

		if (transfer.status !== 'ACEPTADO') {
			return json({ success: false, message: 'Solo se pueden anular ingresos de traslados en estado ACEPTADO.' }, { status: 400 });
		}

		if (!transfer.target_ajue_num) {
			return json({ success: false, message: 'El traslado no tiene un correlativo de ajuste de entrada asociado.' }, { status: 400 });
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

		const userProfitCode = (profile.profit_user || '').trim().toUpperCase() || (profile.email || 'PROFIT').split('@')[0].toUpperCase().substring(0, 6);

		// 3. Invocar al Agente de la Sede Destino para anular saAjuste
		const agentClient = new AgentClient({
			slug: targetBranch.id,
			agent_url: targetBranch.agent_url,
			agent_api_key: targetBranch.agent_token
		}, profile, fetch);

		const resJson: any = await agentClient.request(`/ajustes/${encodeURIComponent(transfer.target_ajue_num)}/anular`, {
			method: 'POST',
			body: JSON.stringify({
				branch_id: transfer.target_branch_id,
				profit_user: userProfitCode
			})
		});

		if (!resJson.success) {
			console.error('[VOID ENTRY TRANSFER] Error en Agente Destino:', resJson);
			return json({
				success: false,
				message: resJson.message || 'Error al anular el Ajuste de Entrada en la Sede Destino.'
			}, { status: 400 });
		}

		// 4. Revertir estado del traslado en Supabase Cloud a 'TRANSITO' y limpiar target_ajue_num
		const nowStr = new Date().toISOString();
		const { error: updateErr } = await supabaseAdmin
			.from('stock_transfers')
			.update({
				target_ajue_num: null,
				status: 'TRANSITO',
				accepted_by: null,
				accepted_at: null,
				updated_at: nowStr
			})
			.eq('id', transfer_id);

		if (updateErr) {
			console.error('[VOID ENTRY TRANSFER] Error actualizando BD:', updateErr);
			return json({ success: false, message: 'Error al actualizar el estado del traslado en el servidor.' }, { status: 500 });
		}

		// 5. Registrar en Auditoría
		try {
			const { logAction } = await import('$lib/server/audit');
			await logAction({
				uid: profile.id || null,
				user_email: profile.email,
				action: 'UPDATE',
				module: 'inv_transfers',
				record_id: transfer_id,
				old_data: { status: 'ACEPTADO', target_ajue_num: transfer.target_ajue_num },
				new_data: { status: 'TRANSITO', target_ajue_num: null },
				branch_id: transfer.target_branch_id
			});
		} catch (auditErr) {
			console.error('[AUDIT] Error al guardar auditoria de anulación de ingreso:', auditErr);
		}

		return json({
			success: true,
			message: `Ingreso del traslado ${transfer.transfer_number} anulado con éxito. El traslado vuelve a estar PENDIENTE.`
		});

	} catch (e: any) {
		console.error('[VOID ENTRY TRANSFER CRITICAL]:', e);
		return json({ success: false, message: `Error interno: ${e.message}` }, { status: 500 });
	}
};
