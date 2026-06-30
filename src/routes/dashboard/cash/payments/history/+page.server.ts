// src/routes/dashboard/cash/payments/history/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('cash_payments', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw new Error('Perfil no cargado.');

	const allowedBranches = profile.allowed_branches || [];
	if (allowedBranches.length === 0) {
		return {
			branches: [],
			payments: [],
			selectedBranchId: '',
			pagination: { total: 0, page: 1, limit: 12, totalPages: 0 },
			error: 'No tienes sucursales asignadas.'
		};
	}

	const urlBranchId = url.searchParams.get('branch_id');
	const selectedBranch = urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : allowedBranches[0];
	const selectedBranchId = selectedBranch ? selectedBranch.id : '';

	let payments: any[] = [];
	let pagination = { total: 0, page: 1, limit: 12, totalPages: 0 };
	let errorMsg = '';

	if (selectedBranchId) {
		try {
			const page = url.searchParams.get('page') || '1';
			const limit = url.searchParams.get('limit') || '12';
			const search = url.searchParams.get('search') || '';
			const co_cli = url.searchParams.get('co_cli') || '';
			const fec_d = url.searchParams.get('fec_d') || '';
			const fec_h = url.searchParams.get('fec_h') || '';

			const qParams = new URLSearchParams();
			qParams.set('branch_id', selectedBranchId);
			qParams.set('page', page);
			qParams.set('limit', limit);
			if (search) qParams.set('search', search);
			if (co_cli) qParams.set('co_cli', co_cli);
			if (fec_d) qParams.set('fec_d', fec_d);
			if (fec_h) qParams.set('fec_h', fec_h);

			const res = await fetch(`/api/agent/payments?${qParams.toString()}`);
			if (res.ok) {
				const resData = await res.json();
				if (resData.success) {
					payments = resData.data || [];
					pagination = resData.pagination || pagination;
				} else {
					errorMsg = resData.message || 'Error al obtener cobros del agente.';
				}
			} else {
				errorMsg = `El agente retornó código de error: ${res.status}`;
			}
		} catch (err: any) {
			errorMsg = `Error de red o conexión: ${err.message}`;
		}
	}

	return {
		title: 'Historial de Cobros',
		branches: allowedBranches,
		selectedBranchId,
		payments,
		pagination,
		error: errorMsg || null
	};
});
