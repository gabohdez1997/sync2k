import { fail } from '@sveltejs/kit';
import { protectLoad, protectAction } from '$lib/server/permissions';
import { hasPermission } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { resolveBankBranchClient, assertBankMovementOwnership, logBankAudit } from '$lib/server/banks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('bank_movements', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw new Error('Perfil no cargado.');

	const canCreate = hasPermission(profile, 'bank_movements', 'create');
	const canEdit = hasPermission(profile, 'bank_movements', 'update');
	const canVoid = hasPermission(profile, 'bank_movements', 'void');
	const canDelete = hasPermission(profile, 'bank_movements', 'delete');
	const canSeeOthers = hasPermission(profile, 'bank_movements', 'others');

	const allowedBranches = profile.allowed_branches || [];
	if (allowedBranches.length === 0) {
		return {
			branches: [],
			selectedBranchId: '',
			movements: [],
			cuentasBancarias: [],
			metrics: {
				total_registros: 0,
				total_anulados: 0,
				total_conciliados: 0,
				total_ingresos_bs: 0,
				total_ingresos_usd: 0,
				total_egresos_bs: 0,
				total_egresos_usd: 0,
				total_idb_bs: 0,
				total_idb_usd: 0
			},
			pagination: { page: 1, limit: 15, total: 0, totalPages: 1 },
			filters: {
				search: '',
				cod_cta: '',
				tipo_op: '',
				origen: '',
				estado: 'all',
				fecha_d: '',
				fecha_h: '',
				sortBy: 'fecha',
				sortDir: 'desc'
			},
			canCreate,
			canEdit,
			canVoid,
			canDelete,
			canSeeOthers,
			error: 'No tienes sucursales asignadas.'
		};
	}

	const urlBranchId = url.searchParams.get('branch_id');
	const selectedBranch = (urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : null) || allowedBranches[0];
	const selectedBranchId = selectedBranch?.id || '';

	const pageParam = url.searchParams.get('page') || '1';
	const limitParam = url.searchParams.get('limit') || '15';
	const search = url.searchParams.get('search') || '';
	const cod_cta = url.searchParams.get('cod_cta') || '';
	const tipo_op = url.searchParams.get('tipo_op') || '';
	const origen = url.searchParams.get('origen') || '';
	const estado = url.searchParams.get('estado') || 'all';
	const fecha_d = url.searchParams.get('fecha_d') || '';
	const fecha_h = url.searchParams.get('fecha_h') || '';
	const sortBy = url.searchParams.get('sortBy') || 'fecha';
	const sortDir = url.searchParams.get('sortDir') || 'desc';

	let co_us_in = url.searchParams.get('co_us_in') || '';
	if (!canSeeOthers) {
		const profitUser = (profile.profit_user || '').trim().toUpperCase();
		if (!profitUser) {
			return {
				branches: allowedBranches,
				selectedBranchId,
				movements: [],
				cuentasBancarias: [],
				metrics: {
					total_registros: 0,
					total_anulados: 0,
					total_conciliados: 0,
					total_ingresos_bs: 0,
					total_ingresos_usd: 0,
					total_egresos_bs: 0,
					total_egresos_usd: 0,
					total_idb_bs: 0,
					total_idb_usd: 0
				},
				pagination: { page: 1, limit: 15, total: 0, totalPages: 1 },
				filters: { search, cod_cta, tipo_op, origen, estado, fecha_d, fecha_h, sortBy, sortDir },
				canCreate,
				canEdit,
				canVoid,
				canDelete,
				canSeeOthers,
				error: 'Tu perfil no tiene asociado un usuario de Profit Plus. No puedes consultar movimientos.'
			};
		}
		co_us_in = profitUser;
	}

	let movements: any[] = [];
	let cuentasBancarias: any[] = [];
	let metrics = {
		total_registros: 0,
		total_anulados: 0,
		total_conciliados: 0,
		total_ingresos_bs: 0,
		total_ingresos_usd: 0,
		total_egresos_bs: 0,
		total_egresos_usd: 0,
		total_idb_bs: 0,
		total_idb_usd: 0
	};
	let pagination = { page: 1, limit: 15, total: 0, totalPages: 1 };
	let errorMsg = '';

	const resolved = resolveBankBranchClient(profile, selectedBranchId, fetch);
	if ('error' in resolved) {
		errorMsg = resolved.error;
	} else {
		try {
			const q = new URLSearchParams();
			q.set('sede', resolved.branch.id);
			q.set('page', pageParam);
			q.set('limit', limitParam);
			if (search) q.set('search', search);
			if (cod_cta) q.set('cod_cta', cod_cta);
			if (tipo_op) q.set('tipo_op', tipo_op);
			if (origen) q.set('origen', origen);
			if (estado) q.set('estado', estado);
			if (fecha_d) q.set('fecha_d', fecha_d);
			if (fecha_h) q.set('fecha_h', fecha_h);
			if (co_us_in) q.set('co_us_in', co_us_in);
			if (sortBy) q.set('sortBy', sortBy);
			if (sortDir) q.set('sortDir', sortDir);

			const [catRes, listRes, profilesRes]: [any, any, any] = await Promise.all([
				resolved.agentClient.request<any>(`/bancos/catalogos?sede=${encodeURIComponent(resolved.branch.id)}`),
				resolved.agentClient.request<any>(`/bancos/movimientos?${q.toString()}`),
				supabaseAdmin.from('profiles').select('profit_user, full_name').not('profit_user', 'is', null)
			]);

			if (catRes?.success) {
				cuentasBancarias = catRes.todas_cuentas_bancarias || catRes.cuentas_bancarias || [];
			}

			const userMap = new Map<string, string>();
			for (const p of profilesRes.data || []) {
				if (p.profit_user && p.full_name) {
					userMap.set(String(p.profit_user).trim().toUpperCase(), p.full_name);
				}
			}

			if (listRes?.success) {
				movements = (listRes.data || []).map((m: any) => {
					const uCode = String(m.co_us_in || '').trim().toUpperCase();
					return {
						...m,
						usuario_nombre: userMap.get(uCode) || m.co_us_in || '-'
					};
				});
				if (listRes.metrics) metrics = listRes.metrics;
				if (listRes.pagination) {
					pagination = {
						page: Number(listRes.pagination.page || 1),
						limit: Number(listRes.pagination.limit || 15),
						total: Number(listRes.pagination.total || listRes.pagination.total_items || 0),
						totalPages: Number(listRes.pagination.totalPages || listRes.pagination.total_pages || 1)
					};
				}
			} else {
				errorMsg = listRes?.message || 'Error consultando historial de movimientos.';
			}
		} catch (e: any) {
			errorMsg = 'Error conectando con el agente: ' + e.message;
		}
	}

	return {
		branches: allowedBranches,
		selectedBranchId,
		movements,
		cuentasBancarias,
		metrics,
		pagination,
		filters: { search, cod_cta, tipo_op, origen, estado, fecha_d, fecha_h, sortBy, sortDir },
		canCreate,
		canEdit,
		canVoid,
		canDelete,
		canSeeOthers,
		error: errorMsg
	};
});

export const actions: Actions = {
	voidMovement: protectAction('bank_movements', async ({ request, locals, fetch }) => {
		const formData = await request.formData();
		const mov_num = String(formData.get('mov_num') || '').trim();
		const branch_id = String(formData.get('branch_id') || '').trim();
		const password = String(formData.get('password') || '');
		const profile = (locals as any).profile;

		if (!hasPermission(profile, 'bank_movements', 'void')) {
			return fail(403, { success: false, message: 'No tienes permiso para anular movimientos bancarios.' });
		}
		if (!mov_num || !branch_id) {
			return fail(400, { success: false, message: 'Datos incompletos para anular.' });
		}
		if (!password) {
			return fail(400, { success: false, message: 'Debes ingresar tu contraseña para confirmar.' });
		}

		const email = locals.session?.user?.email;
		if (!email) return fail(401, { success: false, message: 'Sesión no válida.' });

		const { error: authErr } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (authErr) return fail(401, { success: false, message: 'Contraseña de confirmación incorrecta.' });

		const resolved = resolveBankBranchClient(profile, branch_id, fetch);
		if ('error' in resolved) {
			return fail(resolved.status, { success: false, message: resolved.error });
		}

		const own = await assertBankMovementOwnership(resolved.agentClient, resolved.branch.id, mov_num, profile);
		if (!own.allowed) {
			return fail(own.status || 403, { success: false, message: own.message });
		}

		try {
			const res = await resolved.agentClient.request<any>(
				`/bancos/movimientos/${encodeURIComponent(mov_num)}/anular?sede=${encodeURIComponent(resolved.branch.id)}`,
				{ method: 'POST' }
			);
			if (!res || res.success === false) {
				return fail(400, { success: false, message: res?.message || 'No se pudo anular el movimiento.' });
			}

			await logBankAudit({
				action: 'VOID',
				module: 'bank_movements',
				recordId: mov_num,
				userEmail: email,
				branchId: resolved.branch.id,
				metadata: { message: res.message || `Movimiento ${mov_num} anulado por el usuario` }
			});

			return { success: true, message: res.message || `Movimiento ${mov_num} anulado exitosamente.` };
		} catch (err: any) {
			return fail(500, { success: false, message: 'Error de red con el Agente: ' + err.message });
		}
	}),

	deleteMovement: protectAction('bank_movements', async ({ request, locals, fetch }) => {
		const formData = await request.formData();
		const mov_num = String(formData.get('mov_num') || '').trim();
		const branch_id = String(formData.get('branch_id') || '').trim();
		const password = String(formData.get('password') || '');
		const profile = (locals as any).profile;

		if (!hasPermission(profile, 'bank_movements', 'delete')) {
			return fail(403, { success: false, message: 'No tienes permiso para eliminar movimientos bancarios.' });
		}
		if (!mov_num || !branch_id) {
			return fail(400, { success: false, message: 'Datos incompletos para eliminar.' });
		}
		if (!password) {
			return fail(400, { success: false, message: 'Debes ingresar tu contraseña para confirmar.' });
		}

		const email = locals.session?.user?.email;
		if (!email) return fail(401, { success: false, message: 'Sesión no válida.' });

		const { error: authErr } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (authErr) return fail(401, { success: false, message: 'Contraseña de confirmación incorrecta.' });

		const resolved = resolveBankBranchClient(profile, branch_id, fetch);
		if ('error' in resolved) {
			return fail(resolved.status, { success: false, message: resolved.error });
		}

		const own = await assertBankMovementOwnership(resolved.agentClient, resolved.branch.id, mov_num, profile);
		if (!own.allowed) {
			return fail(own.status || 403, { success: false, message: own.message });
		}

		try {
			const res = await resolved.agentClient.request<any>(
				`/bancos/movimientos/${encodeURIComponent(mov_num)}?sede=${encodeURIComponent(resolved.branch.id)}`,
				{ method: 'DELETE' }
			);
			if (!res || res.success === false) {
				return fail(400, { success: false, message: res?.message || 'No se pudo eliminar el movimiento.' });
			}

			await logBankAudit({
				action: 'DELETE',
				module: 'bank_movements',
				recordId: mov_num,
				userEmail: email,
				branchId: resolved.branch.id,
				metadata: { message: res.message || `Movimiento ${mov_num} eliminado físicamente` }
			});

			return { success: true, message: res.message || `Movimiento ${mov_num} eliminado exitosamente.` };
		} catch (err: any) {
			return fail(500, { success: false, message: 'Error de red con el Agente: ' + err.message });
		}
	})
};

