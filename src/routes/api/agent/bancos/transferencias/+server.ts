import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { resolveBankBranchClient, logBankAudit } from '$lib/server/banks';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, fetch: svelteFetch }) => {
	const profile = (locals as any).profile;
	if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

	if (!hasPermission(profile, 'bank_movements', 'create')) {
		return json({ success: false, message: 'No tienes permisos para registrar transferencias entre cuentas.' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const branchId = body.branch_id || profile.allowed_branches?.[0]?.id || '';
		const payload = body.transferencia || body;

		const resolved = resolveBankBranchClient(profile, branchId, svelteFetch);
		if ('error' in resolved) {
			return json({ success: false, message: resolved.error }, { status: resolved.status });
		}

		const response: any = await resolved.agentClient.request<any>(
			`/bancos/transferencias?sede=${encodeURIComponent(resolved.branch.id)}`,
			{
				method: 'POST',
				body: JSON.stringify({
					transferencia: {
						...payload,
						co_us_in: profile.profit_user || 'SYNC2K'
					}
				})
			}
		);

		if (response && response.success !== false) {
			await logBankAudit({
				action: 'CREATE',
				module: 'bank_movements',
				recordId: response.co_trans_ban || 'TRANS',
				userEmail: profile.email ?? 'system',
				branchId: resolved.branch.id,
				metadata: {
					message: `Transferencia entre cuentas #${response.co_trans_ban} registrada`,
					cta_origen: payload.cta_origen,
					cta_destino: payload.cta_destino,
					monto_origen: response.monto_origen,
					monto_destino: response.monto_destino
				}
			});
		}

		return json(response, { status: response?.success === false ? 400 : 201 });
	} catch (err: any) {
		return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
	}
};

