import { error } from '@sveltejs/kit';
import { protectLoad } from '$lib/server/permissions';
import { hasPermission } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { resolveBankBranchClient, getCompanyPrintHeader } from '$lib/server/banks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('bank_reconciliation', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw error(401, 'Perfil no cargado.');

	const codCta = url.searchParams.get('cod_cta')?.trim() || '';
	const now = new Date();
	const anio = parseInt(url.searchParams.get('anio') || '', 10) || now.getFullYear();
	const mes = parseInt(url.searchParams.get('mes') || '', 10) || now.getMonth() + 1;

	if (!codCta) throw error(400, 'Debe especificar la cuenta bancaria (cod_cta).');
	if (mes < 1 || mes > 12) throw error(400, 'Mes inválido.');

	const allowedBranches = profile.allowed_branches || [];
	const urlBranchId = url.searchParams.get('branch_id');
	const selectedBranch =
		(urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : null) || allowedBranches[0];
	const selectedBranchId = selectedBranch?.id || '';

	const canSeeOthers = hasPermission(profile, 'bank_reconciliation', 'others');
	if (!canSeeOthers && !(profile.profit_user || '').trim()) {
		throw error(403, 'Tu perfil no tiene usuario Profit asociado.');
	}

	const resolved = resolveBankBranchClient(profile, selectedBranchId, fetch);
	if ('error' in resolved) {
		throw error(resolved.status || 403, resolved.error);
	}

	const [recRes, profilesRes]: [any, any] = await Promise.all([
		resolved.agentClient.request<any>(
			`/bancos/conciliacion?sede=${encodeURIComponent(resolved.branch.id)}&cod_cta=${encodeURIComponent(codCta)}&anio=${anio}&mes=${mes}`
		),
		supabaseAdmin.from('profiles').select('profit_user, full_name').not('profit_user', 'is', null)
	]);

	if (!recRes?.success) {
		throw error(404, recRes?.message || 'No se pudo cargar la conciliación solicitada.');
	}

	const userMap = new Map<string, string>();
	for (const p of profilesRes.data || []) {
		if (p.profit_user && p.full_name) {
			userMap.set(String(p.profit_user).trim().toUpperCase(), p.full_name);
		}
	}

	let movs = recRes.movimientos || [];
	if (!canSeeOthers) {
		const profitUser = (profile.profit_user || '').trim().toUpperCase();
		movs = movs.filter((m: any) => String(m.co_us_in || '').trim().toUpperCase() === profitUser);
	}

	const enrichedMovs = movs.map((m: any) => {
		const uCode = String(m.co_us_in || '').trim().toUpperCase();
		return {
			...m,
			conciliado: Boolean(m.conciliado),
			usuario_nombre: userMap.get(uCode) || m.co_us_in || '-'
		};
	});

	const saldoBancoParam = url.searchParams.get('saldo_banco');
	const parsedSaldoBanco =
		saldoBancoParam !== null && saldoBancoParam.trim() !== '' && Number.isFinite(Number(saldoBancoParam))
			? Number(saldoBancoParam)
			: null;

	return {
		reconciliation: {
			...recRes,
			movimientos: enrichedMovs
		},
		anio,
		mes,
		saldoBanco: parsedSaldoBanco,
		filteredByOwnership: !canSeeOthers,
		company: await getCompanyPrintHeader(resolved.branch, allowedBranches, fetch),
		printedBy: profile.full_name || profile.email || 'Usuario Sync2K',
		printedAt: new Date().toISOString()
	};
});

