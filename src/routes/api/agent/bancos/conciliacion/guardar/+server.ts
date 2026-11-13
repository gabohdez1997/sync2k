import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { resolveBankBranchClient, logBankAudit } from '$lib/server/banks';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, fetch: svelteFetch }) => {
	const profile = (locals as any).profile;
	if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

	if (!hasPermission(profile, 'bank_reconciliation', 'create') && !hasPermission(profile, 'bank_reconciliation', 'update')) {
		return json({ success: false, message: 'No tienes permiso para guardar conciliaciones bancarias.' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const branchId = body.branch_id || profile.allowed_branches?.[0]?.id || '';

		const resolved = resolveBankBranchClient(profile, branchId, svelteFetch);
		if ('error' in resolved) {
			return json({ success: false, message: resolved.error }, { status: resolved.status });
		}

		// Si no tiene permiso 'others', verificar que todos los movimientos modificados le pertenezcan
		const canSeeOthers = hasPermission(profile, 'bank_reconciliation', 'others');
		if (!canSeeOthers) {
			const profitUser = (profile.profit_user || '').trim().toUpperCase();
			if (!profitUser) {
				return json({ success: false, message: 'Tu perfil no tiene usuario Profit asociado.' }, { status: 403 });
			}
			const check: any = await resolved.agentClient.request(
				`/bancos/conciliacion?sede=${encodeURIComponent(resolved.branch.id)}&cod_cta=${encodeURIComponent(body.cod_cta || '')}&anio=${encodeURIComponent(body.anio || '')}&mes=${encodeURIComponent(body.mes || '')}`
			);
			const ownerMap = new Map(
				(check?.movimientos || []).map((m: any) => [String(m.mov_num || '').trim(), String(m.co_us_in || '').trim().toUpperCase()])
			);
			for (const item of body.movimientos || []) {
				const movKey = String(item.mov_num || '').trim();
				const owner = ownerMap.get(movKey);
				if (owner && owner !== profitUser) {
					return json(
						{ success: false, message: `Sin permiso de terceros para conciliar el movimiento ${movKey}.` },
						{ status: 403 }
					);
				}
			}
		}

		const response: any = await resolved.agentClient.request<any>(
			`/bancos/conciliacion/guardar?sede=${encodeURIComponent(resolved.branch.id)}`,
			{
				method: 'POST',
				body: JSON.stringify({
					cod_cta: body.cod_cta,
					anio: body.anio,
					mes: body.mes,
					movimientos: body.movimientos,
					co_us_mo: profile.profit_user || 'SYNC2K'
				})
			}
		);

		if (response && response.success !== false) {
			await logBankAudit({
				action: 'RECONCILE',
				module: 'bank_reconciliation',
				recordId: `${body.cod_cta}-${body.anio}-${String(body.mes).padStart(2, '0')}`,
				userEmail: profile.email ?? 'system',
				branchId: resolved.branch.id,
				metadata: {
					message: `Conciliación ${body.cod_cta} (${body.mes}/${body.anio}): ${response.updated_count} movimientos guardados`,
					cod_cta: body.cod_cta,
					anio: body.anio,
					mes: body.mes,
					updated_count: response.updated_count
				}
			});
		}

		return json(response, { status: response?.success === false ? 400 : 200 });
	} catch (err: any) {
		return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
	}
};

