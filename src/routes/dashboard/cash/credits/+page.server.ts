// src/routes/dashboard/cash/credits/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { supabaseAdmin } from '$lib/server/supabase';
import { hasPermission } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('cash_credits', async ({ url, locals }) => {
    const profile = (locals as any).profile;
    if (!profile) throw new Error('Perfil no cargado.');

    const allowedBranches = profile.allowed_branches || [];
    const permissions = {
        canCreate: hasPermission(profile, 'cash_credits', 'create'),
        canVoid: hasPermission(profile, 'cash_credits', 'void'),
        canDelete: hasPermission(profile, 'cash_credits', 'delete'),
        canUpdate: hasPermission(profile, 'cash_credits', 'update'),
        canSeeOthers: hasPermission(profile, 'cash_credits', 'others')
    };

    if (allowedBranches.length === 0) {
        return {
            title: 'Devoluciones de Ventas',
            branches: [],
            printers: [],
            selectedBranchId: '',
            permissions,
            error: 'No tienes sucursales asignadas.'
        };
    }

    const urlBranchId = url.searchParams.get('branch_id');
    const selectedBranch = urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : allowedBranches[0];

    const branchIds = allowedBranches.map((b: any) => b.id);
    let printers: any[] = [];
    if (branchIds.length > 0) {
        const { data: pData, error: pErr } = await supabaseAdmin
            .from('printers')
            .select('id, name, ip_address, port, is_active, sublines, branch_id')
            .in('branch_id', branchIds)
            .eq('is_active', true);
        
        if (!pErr && pData) {
            printers = pData;
        }
    }

    return {
        title: 'Devoluciones de Ventas',
        branches: allowedBranches,
        printers,
        userProfile: profile,
        selectedBranchId: selectedBranch ? selectedBranch.id : '',
        permissions
    };
});
