// src/routes/dashboard/warehouse/receipts/+page.server.ts
import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { logAction } from '$lib/server/audit';
import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('inv_receipts', async ({ url, locals, fetch }) => {
    const profile = (locals as any).profile;
    if (!profile) throw new Error('Perfil no cargado.');

    const allowedBranches = profile.allowed_branches || [];
    if (allowedBranches.length === 0) {
        return {
            branches: [],
            selectedBranchId: '',
            defaultWarehouse: '01',
            tasa: 1,
            error: 'No tienes sucursales asignadas.'
        };
    }

    const urlBranchId = url.searchParams.get('branch_id');
    const selectedBranch = urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : allowedBranches[0];

    if (!selectedBranch || !selectedBranch.agent_url) {
        return {
            branches: allowedBranches,
            selectedBranchId: selectedBranch ? selectedBranch.id : '',
            defaultWarehouse: '01',
            tasa: 1,
            error: 'Sucursal no configurada con URL de agente.'
        };
    }

    const agentClient = new AgentClient({
        slug: selectedBranch.id,
        agent_url: selectedBranch.agent_url,
        agent_api_key: selectedBranch.agent_token
    }, profile, fetch);

    // Obtener almacenes y tasa de cambio
    let defaultWarehouse = '01';
    let warehouses: any[] = [];
    let currentTasa = 1;

    try {
        const [almaRes, tasaRes] = await Promise.all([
            agentClient.request<any>(`/catalogos/almacenes?sede=${selectedBranch.id}`).catch(() => ({ data: [] })),
            agentClient.getExchangeRate().catch(() => ({ tasa: 1 }))
        ]);

        warehouses = (almaRes as any).data || (almaRes as any).items || (Array.isArray(almaRes) ? almaRes : []);
        const foundDefault = warehouses.find((w: any) => w.campo1 === 'DEFAULT' || w.co_alma?.trim() === '01' || w.default === true) || warehouses[0];
        if (foundDefault) {
            defaultWarehouse = foundDefault.co_alma.trim();
        }

        currentTasa = Number((tasaRes as any)?.tasa || (tasaRes as any)?.data?.tasa || 1);
    } catch (e) {
        console.warn('[RECEIPTS LOAD] Advertencia cargando catálogos:', e);
    }

    const docNum = url.searchParams.get('doc_num');
    let preloadedReceipt = null;
    if (docNum) {
        try {
            const res = await agentClient.getReceivingNote(docNum, selectedBranch.id);
            preloadedReceipt = res?.data || null;
        } catch (e) {
            console.error('[RECEIPTS LOAD] Error precargando nota de recepción:', e);
        }
    }

    const canCreate = hasPermission(profile, 'inv_receipts', 'create');
    const canUpdate = hasPermission(profile, 'inv_receipts', 'update');
    const canVoid = hasPermission(profile, 'inv_receipts', 'void');

    return {
        title: 'Nota de Recepción de Almacén',
        branches: allowedBranches,
        selectedBranchId: selectedBranch.id,
        selectedBranch,
        warehouses,
        defaultWarehouse,
        tasa: currentTasa,
        preloadedReceipt,
        canCreate,
        canUpdate,
        canVoid
    };
});

export const actions: Actions = {
    searchPendingOrders: protectAction('inv_receipts', async ({ request, locals, fetch }) => {
        const profile = (locals as any).profile;
        const formData = await request.formData();
        const branchId = formData.get('branch_id') as string;
        const searchQuery = (formData.get('search') as string || '').trim();

        const branch = (profile.allowed_branches || []).find((b: any) => b.id === branchId);
        if (!branch || !branch.agent_url) {
            return fail(400, { message: 'Sucursal no válida o sin agente configurado.' });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, fetch);

        try {
            const res = await agentClient.getPendingPurchaseOrders({ search: searchQuery });
            return {
                success: true,
                orders: res?.data || []
            };
        } catch (err: any) {
            console.error('[RECEIPTS ACTION] Error buscando órdenes pendientes:', err);
            return fail(500, { message: err.message || 'Error al consultar órdenes de compra.' });
        }
    }),

    getOrderDetail: protectAction('inv_receipts', async ({ request, locals, fetch }) => {
        const profile = (locals as any).profile;
        const formData = await request.formData();
        const branchId = formData.get('branch_id') as string;
        const docNum = (formData.get('doc_num') as string || '').trim();

        const branch = (profile.allowed_branches || []).find((b: any) => b.id === branchId);
        if (!branch || !branch.agent_url) {
            return fail(400, { message: 'Sucursal no válida o sin agente configurado.' });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, fetch);

        try {
            const res = await agentClient.getPendingPurchaseOrderDetail(docNum);
            return {
                success: true,
                order: res?.data || null
            };
        } catch (err: any) {
            console.error('[RECEIPTS ACTION] Error cargando detalle de orden:', err);
            return fail(500, { message: err.message || 'Error al consultar detalle de orden de compra.' });
        }
    }),

    saveReceipt: protectAction('inv_receipts', async ({ request, locals, fetch }) => {
        const profile = (locals as any).profile;
        const formData = await request.formData();
        const branchId = formData.get('branch_id') as string;
        const payloadJson = formData.get('payload') as string;

        if (!payloadJson) {
            return fail(400, { message: 'No se enviaron datos de recepción.' });
        }

        let payload: any;
        try {
            payload = JSON.parse(payloadJson);
        } catch (e) {
            return fail(400, { message: 'Formato de datos inválido.' });
        }

        const isEditing = !!(payload.isEditing || payload.doc_num);
        if (isEditing && !hasPermission(profile, 'inv_receipts', 'update')) {
            return fail(403, { message: 'No tienes permiso para EDITAR notas de recepción.' });
        }
        if (!isEditing && !hasPermission(profile, 'inv_receipts', 'create')) {
            return fail(403, { message: 'No tienes permiso para CREAR notas de recepción.' });
        }

        const branch = (profile.allowed_branches || []).find((b: any) => b.id === branchId);
        if (!branch || !branch.agent_url) {
            return fail(400, { message: 'Sucursal no válida o sin agente configurado.' });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, fetch);

        try {
            const saveRes = await agentClient.saveReceivingNote(payload);

            if (!saveRes.success) {
                return fail(400, { message: saveRes.message || 'Error al procesar la nota de recepción en el servidor.' });
            }

            const docNum = saveRes.data?.doc_num || saveRes.doc_num;

            // Registrar log de auditoría
            await logAction({
                profile_id: profile.id,
                module: 'inv_receipts',
                action: 'CREATE',
                description: `Nota de Recepción N° ${docNum} creada para proveedor ${payload.co_prov} (OC: ${payload.doc_num_oc || '---'})`,
                branch_id: branch.id,
                details: {
                    doc_num: docNum,
                    co_prov: payload.co_prov,
                    doc_num_oc: payload.doc_num_oc,
                    total_neto: saveRes.data?.total_neto,
                    total_art: saveRes.data?.total_art,
                    almacen_ingreso: saveRes.data?.almacen_ingreso
                }
            });

            return {
                success: true,
                doc_num: docNum,
                branch_id: branch.id,
                message: `Nota de Recepción ${docNum} procesada exitosamente.`
            };
        } catch (err: any) {
            console.error('[RECEIPTS ACTION] Error guardando nota de recepción:', err);
            return fail(500, { message: err.message || 'Error interno procesando nota de recepción.' });
        }
    }, 'create')
};
