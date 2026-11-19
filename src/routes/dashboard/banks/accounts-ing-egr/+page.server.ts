import { fail } from '@sveltejs/kit';
import { protectLoad, protectAction } from '$lib/server/permissions';
import { hasPermission } from '$lib/server/auth';
import { resolveBankBranchClient, logBankAudit } from '$lib/server/banks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('bank_income_expense', async ({ locals, url, fetch }) => {
	const profile = locals.profile;
	if (!profile) {
		return {
			title: 'Cuentas de Ingresos y Egresos',
			accounts: [],
			conceptosIslr: [],
			metrics: { total_cuentas: 0, con_movimientos: 0, sin_movimientos: 0 },
			pagination: { total: 0, page: 1, limit: 20, totalPages: 1 },
			search: '',
			filter: 'all',
			branches: [],
			selectedBranchId: '',
			crud: { read: false, create: false, update: false, delete: false },
			error: 'Sesión no válida.'
		};
	}

	const canCreate = hasPermission(profile, 'bank_income_expense', 'create');
	const canUpdate = hasPermission(profile, 'bank_income_expense', 'update');
	const canDelete = hasPermission(profile, 'bank_income_expense', 'delete');

	const allowedBranches = profile.allowed_branches || [];
	if (allowedBranches.length === 0) {
		return {
			title: 'Cuentas de Ingresos y Egresos',
			accounts: [],
			conceptosIslr: [],
			metrics: { total_cuentas: 0, con_movimientos: 0, sin_movimientos: 0 },
			pagination: { total: 0, page: 1, limit: 20, totalPages: 1 },
			search: '',
			filter: 'all',
			branches: [],
			selectedBranchId: '',
			crud: { read: true, create: canCreate, update: canUpdate, delete: canDelete },
			error: 'No tienes sucursales asignadas. Contacta al administrador.'
		};
	}

	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const search = (url.searchParams.get('search') || '').trim();
	const filter = (url.searchParams.get('filter') || 'all').trim();
	const urlBranchId = url.searchParams.get('branch_id');
	const selectedBranch =
		(urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : null) || allowedBranches[0];
	const selectedBranchId = selectedBranch?.id || '';

	let accounts: any[] = [];
	let conceptosIslr: any[] = [];
	let metrics = { total_cuentas: 0, con_movimientos: 0, sin_movimientos: 0 };
	let pagination = { total: 0, page, limit: 20, totalPages: 1 };
	let errorMsg: string | null = null;

	const resolved = resolveBankBranchClient(profile, selectedBranchId, fetch);
	if ('error' in resolved) {
		errorMsg = resolved.error;
	} else {
		try {
			const q = new URLSearchParams();
			q.set('sede', resolved.branch.id);
			q.set('page', String(page));
			q.set('limit', '20');
			if (search) q.set('search', search);
			if (filter && filter !== 'all') q.set('filter', filter);

			const res: any = await resolved.agentClient.request(`/bancos/cuentas-ingr-egr?${q.toString()}`);
			if (res?.success) {
				accounts = res.data || [];
				conceptosIslr = res.conceptos_islr || [];
				if (res.metrics) metrics = res.metrics;
				if (res.pagination) {
					pagination = {
						total: Number(res.pagination.total || res.pagination.total_items || 0),
						page: Number(res.pagination.currentPage || res.pagination.page || page),
						limit: Number(res.pagination.limit || 20),
						totalPages: Number(res.pagination.pages || res.pagination.total_pages || 1)
					};
				}
			} else {
				errorMsg = res?.message || 'Error consultando Cuentas de Ingresos y Egresos.';
			}
		} catch (e: any) {
			errorMsg = 'Error conectando con el agente: ' + e.message;
		}
	}

	return {
		title: 'Cuentas de Ingresos y Egresos',
		accounts,
		conceptosIslr,
		metrics,
		pagination,
		search,
		filter,
		branches: allowedBranches,
		selectedBranchId,
		error: errorMsg,
		crud: {
			read: true,
			create: canCreate,
			update: canUpdate,
			delete: canDelete
		}
	};
});

export const actions: Actions = {
	saveAccount: protectAction('bank_income_expense', async ({ request, locals, fetch }) => {
		const profile = locals.profile;
		if (!profile) return fail(401, { message: 'Sesión expirada.' });

		const formData = await request.formData();
		const isNew = formData.get('_isNew') === 'true';
		const branchId = String(formData.get('branch_id') || '').trim() || profile.allowed_branches?.[0]?.id || '';
		const co_cta_ingr_egr = String(formData.get('co_cta_ingr_egr') || '').trim().toUpperCase();
		const descrip = String(formData.get('descrip') || '').trim();
		const co_islr = String(formData.get('co_islr') || '').trim().toUpperCase();

		if (isNew && !hasPermission(profile, 'bank_income_expense', 'create')) {
			return fail(403, { message: 'No tienes permiso para CREAR cuentas de ingresos y egresos.' });
		}
		if (!isNew && !hasPermission(profile, 'bank_income_expense', 'update')) {
			return fail(403, { message: 'No tienes permiso para EDITAR cuentas de ingresos y egresos.' });
		}

		if (!co_cta_ingr_egr) return fail(400, { message: 'El código de la cuenta es obligatorio.' });
		if (co_cta_ingr_egr.length > 20) return fail(400, { message: 'El código no puede exceder 20 caracteres.' });
		if (!descrip) return fail(400, { message: 'La descripción es obligatoria.' });
		if (descrip.length > 60) return fail(400, { message: 'La descripción no puede exceder 60 caracteres.' });

		const resolved = resolveBankBranchClient(profile, branchId, fetch);
		if ('error' in resolved) {
			return fail(resolved.status, { message: resolved.error });
		}

		const endpoint = isNew
			? `/bancos/cuentas-ingr-egr?sede=${encodeURIComponent(resolved.branch.id)}`
			: `/bancos/cuentas-ingr-egr/${encodeURIComponent(co_cta_ingr_egr)}?sede=${encodeURIComponent(resolved.branch.id)}`;

		const res: any = await resolved.agentClient.request(endpoint, {
			method: isNew ? 'POST' : 'PUT',
			body: JSON.stringify({
				sede: resolved.branch.id,
				co_cta_ingr_egr,
				descrip,
				co_islr: co_islr || null
			})
		});

		if (!res || res.success === false) {
			return fail(400, { message: res?.message || 'No se pudo guardar la cuenta en Profit Plus.' });
		}

		await logBankAudit({
			action: isNew ? 'CREATE' : 'UPDATE',
			module: 'bank_income_expense',
			recordId: co_cta_ingr_egr,
			userEmail: profile.email || 'system',
			branchId: resolved.branch.id,
			metadata: { co_cta_ingr_egr, descrip, co_islr: co_islr || null }
		});

		return {
			success: true,
			message: res.message || (isNew ? 'Cuenta creada correctamente.' : 'Cuenta actualizada correctamente.')
		};
	}),

	deleteAccount: protectAction('bank_income_expense', async ({ request, locals, fetch }) => {
		const profile = locals.profile;
		if (!profile) return fail(401, { message: 'Sesión expirada.' });

		if (!hasPermission(profile, 'bank_income_expense', 'delete')) {
			return fail(403, { message: 'No tienes permiso para ELIMINAR cuentas de ingresos y egresos.' });
		}

		const formData = await request.formData();
		const co_cta_ingr_egr = String(formData.get('co_cta_ingr_egr') || '').trim();
		const branchId = String(formData.get('branch_id') || '').trim() || profile.allowed_branches?.[0]?.id || '';
		const password = String(formData.get('password') || '');

		if (!co_cta_ingr_egr) return fail(400, { message: 'Código de cuenta no proporcionado.' });
		if (!password) return fail(400, { message: 'La contraseña es requerida para confirmar la eliminación.' });

		const email = locals.session?.user?.email;
		if (!email) return fail(401, { message: 'Sesión no válida.' });

		const { error: authErr } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (authErr) return fail(401, { message: 'Contraseña de confirmación incorrecta.' });

		const resolved = resolveBankBranchClient(profile, branchId, fetch);
		if ('error' in resolved) {
			return fail(resolved.status, { message: resolved.error });
		}

		const res: any = await resolved.agentClient.request(
			`/bancos/cuentas-ingr-egr/${encodeURIComponent(co_cta_ingr_egr)}?sede=${encodeURIComponent(resolved.branch.id)}`,
			{ method: 'DELETE' }
		);

		if (!res || res.success === false) {
			return fail(400, { message: res?.message || 'No se pudo eliminar la cuenta en Profit Plus.' });
		}

		await logBankAudit({
			action: 'DELETE',
			module: 'bank_income_expense',
			recordId: co_cta_ingr_egr,
			userEmail: email,
			branchId: resolved.branch.id,
			metadata: { co_cta_ingr_egr, message: res.message }
		});

		return {
			success: true,
			message: res.message || `Cuenta "${co_cta_ingr_egr}" eliminada correctamente.`
		};
	}, 'delete')
};

