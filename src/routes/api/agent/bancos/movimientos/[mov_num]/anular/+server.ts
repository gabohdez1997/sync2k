import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { resolveBankBranchClient, assertBankMovementOwnership, logBankAudit } from '$lib/server/banks';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, url, locals, fetch: svelteFetch }) => {
	const profile = (locals as any).profile;
	if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

	if (!hasPermission(profile, 'bank_movements', 'void')) {
		return json({ success: false, message: 'No tienes permisos para anular movimientos bancarios.' }, { status: 403 });
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

		const response = await resolved.agentClient.request<any>(
			`/bancos/movimientos/${encodeURIComponent(movNum)}/anular?sede=${encodeURIComponent(resolved.branch.id)}`,
			{ method: 'POST' }
		);

		if (response && response.success !== false) {
			await logBankAudit({
				action: 'VOID',
				module: 'bank_movements',
				recordId: movNum,
				userEmail: profile.email ?? 'system',
				branchId: resolved.branch.id,
				metadata: {
					message: response.message || `Movimiento bancario ${movNum} anulado`
				}
			});
		}

		return json(response, { status: response?.success === false ? 400 : 200 });
	} catch (err: any) {
		return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
	}
};

