import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { resolveBankBranchClient, assertBankMovementOwnership, logBankAudit } from '$lib/server/banks';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals, fetch: svelteFetch }) => {
	const profile = (locals as any).profile;
	if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

	if (!hasPermission(profile, 'bank_movements', 'read')) {
		return json({ success: false, message: 'Sin permisos para consultar movimientos bancarios.' }, { status: 403 });
	}

	const movNum = decodeURIComponent(params.mov_num || '').trim();
	const branchId = url.searchParams.get('branch_id') || profile.allowed_branches?.[0]?.id || '';
	const resolved = resolveBankBranchClient(profile, branchId, svelteFetch);
	if ('error' in resolved) {
		return json({ success: false, message: resolved.error }, { status: resolved.status });
	}

	try {
		const res = await resolved.agentClient.request<any>(
			`/bancos/movimientos/${encodeURIComponent(movNum)}?sede=${encodeURIComponent(resolved.branch.id)}`
		);
		if (res?.success && res?.data && !hasPermission(profile, 'bank_movements', 'others')) {
			const profitUser = (profile.profit_user || '').trim().toUpperCase();
			const owner = String(res.data.co_us_in || '').trim().toUpperCase();
			if (!profitUser || (owner && owner !== profitUser)) {
				return json({ success: false, message: 'No tienes permiso para ver movimientos de otros usuarios.' }, { status: 403 });
			}
		}
		return json(res);
	} catch (err: any) {
		return json({ success: false, message: 'Error consultando detalle: ' + err.message }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, request, locals, fetch: svelteFetch }) => {
	const profile = (locals as any).profile;
	if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

	if (!hasPermission(profile, 'bank_movements', 'update')) {
		return json({ success: false, message: 'No tienes permisos para editar movimientos bancarios.' }, { status: 403 });
	}

	const movNum = decodeURIComponent(params.mov_num || '').trim();
	try {
		const body = await request.json();
		const branchId = body.branch_id || profile.allowed_branches?.[0]?.id || '';
		const payload = body.movimiento || body;

		const resolved = resolveBankBranchClient(profile, branchId, svelteFetch);
		if ('error' in resolved) {
			return json({ success: false, message: resolved.error }, { status: resolved.status });
		}

		const own = await assertBankMovementOwnership(resolved.agentClient, resolved.branch.id, movNum, profile);
		if (!own.allowed) {
			return json({ success: false, message: own.message }, { status: own.status || 403 });
		}

		const response: any = await resolved.agentClient.request<any>(
			`/bancos/movimientos/${encodeURIComponent(movNum)}?sede=${encodeURIComponent(resolved.branch.id)}`,
			{
				method: 'PUT',
				body: JSON.stringify({
					movimiento: {
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
				recordId: movNum,
				userEmail: profile.email ?? 'system',
				branchId: resolved.branch.id,
				metadata: {
					message: `Movimiento bancario ${movNum} actualizado`,
					cod_cta: payload.cod_cta,
					tipo_op: payload.tipo_op,
					monto: response.monto ?? payload.monto
				}
			});
		}

		return json(response, { status: response?.success === false ? 400 : 200 });
	} catch (err: any) {
		return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, url, locals, fetch: svelteFetch }) => {
	const profile = (locals as any).profile;
	if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

	if (!hasPermission(profile, 'bank_movements', 'delete')) {
		return json({ success: false, message: 'No tienes permisos para eliminar movimientos bancarios.' }, { status: 403 });
	}

	const movNum = decodeURIComponent(params.mov_num || '').trim();
	const branchId = url.searchParams.get('branch_id') || '';
	const resolved = resolveBankBranchClient(profile, branchId, svelteFetch);
	if ('error' in resolved) {
		return json({ success: false, message: resolved.error }, { status: resolved.status });
	}

	try {
		const own = await assertBankMovementOwnership(resolved.agentClient, resolved.branch.id, movNum, profile);
		if (!own.allowed) {
			return json({ success: false, message: own.message }, { status: own.status || 403 });
		}

		const response: any = await resolved.agentClient.request<any>(
			`/bancos/movimientos/${encodeURIComponent(movNum)}?sede=${encodeURIComponent(resolved.branch.id)}`,
			{ method: 'DELETE' }
		);

		if (response && response.success !== false) {
			await logBankAudit({
				action: 'DELETE',
				module: 'bank_movements',
				recordId: movNum,
				userEmail: profile.email ?? 'system',
				branchId: resolved.branch.id,
				metadata: {
					message: response.message || `Movimiento bancario ${movNum} eliminado`
				}
			});
		}

		return json(response, { status: response?.success === false ? 400 : 200 });
	} catch (err: any) {
		return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
	}
};

