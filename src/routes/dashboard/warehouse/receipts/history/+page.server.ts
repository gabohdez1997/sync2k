// src/routes/dashboard/warehouse/receipts/history/+page.server.ts
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
            receipts: [],
            total: 0,
            page: 1,
            totalPages: 1,
            branches: [],
            selectedBranchId: '',
            filters: {},
            error: 'No tienes sucursales asignadas.'
        };
    }

    const urlBranchId = url.searchParams.get('branch_id');
    const selectedBranch = urlBranchId ? allowedBranches.find((b: any) => b.id === urlBranchId) : allowedBranches[0];

    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '12');
    const search = url.searchParams.get('search') || '';
    const status = url.searchParams.get('status') || '';
    const fec_d = url.searchParams.get('desde') || '';
    const fec_h = url.searchParams.get('hasta') || '';
    const orden_compra = url.searchParams.get('orden_compra') || '';

    const filters: Record<string, string> = {};
    if (search) filters.search = search;
    if (status) filters.status = status;
    if (fec_d) filters.fec_d = fec_d;
    if (fec_h) filters.fec_h = fec_h;
    if (orden_compra) filters.orden_compra = orden_compra;
    if (selectedBranch) filters.sede = selectedBranch.id;

    let receipts: any[] = [];
    let total = 0;
    let totalPages = 1;

    if (selectedBranch && selectedBranch.agent_url) {
        const agentClient = new AgentClient({
            slug: selectedBranch.id,
            agent_url: selectedBranch.agent_url,
            agent_api_key: selectedBranch.agent_token
        }, profile, fetch);

        try {
            const res = await agentClient.getReceivingNotes(filters, page, limit);
            receipts = res?.data || res?.items || [];
            total = res?.total || receipts.length;
            totalPages = res?.totalPages || Math.ceil(total / limit) || 1;
        } catch (err: any) {
            console.error('[RECEIPTS HISTORY LOAD] Error cargando historial:', err);
        }
    }

    const canCreate = hasPermission(profile, 'inv_receipts', 'create');
    const canUpdate = hasPermission(profile, 'inv_receipts', 'update') || hasPermission(profile, 'inv_receipts', 'create');
    const canDelete = hasPermission(profile, 'inv_receipts', 'delete');
    const canVoid = hasPermission(profile, 'inv_receipts', 'void') || hasPermission(profile, 'inv_receipts', 'delete');

    return {
        title: 'Historial de Notas de Recepción',
        receipts,
        total,
        page,
        totalPages,
        branches: allowedBranches,
        selectedBranchId: selectedBranch ? selectedBranch.id : '',
        canCreate,
        canUpdate,
        canDelete,
        canVoid,
        filters: { search, status, desde: fec_d, hasta: fec_h, orden_compra }
    };
});

export const actions: Actions = {
    deleteReceipt: protectAction('inv_receipts', async ({ request, locals, fetch }) => {
        const profile = (locals as any).profile;
        if (!hasPermission(profile, 'inv_receipts', 'delete')) {
            return fail(403, { success: false, message: 'No tienes permiso para ELIMINAR notas de recepción.' });
        }

        const formData = await request.formData();
        const branchId = formData.get('branch_id') as string;
        const docNum = (formData.get('doc_num') as string || '').trim();
        const password = String(formData.get('password') || '');

        if (!docNum) return fail(400, { success: false, message: 'Número de documento no especificado.' });
        if (!branchId) return fail(400, { success: false, message: 'Sucursal no válida.' });
        if (!password) return fail(400, { success: false, message: 'La contraseña es requerida para confirmar la eliminación.' });

        const email = locals.session?.user?.email;
        if (!email) return fail(401, { success: false, message: 'Sesión no válida.' });

        // Confirmación de seguridad con contraseña del usuario
        const { error: authErr } = await locals.supabase.auth.signInWithPassword({ email, password });
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
            const delRes = await agentClient.deleteReceivingNote(docNum);

            if (!delRes.success) {
                return fail(400, { success: false, message: delRes.message || 'Error al eliminar la nota de recepción.' });
            }

            // Registrar log de auditoría
            await logAction({
                profile_id: profile.id,
                module: 'inv_receipts',
                action: 'DELETE',
                description: `Nota de Recepción N° ${docNum} eliminada físicamente de la base de datos.`,
                branch_id: branch.id,
                details: {
                    doc_num: docNum,
                    delRes: delRes.data
                }
            });

            return {
                success: true,
                message: `Nota de Recepción N° ${docNum} eliminada con éxito y stock revertido.`
            };
        } catch (err: any) {
            console.error('[RECEIPTS HISTORY ACTION] Error eliminando nota de recepción:', err);
            return fail(500, { success: false, message: err.message || 'Error al eliminar nota de recepción.' });
        }
    }, 'delete'),

    voidReceipt: protectAction('inv_receipts', async ({ request, locals, fetch }) => {
        const profile = (locals as any).profile;
        if (!hasPermission(profile, 'inv_receipts', 'void') && !hasPermission(profile, 'inv_receipts', 'delete')) {
            return fail(403, { success: false, message: 'No tienes permiso para ANULAR notas de recepción.' });
        }

        const formData = await request.formData();
        const branchId = formData.get('branch_id') as string;
        const docNum = (formData.get('doc_num') as string || '').trim();
        const reason = (formData.get('reason') as string || 'Anulación desde interfaz web').trim();
        const password = String(formData.get('password') || '');

        if (!docNum) return fail(400, { success: false, message: 'Número de documento no especificado.' });
        if (!branchId) return fail(400, { success: false, message: 'Sucursal no válida.' });
        if (!password) return fail(400, { success: false, message: 'La contraseña es requerida para confirmar la anulación.' });

        const email = locals.session?.user?.email;
        if (!email) return fail(401, { success: false, message: 'Sesión no válida.' });

        // Confirmación de seguridad con contraseña del usuario
        const { error: authErr } = await locals.supabase.auth.signInWithPassword({ email, password });
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
            const voidRes = await agentClient.voidReceivingNote(docNum, reason);

            if (!voidRes.success) {
                return fail(400, { success: false, message: voidRes.message || 'Error al anular la nota de recepción.' });
            }

            // Registrar log de auditoría
            await logAction({
                profile_id: profile.id,
                module: 'inv_receipts',
                action: 'DELETE',
                description: `Nota de Recepción N° ${docNum} anulada. Motivo: ${reason}`,
                branch_id: branch.id,
                details: {
                    doc_num: docNum,
                    reason,
                    voidRes: voidRes.data
                }
            });

            return {
                success: true,
                message: `Nota de Recepción N° ${docNum} anulada correctamente y stock revertido.`
            };
        } catch (err: any) {
            console.error('[RECEIPTS HISTORY ACTION] Error anulando nota de recepción:', err);
            return fail(500, { success: false, message: err.message || 'Error al anular nota de recepción.' });
        }
    }, 'void'),

    getReceiptDetail: protectAction('inv_receipts', async ({ request, locals, fetch }) => {
        const profile = (locals as any).profile;
        const formData = await request.formData();
        const branchId = formData.get('branch_id') as string;
        const docNum = (formData.get('doc_num') as string || '').trim();

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
            const res = await agentClient.getReceivingNote(docNum);
            return {
                success: true,
                receipt: res?.data || null
            };
        } catch (err: any) {
            console.error('[RECEIPTS DETAIL ACTION] Error cargando detalle:', err);
            return fail(500, { success: false, message: err.message || 'Error al consultar detalle.' });
        }
    })
};
