import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { resolveBankBranchClient } from '$lib/server/banks';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params: routeParams, url, locals, fetch: svelteFetch }) => {
	const profile = (locals as any).profile;
	if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

	if (!hasPermission(profile, 'bank_income_expense', 'read') && !hasPermission(profile, 'bank_movements', 'read')) {
		return json({ success: false, message: 'Sin permisos para consultar movimientos de la cuenta.' }, { status: 403 });
	}

	const branchId = url.searchParams.get('branch_id') || profile.allowed_branches?.[0]?.id || '';
	const resolved = resolveBankBranchClient(profile, branchId, svelteFetch);
	if ('error' in resolved) {
		return json({ success: false, message: resolved.error }, { status: resolved.status });
	}

	const codigo = routeParams.codigo;
	const params = new URLSearchParams(url.searchParams);
	params.set('sede', resolved.branch.id);

	try {
		const res = await resolved.agentClient.request<any>(
			`/bancos/cuentas-ingr-egr/${encodeURIComponent(codigo)}/movimientos?${params.toString()}`
		);
		return json(res);
	} catch (err: any) {
		return json({ success: false, message: 'Error consultando movimientos: ' + err.message }, { status: 500 });
	}
};

