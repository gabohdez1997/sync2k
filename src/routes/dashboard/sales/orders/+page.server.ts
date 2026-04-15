import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_orders', async ({ url, locals, fetch }) => {
    const profile = (locals as any).profile;
    const allowedBranches = profile.allowed_branches || [];
    
    if (allowedBranches.length === 0) {
        return { orders: [], branches: [], error: 'No tienes sucursales asignadas.' };
    }

    const urlBranchId = url.searchParams.get('branch_id');
    const selectedBranch = urlBranchId 
        ? allowedBranches.find(b => b.id === urlBranchId)
        : allowedBranches[0];

    if (!selectedBranch || !selectedBranch.agent_url) {
        return { orders: [], branches: allowedBranches, error: 'Sucursal no configurada.' };
    }

    const agentClient = new AgentClient(selectedBranch, profile, fetch);
    
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '20';
    const doc_num = url.searchParams.get('doc_num') || '';
    const co_cli = url.searchParams.get('co_cli') || '';
    
    // LÓGICA DE PRIVACIDAD
    const canSeeOthers = hasPermission(profile, 'sales_orders', 'others');
    const canCreate = hasPermission(profile, 'sales_orders', 'create');
    const canUpdate = hasPermission(profile, 'sales_orders', 'update');
    const canDelete = hasPermission(profile, 'sales_orders', 'delete');

    let co_ven = url.searchParams.get('co_ven') || '';

    if (!canSeeOthers) {
        const sellerCode = (profile.profit_user || '').trim().toUpperCase();
        if (!sellerCode) {
            return {
                orders: [], branches: allowedBranches,
                error: 'Tu perfil no tiene asociado un código de Vendedor. No puedes visualizar pedidos.',
                canSeeOthers, canCreate, canUpdate, canDelete
            };
        }
        co_ven = sellerCode;
    }

    const queryParams = new URLSearchParams({
        page, limit, doc_num, co_cli, co_ven: co_ven || ''
    });

    try {
        const res = await agentClient.request<any>(`/pedidos?${queryParams.toString()}`);
        
        return {
            orders: res.data || [],
            pagination: res.pagination || { total: 0, pages: 1, currentPage: 1, limit: 20 },
            branches: allowedBranches,
            selectedBranchId: selectedBranch.id,
            canSeeOthers, canCreate, canUpdate, canDelete,
            filters: { doc_num, co_cli, co_ven }
        };
    } catch (e: any) {
        return {
            orders: [], branches: allowedBranches,
            error: 'Error al conectar con el Agente: ' + e.message
        };
    }
});
