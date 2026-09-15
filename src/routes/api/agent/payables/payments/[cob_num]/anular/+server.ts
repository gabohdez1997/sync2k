import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, url, locals, fetch }) => {
	try {
		const profile = locals.profile;
		if (!profile) return json({ error: 'Sesión no válida' }, { status: 401 });

		const { cob_num } = params;
		if (!cob_num) {
			return json({ error: 'Número de pago obligatorio' }, { status: 400 });
		}

		const branchId = url.searchParams.get('branch_id');
		const allowedBranches = profile.allowed_branches || [];
		const branch = allowedBranches.find(b => b.id === branchId) || allowedBranches[0];

		if (!branch || !branch.agent_url) {
			return json({ error: 'Sucursal no configurada' }, { status: 400 });
		}

		const agentClient = new AgentClient({
			slug: branch.id,
			agent_url: branch.agent_url,
			agent_api_key: branch.agent_token
		}, profile, fetch);

		const endpoint = `/pagos/${encodeURIComponent(cob_num)}/anular`;
		const resData = await agentClient.request<any>(endpoint, {
			method: 'POST'
		});

		if (resData && (resData.success || resData.success !== false)) {
			try {
				await supabaseAdmin.from('audit_log').insert({
					action: 'VOID',
					module: 'pur_payments',
					record_id: cob_num,
					user_email: profile.email ?? 'system',
					branch_id: branchId || branch.id,
					metadata: {
						message: `Pago ${cob_num} anulado con éxito`,
						doc_num: cob_num
					}
				});
			} catch (auditError) {
				console.error('Error al guardar log de auditoría de anulación de pago:', auditError);
			}
		}

		return json(resData);
	} catch (e: any) {
		console.error(`[API PAYABLES PAYMENT VOID] Error al anular pago ${params.cob_num}:`, e.message);
		return json({ error: e.message }, { status: 500 });
	}
};
