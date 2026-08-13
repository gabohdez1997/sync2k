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
				console.error('[VOID TRANSFER] Error al verificar bcrypt:', e);
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
				source_branch:branches!stock_transfers_source_branch_id_fkey(id, name, agent_url, agent_token),
				target_branch:branches!stock_transfers_target_branch_id_fkey(id, name, agent_url, agent_token),
				items:stock_transfer_items(*)
			`)
			.eq('id', transfer_id)
			.single();

		if (fetchErr || !transfer) {
			return json({ success: false, message: 'Traslado no encontrado.' }, { status: 404 });
		}

		// Validación de seguridad: No se puede anular si ya fue confirmado / ingresado en destino
		if (transfer.status === 'ACEPTADO' || transfer.target_ajue_num) {
			return json({
				success: false,
				message: 'No se puede anular el traslado porque ya fue ingresado en la sede destino. Primero debe anular el ingreso de destino.'
			}, { status: 400 });
		}

		if (transfer.status === 'CANCELADO' || transfer.status === 'RECHAZADO') {
			return json({ success: false, message: 'El traslado ya se encuentra cancelado o rechazado.' }, { status: 400 });
		}

		const sourceBranch = transfer.source_branch;
		const userProfitCode = (profile.profit_user || '').trim().toUpperCase() || (profile.email || 'PROFIT').split('@')[0].toUpperCase().substring(0, 6);

		// 2. Si el traslado tiene un ajuste de salida en Profit Plus, anularlo en la Sede Origen
		if (transfer.source_ajue_num && sourceBranch && sourceBranch.agent_url) {
			const agentClient = new AgentClient({
				slug: sourceBranch.id,
				agent_url: sourceBranch.agent_url,
				agent_api_key: sourceBranch.agent_token
			}, profile, fetch);

			const agentRes = await agentClient.request<any>(`/ajustes/${encodeURIComponent(transfer.source_ajue_num)}/anular`, {
				method: 'POST',
				body: JSON.stringify({
					branch_id: transfer.source_branch_id,
					profit_user: userProfitCode,
					co_us_in: userProfitCode
				})
			});

			if (!agentRes || !agentRes.success) {
				const errMsg = String(agentRes?.message || '').toLowerCase();
				// Si el ajuste ya se encuentra anulado en Profit Plus, procedemos a actualizar el traslado a CANCELADO
				if (errMsg.includes('ya se encuentra anulado') || errMsg.includes('ya esta anulado') || errMsg.includes('ya está anulado') || agentRes?.already_voided) {
					console.warn(`[VOID TRANSFER] El ajuste ${transfer.source_ajue_num} ya estaba anulado en Profit Plus. Se procede a cancelar el traslado en la nube.`);
				} else {
					console.error('[VOID TRANSFER] Error anulando ajuste de salida en Agente Origen:', agentRes);
					return json({
						success: false,
						message: agentRes?.message || 'Error al anular el Ajuste de Salida en la Sede Origen.'
					}, { status: 400 });
				}
			}
		}

		// 3. Actualizar el estado del traslado en Supabase a CANCELADO
		const { error: updateErr } = await supabaseAdmin
			.from('stock_transfers')
			.update({
				status: 'CANCELADO',
				updated_at: new Date().toISOString()
			})
			.eq('id', transfer_id);

		if (updateErr) {
			console.error('[VOID TRANSFER] Error actualizando estado en Supabase:', updateErr);
			return json({ success: false, message: 'Ajuste anulado en origen pero falló la actualización del estado en la nube.' }, { status: 500 });
		}

		// 4. Registrar en auditoría
		try {
			const { logAction } = await import('$lib/server/audit');
			await logAction({
				uid: profile.id || null,
				user_email: profile.email,
				action: 'VOID_TRANSFER',
				module: 'inv_transfers',
				record_id: transfer.id,
				new_data: {
					transfer_number: transfer.transfer_number,
					voided_source_ajue_num: transfer.source_ajue_num,
					status: 'CANCELADO'
				},
				branch_id: transfer.source_branch_id
			});
		} catch (auditErr) {
			console.error('[AUDIT] Error guardando auditoria de anulación de traslado:', auditErr);
		}

		console.log(`✅ [VOID TRANSFER SUCCESS] Traslado ${transfer.transfer_number} anulado con éxito. Ajuste Origen ${transfer.source_ajue_num} revertido.`);

		return json({
			success: true,
			message: `Traslado ${transfer.transfer_number} anulado con éxito. El ajuste de salida ${transfer.source_ajue_num || ''} fue revertido y el stock devuelto en la sede origen.`
		});

	} catch (e: any) {
		console.error('[VOID TRANSFER CRITICAL ERROR]:', e);
		return json({ success: false, message: e.message || 'Error interno al procesar la anulación del traslado.' }, { status: 500 });
	}
};
