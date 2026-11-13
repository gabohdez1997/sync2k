import { error } from '@sveltejs/kit';
import { protectLoad } from '$lib/server/permissions';
import { hasPermission } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { resolveBankBranchClient, getCompanyPrintHeader } from '$lib/server/banks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('bank_movements', async ({ params, url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw error(401, 'Perfil no cargado.');

	const movNum = decodeURIComponent(params.mov_num || '').trim();
	if (!movNum) throw error(400, 'Número de movimiento requerido.');

	const allowedBranches = profile.allowed_branches || [];
	const urlBranchId = url.searchParams.get('branch_id');
	const selectedBranch = (urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : null) || allowedBranches[0];
	const selectedBranchId = selectedBranch?.id || '';

	const resolved = resolveBankBranchClient(profile, selectedBranchId, fetch);
	if ('error' in resolved) {
		throw error(resolved.status || 403, resolved.error);
	}

	const detRes: any = await resolved.agentClient.request<any>(
		`/bancos/movimientos/${encodeURIComponent(movNum)}?sede=${encodeURIComponent(resolved.branch.id)}`
	);

	if (!detRes?.success || !detRes.data) {
		throw error(404, detRes?.message || `Movimiento bancario ${movNum} no encontrado.`);
	}

	const mov = detRes.data;

	// Verificación de permiso de terceros ('others')
	if (!hasPermission(profile, 'bank_movements', 'others')) {
		const profitUser = (profile.profit_user || '').trim().toUpperCase();
		const owner = String(mov.co_us_in || '').trim().toUpperCase();
		if (!profitUser || (owner && owner !== profitUser)) {
			throw error(403, 'No tienes permiso para visualizar o imprimir movimientos registrados por otros usuarios.');
		}
	}

	let registeredByName = mov.co_us_in || '-';
	if (mov.co_us_in) {
		const { data: userRows } = await supabaseAdmin
			.from('profiles')
			.select('full_name')
			.ilike('profit_user', String(mov.co_us_in).trim())
			.limit(1);
		if (userRows && userRows[0]?.full_name) {
			registeredByName = `${userRows[0].full_name} (${mov.co_us_in})`;
		}
	}

	return {
		mov,
		registeredByName,
		company: await getCompanyPrintHeader(resolved.branch, allowedBranches, fetch),
		printedBy: profile.full_name || profile.email || 'Usuario Sync2K',
		printedAt: new Date().toISOString()
	};
});

