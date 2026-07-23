import type { PageServerLoad } from './$types';
import { protectLoad } from '$lib/server/permissions';
import { supabaseAdmin } from '$lib/server/supabase';
import { hasPermission } from '$lib/server/auth';

export const load: PageServerLoad = protectLoad('inv_transfers', async ({ url, locals }) => {
	const profile = (locals as any).profile;

	const canCreate = hasPermission(profile, 'inv_transfers', 'create');
	const canEdit = hasPermission(profile, 'inv_transfers', 'edit');
	const canVoid = hasPermission(profile, 'inv_transfers', 'void');

	// Cargar sedes activas
	const { data: dbBranches, error: bErr } = await supabaseAdmin
		.from('branches')
		.select('*')
		.eq('active', true)
		.order('name');

	if (bErr) {
		console.error('[TRASLADOS] Error al cargar sucursales:', bErr);
	}

	const branches = dbBranches || [];

	// Preseleccionar una sede por defecto (preferir la sede asignada al usuario o la primera disponible)
	let defaultBranchId = 'all';
	if (profile?.branch_id && branches.some((b: any) => b.id === profile.branch_id)) {
		defaultBranchId = profile.branch_id;
	} else if (branches.length > 0) {
		defaultBranchId = branches[0].id;
	}

	const selectedBranchId = url.searchParams.get('branch_id') || defaultBranchId;

	// Cargar traslados desde Supabase / PG
	let query = supabaseAdmin
		.from('stock_transfers')
		.select(`
			*,
			source_branch:branches!stock_transfers_source_branch_id_fkey(id, name),
			target_branch:branches!stock_transfers_target_branch_id_fkey(id, name),
			items:stock_transfer_items(*)
		`)
		.order('created_at', { ascending: false });

	if (selectedBranchId && selectedBranchId !== 'all') {
		query = query.or(`source_branch_id.eq.${selectedBranchId},target_branch_id.eq.${selectedBranchId}`);
	}

	const { data: transfers, error: tErr } = await query;

	if (tErr) {
		console.error('[TRASLADOS] Error al cargar traslados:', tErr);
	}

	return {
		title: 'Traslado de Artículos entre Sedes',
		branches,
		selectedBranchId,
		transfers: transfers || [],
		canCreate,
		canEdit,
		canVoid,
		userBranchId: profile?.branch_id || null
	};
});
