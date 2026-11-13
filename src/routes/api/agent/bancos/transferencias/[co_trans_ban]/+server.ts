import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { resolveBankBranchClient, logBankAudit } from '$lib/server/banks';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ params, request, locals, fetch: svelteFetch }) => {
	const profile = (locals as any).profile;
	if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

	if (!hasPermission(profile, 'bank_movements', 'update')) {
		return json({ success: false, message: 'No tienes permisos para editar transferencias entre cuentas.' }, { status: 403 });
	}

	const coTransBan = decodeURIComponent(params.co_trans_ban || '').trim();
	try {
		const body = await request.json();
		const branchId = body.branch_id || profile.allowed_branches?.[0]?.id || '';
		const payload = body.transferencia || body;

		const resolved = resolveBankBranchClient(profile, branchId, svelteFetch);
		if ('error' in resolved) {
			return json({ success: false, message: resolved.error }, { status: resolved.status });
		}

		if (!hasPermission(profile, 'bank_movements', 'others')) {
			const profitUser = (profile.profit_user || '').trim().toUpperCase();
			const check: any = await resolved.agentClient.request(
				`/bancos/transferencias/${encodeURIComponent(coTransBan)}?sede=${encodeURIComponent(resolved.branch.id)}`
			);
			const owner = String(check?.data?.co_us_in || '').trim().toUpperCase();
			if (!profitUser || (owner && owner !== profitUser)) {
				return json({ success: false, message: 'No tienes permiso para editar transferencias de otros usuarios.' }, { status: 403 });
			}
		}

		const response: any = await resolved.agentClient.request<any>(
			`/bancos/transferencias/${encodeURIComponent(coTransBan)}?sede=${encodeURIComponent(resolved.branch.id)}`,
			{
				method: 'PUT',
				body: JSON.stringify({
					transferencia: {
						...payload,
						co_us_mo: profile.profit_user || 'SYNC2K'
					}
				})
			}
		);

		if (response && response.success !== false) {
			await logBankAudit({
				action: 'UPDATE',
				module: 'bank_movements',
				recordId: coTransBan,
				userEmail: profile.email ?? 'system',
				branchId: resolved.branch.id,
				metadata: {
					message: `Transferencia entre cuentas #${coTransBan} actualizada`,
					cta_origen: payload.cta_origen,
					cta_destino: payload.cta_destino,
					monto_origen: response.monto_origen,
					monto_destino: response.monto_destino
				}
			});
		}

		return json(response, { status: response?.success === false ? 400 : 200 });
	} catch (err: any) {
		return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
	}
};

