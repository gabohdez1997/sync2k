import { protectLoad } from '$lib/server/permissions';
import { hasPermission } from '$lib/server/auth';
import { getBranches } from '$lib/server/branches';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('cash_payments', async ({ url, locals, fetch }) => {
	const profile = (locals as any).profile;
	if (!profile) throw new Error('Perfil no cargado.');

	const canCreate = hasPermission(profile, 'cash_payments', 'create');
	if (!canCreate) {
		throw redirect(303, '/dashboard/cash/payments/history');
	}

	const profileAllowed = profile.allowed_branches || [];
	if (profileAllowed.length === 0) {
		return {
			branches: [],
			selectedBranchId: '',
			cajas: [],
			cuentasBancarias: [],
			bancos: [],
			tarjetasCredito: [],
			conceptosIslr: [],
			tabuladores: [],
			unidadTributaria: 43,
			error: 'No tienes sucursales asignadas.'
		};
	}

	const dbBranches = await getBranches(fetch).catch(() => []);
	const allowedBranches = profileAllowed.map((pb: any) => {
		const match = dbBranches.find((db: any) => db.id === pb.id);
		return match ? { ...pb, ...match } : pb;
	});

	const urlBranchId = url.searchParams.get('branch_id');
	const selectedBranch = urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : allowedBranches[0];
	const selectedBranchId = selectedBranch ? selectedBranch.id : '';

	let cajas: any[] = [];
	let cuentasBancarias: any[] = [];
	let bancos: any[] = [];
	let tarjetasCredito: any[] = [];
	let conceptosIslr: any[] = [];
	let tabuladores: any[] = [];
	let unidadTributaria = 43;
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

			const [cRes, cbRes, bRes, tRes, islrRes] = await Promise.all([
				fetchCatalog('cajas'),
				fetchCatalog('cuentas_bancarias'),
				fetchCatalog('bancos'),
				fetchCatalog('tarjetas_credito'),
				fetch(`/api/agent/payables/conceptos-islr?branch_id=${selectedBranchId}`)
					.then((r) => (r.ok ? r.json() : { data: [], tabuladores: [], unidad_tributaria: 43 }))
					.catch(() => ({ data: [], tabuladores: [], unidad_tributaria: 43 }))
			]);

			cajas = cRes;
			cuentasBancarias = cbRes;
			bancos = bRes;
			tarjetasCredito = tRes;
			conceptosIslr = islrRes.data || [];
			tabuladores = islrRes.tabuladores || [];
			unidadTributaria = islrRes.unidad_tributaria || 43;
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
		conceptosIslr,
		tabuladores,
		unidadTributaria,
		error: errorMsg || null
	};
});
