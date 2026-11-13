import { protectLoad } from '$lib/server/permissions';
import { hasPermission } from '$lib/server/auth';
import { resolveBankBranchClient } from '$lib/server/banks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('bank_movements', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw new Error('Perfil no cargado.');

	const canCreate = hasPermission(profile, 'bank_movements', 'create');
	const canEdit = hasPermission(profile, 'bank_movements', 'update');
	const canSeeOthers = hasPermission(profile, 'bank_movements', 'others');

	const allowedBranches = profile.allowed_branches || [];
	if (allowedBranches.length === 0) {
		return {
			branches: [],
			selectedBranchId: '',
			canCreate,
			canEdit,
			canSeeOthers,
			cuentasBancarias: [],
			cuentasIngrEgr: [],
			tasaActual: 1,
			defaults: { cta_ingr_egr_ingreso: '01', cta_ingr_egr_egreso: '02' },
			editMovement: null,
			editError: '',
			error: 'No tienes sucursales asignadas.'
		};
	}

	const urlBranchId = url.searchParams.get('branch_id');
	const selectedBranch = (urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : null) || allowedBranches[0];
	const selectedBranchId = selectedBranch?.id || '';

	let cuentasBancarias: any[] = [];
	let cuentasIngrEgr: any[] = [];
	let tasaActual = 1;
	let defaults = { cta_ingr_egr_ingreso: '01', cta_ingr_egr_egreso: '02' };
	let editMovement: any = null;
	let editError = '';
	let errorMsg = '';

	const resolved = resolveBankBranchClient(profile, selectedBranchId, fetch);
	if ('error' in resolved) {
		errorMsg = resolved.error;
	} else {
		try {
			const catRes: any = await resolved.agentClient.request<any>(
				`/bancos/catalogos?sede=${encodeURIComponent(resolved.branch.id)}`
			);
			if (catRes?.success) {
				cuentasBancarias = catRes.cuentas_bancarias || [];
				cuentasIngrEgr = catRes.cuentas_ingr_egr || [];
				tasaActual = Number(catRes.tasa || 1);
				if (catRes.defaults) defaults = catRes.defaults;
			} else {
				errorMsg = catRes?.message || 'No se pudieron cargar los catálogos bancarios.';
			}
		} catch (e: any) {
			errorMsg = 'Error conectando con el agente: ' + e.message;
		}

		const editMovNum = url.searchParams.get('edit_mov')?.trim();
		if (editMovNum) {
			if (!canEdit) {
				editError = 'No tienes permiso para editar movimientos bancarios.';
			} else {
				try {
					const detRes: any = await resolved.agentClient.request<any>(
						`/bancos/movimientos/${encodeURIComponent(editMovNum)}?sede=${encodeURIComponent(resolved.branch.id)}`
					);
					if (detRes?.success && detRes.data) {
						const mov = detRes.data;
						const profitUser = (profile.profit_user || '').trim().toUpperCase();
						const owner = String(mov.co_us_in || '').trim().toUpperCase();
						if (!canSeeOthers && (!profitUser || (owner && owner !== profitUser))) {
							editError = 'No tienes permiso para editar movimientos creados por otros usuarios.';
						} else if (mov.anulado) {
							editError = `El movimiento ${mov.mov_num} se encuentra anulado y no puede editarse.`;
						} else if (mov.conciliado) {
							editError = `El movimiento ${mov.mov_num} ya está conciliado y no puede editarse.`;
						} else if (mov.origen !== 'BAN') {
							editError = `El movimiento ${mov.mov_num} proviene del módulo ${mov.origen} y solo puede modificarse desde su origen.`;
						} else {
							editMovement = mov;
						}
					} else {
						editError = detRes?.message || `Movimiento ${editMovNum} no encontrado.`;
					}
				} catch (e: any) {
					editError = 'Error consultando el movimiento a editar: ' + e.message;
				}
			}
		}
	}

	return {
		branches: allowedBranches,
		selectedBranchId,
		canCreate,
		canEdit,
		canSeeOthers,
		cuentasBancarias,
		cuentasIngrEgr,
		tasaActual,
		defaults,
		editMovement,
		editError,
		error: errorMsg
	};
});

