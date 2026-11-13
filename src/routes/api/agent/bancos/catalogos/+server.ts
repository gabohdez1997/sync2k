import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import { resolveBankBranchClient } from '$lib/server/banks';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, fetch: svelteFetch }) => {
	const profile = (locals as any).profile;
	if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

	if (!hasPermission(profile, 'bank_movements', 'read') && !hasPermission(profile, 'bank_reconciliation', 'read')) {
		return json({ success: false, message: 'Sin permisos para consultar catálogos bancarios.' }, { status: 403 });
	}

	const branchId = url.searchParams.get('branch_id') || profile.allowed_branches?.[0]?.id || '';
	const resolved = resolveBankBranchClient(profile, branchId, svelteFetch);
	if ('error' in resolved) {
		return json({ success: false, message: resolved.error }, { status: resolved.status });
	}

	try {
		const res = await resolved.agentClient.request<any>(`/bancos/catalogos?sede=${encodeURIComponent(resolved.branch.id)}`);
		return json(res);
	} catch (err: any) {
		return json({ success: false, message: 'Error consultando catálogos bancarios: ' + err.message }, { status: 500 });
	}
};

