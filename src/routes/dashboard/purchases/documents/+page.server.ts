import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_documents', async ({ url, locals, fetch }) => {
    const profile = (locals as any).profile;
    if (!profile) throw new Error('Perfil no cargado.');

    const editTipo = url.searchParams.get('edit_tipo')?.trim() || '';
    const editNro = url.searchParams.get('edit_nro')?.trim() || '';
    const isEditMode = Boolean(editTipo && editNro);

    const canCreate = hasPermission(profile, 'pur_documents', 'create');
    const canEdit = hasPermission(profile, 'pur_documents', 'update') || canCreate;

    if ((!isEditMode && !canCreate) || (isEditMode && !canEdit)) {
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
            editDocument: null,
            editError: null,
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
    let editDocument: any = null;
    let editError: string | null = null;

    if (selectedBranch && selectedBranch.agent_url) {
        try {
            const agentClient = new AgentClient({
                slug: selectedBranch.id,
                agent_url: selectedBranch.agent_url,
                agent_api_key: selectedBranch.agent_token
            }, profile, fetch);

            const requests: Promise<any>[] = [
                agentClient.request<any>('/catalogos/tasa').catch(() => null),
                agentClient.request<any>('/catalogos/condiciones-pago').catch(() => null),
                agentClient.request<any>('/documentos-compra/cuentas').catch(() => null),
                agentClient.request<any>('/documentos-compra/tipos').catch(() => null)
            ];

            if (isEditMode) {
                requests.push(
                    agentClient.request<any>(
                        `/documentos-compra/${encodeURIComponent(editTipo)}/${encodeURIComponent(editNro)}?sede=${encodeURIComponent(selectedBranch.id)}`
                    ).catch((err: any) => ({ success: false, message: err.message }))
                );
            }

            const [tasaRes, condRes, ctasRes, tiposRes, docRes] = await Promise.all(requests);

            const tasaData = (tasaRes as any)?.data || (Array.isArray(tasaRes) ? tasaRes : []);
            if (tasaData.length > 0 && Number(tasaData[0].tasa) > 0) {
                activeRate = Number(tasaData[0].tasa);
            }

            paymentConditions = (condRes as any)?.data || (Array.isArray(condRes) ? condRes : []);
            expenseAccounts = (ctasRes as any)?.data || [];
            docTypes = (tiposRes as any)?.data || [];

            if (isEditMode) {
                if (docRes?.success && docRes?.data) {
                    editDocument = docRes.data;
                } else {
                    editError = docRes?.message || `No se pudo cargar el documento ${editTipo} ${editNro} para editar.`;
                }
            }
        } catch (e: any) {
            console.warn('[DOCS COMPRA LOAD] Error al cargar catálogos:', e.message);
        }
    }

    return {
        title: isEditMode ? `Editar Documento ${editTipo} ${editNro}` : 'Documentos de Compra',
        branches: allowedBranches,
        selectedBranchId: selectedBranch ? selectedBranch.id : '',
        activeRate,
        paymentConditions,
        expenseAccounts,
        docTypes,
        editDocument,
        editError,
        canCreate,
        canEdit,
        canSeeOthers
    };
});

