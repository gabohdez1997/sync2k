import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_invoices', async ({ url, locals, fetch }) => {
    const profile = (locals as any).profile;
    if (!profile) throw new Error('Perfil no cargado.');

    const canCreate = hasPermission(profile, 'pur_invoices', 'create');
    if (!canCreate) {
        throw redirect(303, '/dashboard/purchases/invoices/history');
    }

    const allowedBranches = profile.allowed_branches || [];
    if (allowedBranches.length === 0) {
        return {
            title: 'Facturas de Compra',
            branches: [],
            selectedBranchId: '',
            activeRate: 1,
            error: 'No tienes sucursales asignadas.'
        };
    }

    const urlBranchId = url.searchParams.get('branch_id');
    const selectedBranch = urlBranchId 
        ? allowedBranches.find((b: any) => b.id === urlBranchId) 
        : allowedBranches[0];

    const canSeeOthers = hasPermission(profile, 'pur_invoices', 'others');

    let activeRate = 1;
    if (selectedBranch && selectedBranch.agent_url) {
        try {
            const agentClient = new AgentClient({
                slug: selectedBranch.id,
                agent_url: selectedBranch.agent_url,
                agent_api_key: selectedBranch.agent_token
            }, profile, fetch);

            const tasaRes = await agentClient.request<any>('/catalogos/tasa');
            const data = (tasaRes as any)?.data || (Array.isArray(tasaRes) ? tasaRes : []);
            if (data.length > 0 && Number(data[0].tasa) > 0) {
                activeRate = Number(data[0].tasa);
            }
        } catch (e: any) {
            console.warn('[INVOICES LOAD] No se pudo obtener tasa activa:', e.message);
        }
    }

    return {
        title: 'Facturas de Compra',
        branches: allowedBranches,
        selectedBranchId: selectedBranch ? selectedBranch.id : '',
        activeRate,
        canCreate,
        canSeeOthers
    };
});
