import { error } from '@sveltejs/kit';
import { protectLoad } from '$lib/server/permissions';
import { hasPermission } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { resolveBankBranchClient, getCompanyPrintHeader } from '$lib/server/banks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('bank_movements', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw error(401, 'Perfil no cargado.');

	const allowedBranches = profile.allowed_branches || [];
	if (allowedBranches.length === 0) {
		throw error(403, 'No tienes sucursales asignadas.');
	}

	const urlBranchId = url.searchParams.get('branch_id');
	const selectedBranch =
		(urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : null) || allowedBranches[0];
	const selectedBranchId = selectedBranch?.id || '';

	const canSeeOthers = hasPermission(profile, 'bank_movements', 'others');
	let co_us_in = url.searchParams.get('co_us_in') || '';
	if (!canSeeOthers) {
		const profitUser = (profile.profit_user || '').trim().toUpperCase();
		if (!profitUser) {
			throw error(403, 'Tu perfil no tiene usuario de Profit Plus asociado.');
		}
		co_us_in = profitUser;
	}

	const search = url.searchParams.get('search') || '';
	const cod_cta = url.searchParams.get('cod_cta') || '';
	const tipo_op = url.searchParams.get('tipo_op') || '';
	const origen = url.searchParams.get('origen') || '';
	const estado = url.searchParams.get('estado') || 'all';
	const fecha_d = url.searchParams.get('fecha_d') || '';
	const fecha_h = url.searchParams.get('fecha_h') || '';

	const resolved = resolveBankBranchClient(profile, selectedBranchId, fetch);
	if ('error' in resolved) {
		throw error(resolved.status || 403, resolved.error);
	}

	const buildQuery = (pageNum: number) => {
		const q = new URLSearchParams();
		q.set('sede', resolved.branch.id);
		q.set('page', String(pageNum));
		q.set('limit', '5000');
		q.set('sortBy', 'fecha');
		q.set('sortDir', 'asc');
		if (search) q.set('search', search);
		if (cod_cta) q.set('cod_cta', cod_cta);
		if (tipo_op) q.set('tipo_op', tipo_op);
		if (origen) q.set('origen', origen);
		if (estado && estado !== 'all') q.set('estado', estado);
		if (fecha_d) q.set('fecha_d', fecha_d);
		if (fecha_h) q.set('fecha_h', fecha_h);
		if (co_us_in) q.set('co_us_in', co_us_in);
		return q.toString();
	};

	const [catRes, firstListRes, profilesRes]: [any, any, any] = await Promise.all([
		resolved.agentClient.request<any>(`/bancos/catalogos?sede=${encodeURIComponent(resolved.branch.id)}`),
		resolved.agentClient.request<any>(`/bancos/movimientos?${buildQuery(1)}`),
		supabaseAdmin.from('profiles').select('profit_user, full_name').not('profit_user', 'is', null)
	]);

	if (!firstListRes?.success) {
		throw error(500, firstListRes?.message || 'No se pudieron consultar los movimientos bancarios.');
	}

	let rawMovements: any[] = [...(firstListRes.data || [])];
	const totalPages = Number(firstListRes.pagination?.total_pages || firstListRes.pagination?.totalPages || 1);
	if (totalPages > 1) {
		const restPages = Array.from({ length: Math.min(totalPages - 1, 50) }, (_, idx) => idx + 2);
		const extraResults = await Promise.all(
			restPages.map((p) => resolved.agentClient.request<any>(`/bancos/movimientos?${buildQuery(p)}`))
		);
		for (const r of extraResults) {
			if (r?.success && Array.isArray(r.data)) {
				rawMovements.push(...r.data);
			}
		}
	}

	const userMap = new Map<string, string>();
	for (const p of profilesRes.data || []) {
		if (p.profit_user && p.full_name) {
			userMap.set(String(p.profit_user).trim().toUpperCase(), p.full_name);
		}
	}

	const movements = rawMovements
		.map((m: any) => {
			const uCode = String(m.co_us_in || '').trim().toUpperCase();
			return {
				...m,
				usuario_nombre: userMap.get(uCode) || m.co_us_in || '-'
			};
		})
		.sort((a, b) => {
			const dateA = String(a.fecha || '').slice(0, 10);
			const dateB = String(b.fecha || '').slice(0, 10);
			if (dateA !== dateB) return dateA.localeCompare(dateB);
			return String(a.mov_num || '').localeCompare(String(b.mov_num || ''));
		});

	const cuentasBancarias = catRes?.success
		? catRes.todas_cuentas_bancarias || catRes.cuentas_bancarias || []
		: [];
	const selectedAccount = cod_cta
		? cuentasBancarias.find((c: any) => String(c.cod_cta).trim() === cod_cta.trim()) || null
		: null;

	return {
		movements,
		cuentasBancarias,
		selectedAccount,
		metrics: firstListRes.metrics || null,
		filters: { search, cod_cta, tipo_op, origen, estado, fecha_d, fecha_h },
		company: await getCompanyPrintHeader(resolved.branch, allowedBranches, fetch),
		printedBy: profile.full_name || profile.email || 'Usuario Sync2K',
		printedAt: new Date().toISOString()
	};
});

