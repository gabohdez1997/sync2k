import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { resolveBankBranchClient, logBankAudit } from '$lib/server/banks';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, fetch: svelteFetch }) => {
	const profile = (locals as any).profile;
	if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

	if (!hasPermission(profile, 'bank_movements', 'read')) {
		return json({ success: false, message: 'Sin permisos para consultar movimientos bancarios.' }, { status: 403 });
	}

	const branchId = url.searchParams.get('branch_id') || profile.allowed_branches?.[0]?.id || '';
	const resolved = resolveBankBranchClient(profile, branchId, svelteFetch);
	if ('error' in resolved) {
		return json({ success: false, message: resolved.error }, { status: resolved.status });
	}

	const canSeeOthers = hasPermission(profile, 'bank_movements', 'others');
	const params = new URLSearchParams(url.searchParams);
	params.set('sede', resolved.branch.id);

	if (!canSeeOthers) {
		const profitUser = (profile.profit_user || '').trim().toUpperCase();
		if (!profitUser) {
			return json({ success: false, message: 'Tu perfil no tiene usuario Profit asociado.' }, { status: 403 });
		}
		params.set('co_us_in', profitUser);
	}

	try {
		const res = await resolved.agentClient.request<any>(`/bancos/movimientos?${params.toString()}`);
		return json(res);
	} catch (err: any) {
		return json({ success: false, message: 'Error consultando movimientos: ' + err.message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals, fetch: svelteFetch }) => {
	const profile = (locals as any).profile;
	if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

	if (!hasPermission(profile, 'bank_movements', 'create')) {
		return json({ success: false, message: 'No tienes permiso para registrar movimientos bancarios.' }, { status: 403 });
	}

	try {
		const body = await request.json();
		const branchId = body.branch_id || profile.allowed_branches?.[0]?.id || '';
		const payload = body.movimiento || body;

		const resolved = resolveBankBranchClient(profile, branchId, svelteFetch);
		if ('error' in resolved) {
			return json({ success: false, message: resolved.error }, { status: resolved.status });
		}

		const response: any = await resolved.agentClient.request<any>(
			`/bancos/movimientos?sede=${encodeURIComponent(resolved.branch.id)}`,
			{
				method: 'POST',
				body: JSON.stringify({
					movimiento: {
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
				recordId: response.mov_num || payload.mov_num || 'N/A',
				userEmail: profile.email ?? 'system',
				branchId: resolved.branch.id,
				metadata: {
					message: `Movimiento bancario ${response.mov_num} (${payload.tipo_op}) registrado`,
					cod_cta: payload.cod_cta,
					tipo_op: payload.tipo_op,
					monto: response.monto ?? payload.monto
				}
			});
		}

		return json(response, { status: response?.success === false ? 400 : 201 });
	} catch (err: any) {
		return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
	}
};

