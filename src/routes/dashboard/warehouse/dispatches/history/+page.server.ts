// src/routes/dashboard/warehouse/dispatches/history/+page.server.ts
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
            dispatches: [],
            pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
            error: 'No tienes sucursales asignadas.'
        };
    }

    const urlBranchId = url.searchParams.get('branch_id');
    const selectedBranch = urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : allowedBranches[0];

    if (!selectedBranch || !selectedBranch.agent_url) {
        return {
            branches: allowedBranches,
            selectedBranchId: selectedBranch ? selectedBranch.id : '',
            dispatches: [],
            pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
            error: 'Sucursal no configurada con URL de agente.'
        };
    }

    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '12', 10);
    const search = url.searchParams.get('search') || '';
    const fec_d = url.searchParams.get('fec_d') || '';
    const fec_h = url.searchParams.get('fec_h') || '';
    const status = url.searchParams.get('status') || '';

    const agentClient = new AgentClient({
        slug: selectedBranch.id,
        agent_url: selectedBranch.agent_url,
        agent_api_key: selectedBranch.agent_token
    }, profile, fetch);

    let dispatches: any[] = [];
    let pagination = { page, limit, total: 0, totalPages: 0 };

    try {
        const filters: Record<string, string> = { sede: selectedBranch.id };
        if (search) filters.search = search;
        if (fec_d) filters.fec_d = fec_d;
        if (fec_h) filters.fec_h = fec_h;
        if (status) filters.status = status;

        const res = await agentClient.getDispatches(filters, page, limit);

        if (res && res.success) {
            dispatches = res.data || [];
            const pag = res.pagination || {} as any;
            const rawRes = res as any;
            const total = pag.total || rawRes.total_items || dispatches.length;
            const totalPages = pag.pages || pag.totalPages || rawRes.total_pages || Math.ceil(total / limit) || 1;
            pagination = { page: pag.currentPage || rawRes.page || page, limit, total, totalPages };
        }
    } catch (e: any) {
        console.error('[DISPATCHES HISTORY LOAD] Error:', e.message);
    }

    const canCreate = hasPermission(profile, 'inv_dispatches', 'create');
    const canUpdate = hasPermission(profile, 'inv_dispatches', 'update');
    const canDelete = hasPermission(profile, 'inv_dispatches', 'delete');
    const canVoid   = hasPermission(profile, 'inv_dispatches', 'void');

    return {
        title: 'Historial de Despachos',
        branches: allowedBranches,
        selectedBranchId: selectedBranch.id,
        selectedBranch,
        dispatches,
        pagination,
        total: pagination.total,
        page: pagination.page,
        totalPages: pagination.totalPages,
        filters: { search, fec_d, fec_h, status },
        canCreate,
        canUpdate,
        canDelete,
        canVoid
    };
});

export const actions: Actions = {
    deleteDispatch: protectAction('inv_dispatches', async ({ request, locals, fetch }) => {
        const profile = (locals as any).profile;
        if (!hasPermission(profile, 'inv_dispatches', 'delete')) {
            return fail(403, { success: false, message: 'No tienes permiso para ELIMINAR notas de despacho.' });
        }

        const formData = await request.formData();
        const branchId = formData.get('branch_id') as string;
        const docNum = (formData.get('doc_num') as string || '').trim();
        const password = String(formData.get('password') || '');

        if (!docNum) return fail(400, { success: false, message: 'Número de despacho no proporcionado.' });
        if (!branchId) return fail(400, { success: false, message: 'Sucursal no válida.' });
        if (!password) return fail(400, { success: false, message: 'La contraseña es requerida para confirmar la eliminación.' });

        const email = (locals as any).session?.user?.email;
        if (!email) return fail(401, { success: false, message: 'Sesión no válida.' });

        // Confirmación de seguridad con contraseña del usuario
        const { error: authErr } = await (locals as any).supabase.auth.signInWithPassword({ email, password });
        if (authErr) return fail(401, { success: false, message: 'Contraseña de confirmación incorrecta.' });

        const branch = (profile.allowed_branches || []).find((b: any) => b.id === branchId);
        if (!branch || !branch.agent_url) {
            return fail(400, { success: false, message: 'Sucursal no válida o sin agente configurado.' });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, fetch);

        try {
            const res = await agentClient.deleteDispatch(docNum, branch.id);
            if (!res.success) {
                return fail(400, { success: false, message: res.message || 'Error al eliminar despacho.' });
            }

            await logAction({
                profile_id: profile.id,
                module: 'inv_dispatches',
                action: 'DELETE',
                description: `Nota de Despacho N° ${docNum} eliminada físicamente de la base de datos.`,
                branch_id: branch.id,
                details: { doc_num: docNum }
            });

            return { success: true, message: `Despacho N° ${docNum} eliminado correctamente y stock revertido.` };
        } catch (err: any) {
            return fail(500, { success: false, message: err.message || 'Error interno al eliminar despacho.' });
        }
    }, 'delete'),

    voidDispatch: protectAction('inv_dispatches', async ({ request, locals, fetch }) => {
        const profile = (locals as any).profile;
        if (!hasPermission(profile, 'inv_dispatches', 'void') && !hasPermission(profile, 'inv_dispatches', 'delete')) {
            return fail(403, { success: false, message: 'No tienes permiso para ANULAR notas de despacho.' });
        }

        const formData = await request.formData();
        const branchId = formData.get('branch_id') as string;
        const docNum = (formData.get('doc_num') as string || '').trim();
        const reason = (formData.get('reason') as string || 'Anulación desde interfaz web').trim();
        const password = String(formData.get('password') || '');

        if (!docNum) return fail(400, { success: false, message: 'Número de despacho no proporcionado.' });
        if (!branchId) return fail(400, { success: false, message: 'Sucursal no válida.' });
        if (!password) return fail(400, { success: false, message: 'La contraseña es requerida para confirmar la anulación.' });

        const email = (locals as any).session?.user?.email;
        if (!email) return fail(401, { success: false, message: 'Sesión no válida.' });

        // Confirmación de seguridad con contraseña del usuario
        const { error: authErr } = await (locals as any).supabase.auth.signInWithPassword({ email, password });
        if (authErr) return fail(401, { success: false, message: 'Contraseña de confirmación incorrecta.' });

        const branch = (profile.allowed_branches || []).find((b: any) => b.id === branchId);
        if (!branch || !branch.agent_url) {
            return fail(400, { success: false, message: 'Sucursal no válida o sin agente configurado.' });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, fetch);

        try {
            const res = await agentClient.voidDispatch(docNum, reason, branch.id);
            if (!res.success) {
                return fail(400, { success: false, message: res.message || 'Error al anular despacho.' });
            }

            await logAction({
                profile_id: profile.id,
                module: 'inv_dispatches',
                action: 'UPDATE',
                description: `Nota de Despacho N° ${docNum} anulada. Motivo: ${reason || 'Sin motivo especificado'}`,
                branch_id: branch.id,
                details: { doc_num: docNum, reason }
            });

            return { success: true, message: `Despacho N° ${docNum} anulado correctamente y cantidades pendientes restauradas.` };
        } catch (err: any) {
            return fail(500, { success: false, message: err.message || 'Error interno al anular despacho.' });
        }
    }, 'void'),

    getDispatchDetail: protectAction('inv_dispatches', async ({ request, locals, fetch }) => {
        const profile = (locals as any).profile;
        const formData = await request.formData();
        const branchId = formData.get('branch_id') as string;
        const docNum = formData.get('doc_num') as string;

        const branch = (profile.allowed_branches || []).find((b: any) => b.id === branchId);
        if (!branch || !branch.agent_url) {
            return fail(400, { message: 'Sucursal no válida.' });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, fetch);

        try {
            const res = await agentClient.getDispatch(docNum, branch.id);
            return { success: true, dispatch: res?.data || null };
        } catch (err: any) {
            return fail(500, { message: err.message || 'Error consultando detalle de despacho.' });
        }
    })
};
