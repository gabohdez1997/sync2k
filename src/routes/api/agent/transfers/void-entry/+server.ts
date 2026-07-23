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

		// 1. Cargar datos del traslado desde Supabase
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

		if (transfer.status !== 'ACEPTADO') {
			return json({ success: false, message: 'El traslado no se encuentra en estado ACEPTADO.' }, { status: 400 });
		}

		if (!transfer.target_ajue_num) {
			return json({ success: false, message: 'El traslado no posee un número de ajuste de entrada asociado en la sede destino.' }, { status: 400 });
		}

		// 2. Obtener la sucursal de destino desde Supabase
		const { data: targetBranch, error: branchErr } = await supabaseAdmin
			.from('branches')
			.select('*')
			.eq('id', transfer.target_branch_id)
			.single();

		if (branchErr || !targetBranch || !targetBranch.agent_url) {
			return json({ success: false, message: 'Sucursal de destino no encontrada o no configurada con agente.' }, { status: 404 });
		}

		const userProfitCode = (profile.profit_user || '').trim().toUpperCase() || (profile.email || 'PROFIT').split('@')[0].toUpperCase().substring(0, 6);

		// 3. Invocar al agente de la Sede Destino para anular el Ajuste de Entrada (POST /ajustes/:ajue_num/anular)
		const agentClient = new AgentClient({
			slug: targetBranch.id,
			agent_url: targetBranch.agent_url,
			agent_api_key: targetBranch.agent_token
		}, profile, fetch);

		const agentRes = await agentClient.request<any>(`/ajustes/${encodeURIComponent(transfer.target_ajue_num)}/anular`, {
			method: 'POST',
			body: JSON.stringify({
				branch_id: transfer.target_branch_id,
				profit_user: userProfitCode,
				co_us_in: userProfitCode
			})
		});

		if (!agentRes || !agentRes.success) {
			console.error('[VOID ENTRY TRANSFER] Error anulando ajuste en Agente Destino:', agentRes);
			return json({
				success: false,
				message: agentRes?.message || 'Error al anular el Ajuste de Entrada en la Sede Destino.'
			}, { status: 400 });
		}

		// 4. Actualizar el traslado en Supabase para colocarlo como PENDIENTE (TRANSITO)
		const { error: updateErr } = await supabaseAdmin
			.from('stock_transfers')
			.update({
				status: 'TRANSITO',
				target_ajue_num: null,
				accepted_by: null,
				accepted_at: null,
				updated_at: new Date().toISOString()
			})
			.eq('id', transfer_id);

		if (updateErr) {
			console.error('[VOID ENTRY TRANSFER] Error actualizando estado en Supabase:', updateErr);
			return json({ success: false, message: 'Ajuste anulado en destino pero falló la actualización del estado en la nube.' }, { status: 500 });
		}

		// 5. Registrar en auditoría
		try {
			const { logAction } = await import('$lib/server/audit');
			await logAction({
				uid: profile.id || null,
				user_email: profile.email,
				action: 'VOID_ENTRY',
				module: 'inv_transfers',
				record_id: transfer.id,
				new_data: {
					transfer_number: transfer.transfer_number,
					voided_target_ajue_num: transfer.target_ajue_num,
					status: 'TRANSITO'
				},
				branch_id: transfer.target_branch_id
			});
		} catch (auditErr) {
			console.error('[AUDIT] Error guardando auditoria de anulación de ingreso:', auditErr);
		}

		console.log(`✅ [VOID ENTRY SUCCESS] Ingreso de traslado ${transfer.transfer_number} anulado con éxito. Ajuste Destino ${transfer.target_ajue_num} revertido.`);

		return json({
			success: true,
			message: `Ingreso del traslado ${transfer.transfer_number} anulado con éxito en la Sede Destino. El traslado vuelve a estar PENDIENTE.`
		});

	} catch (e: any) {
		console.error('[VOID ENTRY TRANSFER CRITICAL ERROR]:', e);
		return json({ success: false, message: e.message || 'Error interno al procesar la anulación del ingreso.' }, { status: 500 });
	}
};
