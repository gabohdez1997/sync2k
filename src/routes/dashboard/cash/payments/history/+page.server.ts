// src/routes/dashboard/cash/payments/history/+page.server.ts
import { protectLoad, protectAction } from '$lib/server/permissions';
import { hasPermission } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { fail } from '@sveltejs/kit';
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
			canVoid: false,
			canSeeOthers: false,
			error: 'No tienes sucursales asignadas.'
		};
	}

	const urlBranchId = url.searchParams.get('branch_id');
	const selectedBranch = urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : allowedBranches[0];
	const selectedBranchId = selectedBranch ? selectedBranch.id : '';

	let payments: any[] = [];
	let pagination = { total: 0, page: 1, limit: 12, totalPages: 0 };
	let errorMsg = '';

	const canVoid = hasPermission(profile, 'cash_payments', 'void');
	const canSeeOthers = hasPermission(profile, 'cash_payments', 'others');

	let co_us_in = url.searchParams.get('co_us_in') || '';

	if (!canSeeOthers) {
		const profitUser = (profile.profit_user || '').trim().toUpperCase();
		if (!profitUser) {
			return {
				branches: allowedBranches,
				payments: [],
				selectedBranchId,
				pagination: { total: 0, page: 1, limit: 12, totalPages: 0 },
				canVoid,
				canSeeOthers,
				error: 'Tu perfil no tiene asociado un usuario de Profit Plus. No puedes visualizar cobros.'
			};
		}
		co_us_in = profitUser;
	}

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
			if (co_us_in) qParams.set('co_us_in', co_us_in);
			if (fec_d) qParams.set('fec_d', fec_d);
			if (fec_h) qParams.set('fec_h', fec_h);

			const res = await fetch(`/api/agent/payments?${qParams.toString()}`);
			if (res.ok) {
				const resData = await res.json();
				if (resData.success) {
					payments = resData.data || [];
					pagination = resData.pagination || pagination;

					let cashiersMap: Record<string, string> = {};
					const { data: profilesData } = await supabaseAdmin
						.from('profiles')
						.select('profit_user, full_name');
					if (profilesData) {
						profilesData.forEach((p: any) => {
							if (p.profit_user) {
								cashiersMap[p.profit_user.trim().toLowerCase()] = p.full_name;
							}
						});
					}
					payments = payments.map((p: any) => {
						const code = (p.co_us_in || '').trim().toLowerCase();
						return {
							...p,
							cashier_name: cashiersMap[code] || p.co_us_in
						};
					});
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
		canVoid,
		canSeeOthers,
		error: errorMsg || null
	};
});

export const actions = {
	voidPayment: protectAction('cash_payments', async ({ request, locals, fetch }) => {
		const formData = await request.formData();
		const cob_num = String(formData.get('cob_num') || '').trim();
		const branch_id = String(formData.get('branch_id') || '').trim();
		const password = String(formData.get('password') || '');
		const profile = (locals as any).profile;

		if (!hasPermission(profile, 'cash_payments', 'void')) {
			return fail(403, { success: false, message: 'No tienes permiso para anular cobros.' });
		}

		if (!cob_num) return fail(400, { success: false, message: 'Número de cobro no válido.' });
		if (!branch_id) return fail(400, { success: false, message: 'Sucursal no válida.' });
		if (!password) {
			return fail(400, { success: false, message: 'La contraseña es requerida para confirmar la anulación.' });
		}

		const email = locals.session?.user?.email;
		if (!email) return fail(401, { success: false, message: 'Sesión no válida.' });

		// Confirmación de seguridad: validar contraseña actual del usuario.
		const { error: authErr } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (authErr) return fail(401, { success: false, message: 'Contraseña de confirmación incorrecta.' });

		const branch = profile.allowed_branches?.find((b: any) => b.id === branch_id);
		if (!branch) return fail(403, { success: false, message: 'Sucursal no autorizada.' });

		const agentClient = new AgentClient(branch, profile, fetch);

		try {
			const res: any = await agentClient.request(`/cobros/${cob_num}/anular`, { method: 'POST' });
			if (res && res.success) {
				return { success: true, message: `Cobro ${cob_num} anulado exitosamente.` };
			} else {
				return fail(500, { success: false, message: res?.message || 'No se pudo anular el cobro en el Agente.' });
			}
		} catch (err: any) {
			return fail(500, { success: false, message: `Error de red con el Agente: ${err.message}` });
		}
	})
};
