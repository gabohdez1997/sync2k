import { protectLoad } from '$lib/server/permissions';
import { hasPermission } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { resolveBankBranchClient } from '$lib/server/banks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('bank_reconciliation', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw new Error('Perfil no cargado.');

	const canSave =
		hasPermission(profile, 'bank_reconciliation', 'create') ||
		hasPermission(profile, 'bank_reconciliation', 'update');
	const canSeeOthers = hasPermission(profile, 'bank_reconciliation', 'others');

	const now = new Date();
	const defaultAnio = now.getFullYear();
	const defaultMes = now.getMonth() + 1;

	const anio = parseInt(url.searchParams.get('anio') || '', 10) || defaultAnio;
	const mesRaw = parseInt(url.searchParams.get('mes') || '', 10) || defaultMes;
	const mes = mesRaw >= 1 && mesRaw <= 12 ? mesRaw : defaultMes;

	const allowedBranches = profile.allowed_branches || [];
	if (allowedBranches.length === 0) {
		return {
			branches: [],
			selectedBranchId: '',
			cuentasBancarias: [],
			selectedCodCta: '',
			anio,
			mes,
			reconciliation: null,
			canSave,
			canSeeOthers,
			hiddenOtherUsersCount: 0,
			error: 'No tienes sucursales asignadas.'
		};
	}

	const urlBranchId = url.searchParams.get('branch_id');
	const selectedBranch =
		(urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : null) || allowedBranches[0];
	const selectedBranchId = selectedBranch?.id || '';

	let cuentasBancarias: any[] = [];
	let selectedCodCta = url.searchParams.get('cod_cta')?.trim() || '';
	let reconciliation: any = null;
	let errorMsg = '';
	let hiddenOtherUsersCount = 0;

	if (!canSeeOthers && !(profile.profit_user || '').trim()) {
		return {
			branches: allowedBranches,
			selectedBranchId,
			cuentasBancarias: [],
			selectedCodCta: '',
			anio,
			mes,
			reconciliation: null,
			canSave,
			canSeeOthers,
			hiddenOtherUsersCount: 0,
			error: 'Tu perfil no tiene asociado un usuario de Profit Plus. No puedes consultar conciliaciones.'
		};
	}

	const resolved = resolveBankBranchClient(profile, selectedBranchId, fetch);
	if ('error' in resolved) {
		errorMsg = resolved.error;
	} else {
		try {
			const catRes: any = await resolved.agentClient.request<any>(
				`/bancos/catalogos?sede=${encodeURIComponent(resolved.branch.id)}`
			);
			if (catRes?.success) {
				cuentasBancarias = catRes.todas_cuentas_bancarias || catRes.cuentas_bancarias || [];
			} else {
				errorMsg = catRes?.message || 'No se pudieron cargar las cuentas bancarias.';
			}

			if (!selectedCodCta && cuentasBancarias.length > 0) {
				const firstActive = cuentasBancarias.find((c: any) => !c.inactivo) || cuentasBancarias[0];
				selectedCodCta = firstActive?.cod_cta || '';
			}

			if (selectedCodCta) {
				const [recRes, profilesRes]: [any, any] = await Promise.all([
					resolved.agentClient.request<any>(
						`/bancos/conciliacion?sede=${encodeURIComponent(resolved.branch.id)}&cod_cta=${encodeURIComponent(selectedCodCta)}&anio=${anio}&mes=${mes}`
					),
					supabaseAdmin
						.from('profiles')
						.select('profit_user, full_name')
						.not('profit_user', 'is', null)
				]);

				if (recRes?.success) {
					const userMap = new Map<string, string>();
					for (const p of profilesRes.data || []) {
						if (p.profit_user && p.full_name) {
							userMap.set(String(p.profit_user).trim().toUpperCase(), p.full_name);
						}
					}

					let rawMovs = recRes.movimientos || [];
					if (!canSeeOthers) {
						const profitUser = (profile.profit_user || '').trim().toUpperCase();
						const filtered = rawMovs.filter(
							(m: any) => String(m.co_us_in || '').trim().toUpperCase() === profitUser
						);
						hiddenOtherUsersCount = rawMovs.length - filtered.length;
						rawMovs = filtered;
					}

					reconciliation = {
						...recRes,
						movimientos: rawMovs.map((m: any) => {
							const uCode = String(m.co_us_in || '').trim().toUpperCase();
							return {
								...m,
								conciliado: Boolean(m.conciliado),
								usuario_nombre: userMap.get(uCode) || m.co_us_in || '-'
							};
						})
					};
				} else {
					errorMsg = recRes?.message || 'No se pudo consultar la conciliación de esta cuenta.';
				}
			}
		} catch (e: any) {
			errorMsg = 'Error conectando con el agente: ' + e.message;
		}
	}

	return {
		branches: allowedBranches,
		selectedBranchId,
		cuentasBancarias,
		selectedCodCta,
		anio,
		mes,
		reconciliation,
		canSave,
		canSeeOthers,
		hiddenOtherUsersCount,
		error: errorMsg
	};
});

