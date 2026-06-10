// src/routes/dashboard/billing/+page.server.ts
import { protectLoad } from '$lib/server/permissions';
import { supabaseAdmin } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('cash_billing', async ({ url, locals }) => {
    const profile = (locals as any).profile;
    if (!profile) throw new Error('Perfil no cargado.');

    const allowedBranches = profile.allowed_branches || [];
    if (allowedBranches.length === 0) {
        return {
            branches: [],
            printers: [],
            selectedBranchId: '',
            error: 'No tienes sucursales asignadas.'
        };
    }

    const urlBranchId = url.searchParams.get('branch_id');
    const selectedBranch = urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : allowedBranches[0];

    // Consultar impresoras activas para esta sucursal desde Supabase
    let printers: any[] = [];
    if (selectedBranch) {
        const { data: pData, error: pErr } = await supabaseAdmin
            .from('printers')
            .select('id, name, ip_address, port, is_active')
            .eq('branch_id', selectedBranch.id)
            .eq('is_active', true);
        
        if (!pErr && pData) {
            printers = pData;
        }
    }

    return {
        title: 'Facturación / Nota de Entrega',
        branches: allowedBranches,
        printers,
        selectedBranchId: selectedBranch ? selectedBranch.id : ''
    };
});
