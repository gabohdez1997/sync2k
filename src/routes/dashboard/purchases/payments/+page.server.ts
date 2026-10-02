import { protectLoad } from '$lib/server/permissions';
import { hasPermission } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_payments', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw new Error('Perfil no cargado.');

	const canCreate = hasPermission(profile, 'pur_payments', 'create');
	if (!canCreate) {
		throw redirect(303, '/dashboard/purchases/payments/history');
	}

	const allowedBranches = profile.allowed_branches || [];
	if (allowedBranches.length === 0) {
		return {
			branches: [],
			selectedBranchId: '',
			cajas: [],
			cuentasBancarias: [],
			bancos: [],
			tarjetasCredito: [],
			conceptosIslr: [],
			activeRate: 1,
			error: 'No tienes sucursales asignadas.'
		};
	}

	const urlBranchId = url.searchParams.get('branch_id');
	const selectedBranch = urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : allowedBranches[0];
	const selectedBranchId = selectedBranch ? selectedBranch.id : '';

	let cajas: any[] = [];
	let cuentasBancarias: any[] = [];
	let bancos: any[] = [];
	let tarjetasCredito: any[] = [];
	let conceptosIslr: any[] = [];
	let activeRate = 1;
	let errorMsg = '';

	if (selectedBranchId) {
		try {
			const fetchCatalog = async (name: string) => {
				const res = await fetch(`/api/agent/catalogos/${name}?branch_id=${selectedBranchId}`);
				if (res.ok) {
					const jsonRes = await res.json();
					return jsonRes.success && jsonRes.data ? jsonRes.data : [];
				}
				return [];
			};

			const [cRes, cbRes, bRes, tRes, islrRes, tasaRes] = await Promise.all([
				fetchCatalog('cajas'),
				fetchCatalog('cuentas_bancarias'),
				fetchCatalog('bancos'),
				fetchCatalog('tarjetas_credito'),
				fetch(`/api/agent/payables/conceptos-islr?branch_id=${selectedBranchId}`).then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] })),
				fetch(`/api/agent/tasa?branch_id=${selectedBranchId}`).then(r => r.ok ? r.json() : { tasa: 1 }).catch(() => ({ tasa: 1 }))
			]);

			cajas = cRes;
			cuentasBancarias = cbRes;
			bancos = bRes;
			tarjetasCredito = tRes;
			conceptosIslr = islrRes.data || [];
			if (tasaRes && Number(tasaRes.tasa || tasaRes.data?.tasa || 0) > 0) {
				activeRate = Number(tasaRes.tasa || tasaRes.data?.tasa);
			}
		} catch (err: any) {
			errorMsg = `Error al cargar catálogos desde el agente: ${err.message}`;
		}
	}

	return {
		title: 'Registrar Pago a Proveedor',
		branches: allowedBranches,
		selectedBranchId,
		cajas,
		cuentasBancarias,
		bancos,
		tarjetasCredito,
		conceptosIslr,
		activeRate,
		error: errorMsg || null
	};
});
