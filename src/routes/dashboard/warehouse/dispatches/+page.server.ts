// src/routes/dashboard/warehouse/dispatches/+page.server.ts
import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { logAction } from '$lib/server/audit';
import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('inv_dispatches', async ({ url, locals, fetch }) => {
    const profile = (locals as any).profile;
    if (!profile) throw new Error('Perfil no cargado.');

    const allowedBranches = profile.allowed_branches || [];
    if (allowedBranches.length === 0) {
        return {
            branches: [],
            selectedBranchId: '',
            defaultWarehouse: '01',
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
            error: 'Sucursal no configurada con URL de agente.'
        };
    }

    const agentClient = new AgentClient({
        slug: selectedBranch.id,
        agent_url: selectedBranch.agent_url,
        agent_api_key: selectedBranch.agent_token
    }, profile, fetch);

    // Obtener almacenes de la sede
    let defaultWarehouse = (selectedBranch.default_warehouse || '').trim();
    let warehouses: any[] = [];

    try {
        const almaRes = await agentClient.request<any>(`/catalogos/almacenes?sede=${selectedBranch.id}`).catch(() => ({ data: [] }));
        warehouses = (almaRes as any).data || (almaRes as any).items || (Array.isArray(almaRes) ? almaRes : []);

        const starCode = (selectedBranch.profit_branch_codes || []).find((c: any) => c.is_default)?.code?.trim();
        const candidate = defaultWarehouse || starCode || '01';

        const foundDefault = warehouses.find((w: any) => w.co_alma?.trim() === candidate)
            || warehouses.find((w: any) => w.co_alma?.trim() === starCode)
            || warehouses.find((w: any) => w.campo1 === 'DEFAULT' || w.default === true)
            || warehouses[0];

        if (foundDefault) {
            defaultWarehouse = foundDefault.co_alma.trim();
        } else if (!defaultWarehouse) {
            defaultWarehouse = starCode || '01';
        }
    } catch (e) {
        console.warn('[DISPATCHES LOAD] Advertencia cargando almacenes:', e);
    }

    const docNum = url.searchParams.get('doc_num');
    let preloadedDispatch = null;
    if (docNum) {
        try {
            const res = await agentClient.getDispatch(docNum, selectedBranch.id);
            preloadedDispatch = res?.data || null;
        } catch (e) {
            console.error('[DISPATCHES LOAD] Error precargando nota de despacho:', e);
        }
    }

    const canCreate = hasPermission(profile, 'inv_dispatches', 'create');
    const canUpdate = hasPermission(profile, 'inv_dispatches', 'update');
    const canVoid   = hasPermission(profile, 'inv_dispatches', 'void');

    return {
        title: 'Despacho de Mercancía',
        branches: allowedBranches,
        selectedBranchId: selectedBranch.id,
        selectedBranch,
        warehouses,
        defaultWarehouse,
        preloadedDispatch,
        canCreate,
        canUpdate,
        canVoid
    };
});

export const actions: Actions = {
    searchPendingInvoices: protectAction('inv_dispatches', async ({ request, locals, fetch }) => {
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
            const res = await agentClient.getPendingSalesInvoices({ search: searchQuery });
            return {
                success: true,
                invoices: res?.data || []
            };
        } catch (err: any) {
            console.error('[DISPATCHES ACTION] Error buscando facturas pendientes:', err);
            return fail(500, { message: err.message || 'Error al consultar facturas de venta.' });
        }
    }),

    getInvoiceDetail: protectAction('inv_dispatches', async ({ request, locals, fetch }) => {
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
            const res = await agentClient.getPendingSalesInvoiceDetail(docNum);
            return {
                success: true,
                invoice: res?.data || null
            };
        } catch (err: any) {
            console.error('[DISPATCHES ACTION] Error cargando detalle de factura:', err);
            return fail(500, { message: err.message || 'Error al consultar detalle de factura de venta.' });
        }
    }),

    saveDispatch: protectAction('inv_dispatches', async ({ request, locals, fetch }) => {
        const profile = (locals as any).profile;
        const formData = await request.formData();
        const branchId = formData.get('branch_id') as string;
        const payloadJson = formData.get('payload') as string;

        if (!payloadJson) {
            return fail(400, { message: 'No se enviaron datos de despacho.' });
        }

        let payload: any;
        try {
            payload = JSON.parse(payloadJson);
        } catch (e) {
            return fail(400, { message: 'Formato de datos inválido.' });
        }

        const isEditing = !!(payload.isEditing || payload.doc_num);
        if (isEditing && !hasPermission(profile, 'inv_dispatches', 'update')) {
            return fail(403, { message: 'No tienes permiso para EDITAR notas de despacho.' });
        }
        if (!isEditing && !hasPermission(profile, 'inv_dispatches', 'create')) {
            return fail(403, { message: 'No tienes permiso para CREAR notas de despacho.' });
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
            const saveRes = await agentClient.saveDispatch(payload);

            if (!saveRes.success) {
                return fail(400, { message: saveRes.message || 'Error al procesar el despacho en el servidor.' });
            }

            const docNum = saveRes.data?.doc_num || saveRes.doc_num;

            // Registrar log de auditoría
            await logAction({
                profile_id: profile.id,
                module: 'inv_dispatches',
                action: 'CREATE',
                description: `Nota de Despacho N° ${docNum} procesada para cliente ${payload.co_cli} (Factura: ${payload.factura_origen || '---'})`,
                branch_id: branch.id,
                details: {
                    doc_num: docNum,
                    co_cli: payload.co_cli,
                    factura_origen: payload.factura_origen,
                    total_art: saveRes.data?.total_art
                }
            });

            return {
                success: true,
                doc_num: docNum,
                branch_id: branch.id,
                message: `Nota de Despacho ${docNum} procesada exitosamente.`
            };
        } catch (err: any) {
            console.error('[DISPATCHES ACTION] Error guardando nota de despacho:', err);
            return fail(500, { message: err.message || 'Error interno procesando nota de despacho.' });
        }
    }, 'create')
};
