import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { resolveBankBranchClient } from '$lib/server/banks';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, fetch: svelteFetch }) => {
	const profile = (locals as any).profile;
	if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

	if (!hasPermission(profile, 'bank_reconciliation', 'read')) {
		return json({ success: false, message: 'Sin permisos para consultar conciliaciones bancarias.' }, { status: 403 });
	}

	const branchId = url.searchParams.get('branch_id') || profile.allowed_branches?.[0]?.id || '';
	const resolved = resolveBankBranchClient(profile, branchId, svelteFetch);
	if ('error' in resolved) {
		return json({ success: false, message: resolved.error }, { status: resolved.status });
	}

	const params = new URLSearchParams(url.searchParams);
	params.set('sede', resolved.branch.id);

	try {
		const res: any = await resolved.agentClient.request<any>(`/bancos/conciliacion?${params.toString()}`);
		if (res?.success && Array.isArray(res.movimientos) && !hasPermission(profile, 'bank_reconciliation', 'others')) {
			const profitUser = (profile.profit_user || '').trim().toUpperCase();
			if (!profitUser) {
				return json({ success: false, message: 'Tu perfil no tiene usuario Profit asociado.' }, { status: 403 });
			}
			res.movimientos = res.movimientos.filter(
				(m: any) => String(m.co_us_in || '').trim().toUpperCase() === profitUser
			);
		}
		return json(res, { status: res?.success === false ? 400 : 200 });
	} catch (err: any) {
		return json({ success: false, message: 'Error consultando conciliación: ' + err.message }, { status: 500 });
	}
};

