import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_documents', async ({ url, locals, fetch }) => {
    const profile = (locals as any).profile;
    if (!profile) throw new Error('Perfil no cargado.');

    const canCreate = hasPermission(profile, 'pur_documents', 'create');
    if (!canCreate) {
        throw redirect(303, '/dashboard/purchases/documents/history');
    }

    const allowedBranches = profile.allowed_branches || [];
    if (allowedBranches.length === 0) {
        return {
            title: 'Documentos de Compra',
            branches: [],
            selectedBranchId: '',
            activeRate: 1,
            paymentConditions: [],
            expenseAccounts: [],
            docTypes: [],
            error: 'No tienes sucursales asignadas.'
        };
    }

    const urlBranchId = url.searchParams.get('branch_id');
    const selectedBranch = urlBranchId 
        ? allowedBranches.find((b: any) => b.id === urlBranchId) 
        : allowedBranches[0];

    const canSeeOthers = hasPermission(profile, 'pur_documents', 'others');

    let activeRate = 1;
    let paymentConditions: any[] = [];
    let expenseAccounts: any[] = [];
    let docTypes: any[] = [];

    if (selectedBranch && selectedBranch.agent_url) {
        try {
            const agentClient = new AgentClient({
                slug: selectedBranch.id,
                agent_url: selectedBranch.agent_url,
                agent_api_key: selectedBranch.agent_token
            }, profile, fetch);

            const [tasaRes, condRes, ctasRes, tiposRes] = await Promise.all([
                agentClient.request<any>('/catalogos/tasa').catch(() => null),
                agentClient.request<any>('/catalogos/condiciones-pago').catch(() => null),
                agentClient.request<any>('/documentos-compra/cuentas').catch(() => null),
                agentClient.request<any>('/documentos-compra/tipos').catch(() => null)
            ]);

            const tasaData = (tasaRes as any)?.data || (Array.isArray(tasaRes) ? tasaRes : []);
            if (tasaData.length > 0 && Number(tasaData[0].tasa) > 0) {
                activeRate = Number(tasaData[0].tasa);
            }

            paymentConditions = (condRes as any)?.data || (Array.isArray(condRes) ? condRes : []);
            expenseAccounts = (ctasRes as any)?.data || [];
            docTypes = (tiposRes as any)?.data || [];
        } catch (e: any) {
            console.warn('[DOCS COMPRA LOAD] Error al cargar catálogos:', e.message);
        }
    }

    return {
        title: 'Documentos de Compra',
        branches: allowedBranches,
        selectedBranchId: selectedBranch ? selectedBranch.id : '',
        activeRate,
        paymentConditions,
        expenseAccounts,
        docTypes,
        canCreate,
        canSeeOthers
    };
});

