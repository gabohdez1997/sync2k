// src/routes/dashboard/cash/payments/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('cash_payments', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw new Error('Perfil no cargado.');

	const allowedBranches = profile.allowed_branches || [];
	if (allowedBranches.length === 0) {
		return {
			branches: [],
			selectedBranchId: '',
			cajas: [],
			cuentasBancarias: [],
			bancos: [],
			tarjetasCredito: [],
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

			const [cRes, cbRes, bRes, tRes] = await Promise.all([
				fetchCatalog('cajas'),
				fetchCatalog('cuentas_bancarias'),
				fetchCatalog('bancos'),
				fetchCatalog('tarjetas_credito')
			]);

			cajas = cRes;
			cuentasBancarias = cbRes;
			bancos = bRes;
			tarjetasCredito = tRes;
		} catch (err: any) {
			errorMsg = `Error al cargar catálogos desde el agente: ${err.message}`;
		}
	}

	return {
		title: 'Registrar Cobro',
		branches: allowedBranches,
		selectedBranchId,
		cajas,
		cuentasBancarias,
		bancos,
		tarjetasCredito,
		error: errorMsg || null
	};
});
