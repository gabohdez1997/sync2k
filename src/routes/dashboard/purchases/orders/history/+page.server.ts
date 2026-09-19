import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { logAction } from '$lib/server/audit';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_orders', async ({ url, locals, fetch }) => {
    const profile = (locals as any).profile;
    const allowedBranches = profile.allowed_branches || [];
    
    if (allowedBranches.length === 0) {
        return { orders: [], pagination: { total: 0, pages: 1, currentPage: 1, limit: 20 }, branches: [], error: 'No tienes sucursales asignadas.' };
    }

    const urlBranchId = url.searchParams.get('branch_id');
    const selectedBranch = urlBranchId 
        ? allowedBranches.find((b: any) => b.id === urlBranchId)
        : allowedBranches[0];

    if (!selectedBranch || !selectedBranch.agent_url) {
        return { orders: [], pagination: { total: 0, pages: 1, currentPage: 1, limit: 20 }, branches: allowedBranches, error: 'Sucursal no configurada.' };
    }

    const agentClient = new AgentClient(selectedBranch, profile, fetch);
    
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '20';
    const doc_num = url.searchParams.get('doc_num') || '';
    const co_prov = url.searchParams.get('co_prov') || '';
    const search = url.searchParams.get('search') || '';
    const fec_d = url.searchParams.get('fec_d') || url.searchParams.get('desde') || '';
    const fec_h = url.searchParams.get('fec_h') || url.searchParams.get('hasta') || '';
    const status = url.searchParams.get('status') || '';
    
    // LÓGICA DE PERMISOS
    const canCreate = hasPermission(profile, 'pur_orders', 'create');
    const canUpdate = hasPermission(profile, 'pur_orders', 'update');
    const canDelete = hasPermission(profile, 'pur_orders', 'delete');
    const canVoid   = hasPermission(profile, 'pur_orders', 'void');
    const canSeeOthers = hasPermission(profile, 'pur_orders', 'others');

    let co_us_in = '';
    if (!canSeeOthers) {
        const userCode = (profile.profit_user || '').trim().toUpperCase();
        co_us_in = userCode || '__NO_USER__';
    }

    const queryParams = new URLSearchParams({
        page,
        limit,
        doc_num,
        co_prov,
        search,
        status,
        fec_d,
        fec_h
    });
    if (co_us_in) queryParams.set('co_us_in', co_us_in);

    try {
        const res = await agentClient.getPurchaseOrders(Object.fromEntries(queryParams), parseInt(page), parseInt(limit));
        
        if (!res.success) {
            return {
                orders: [],
                pagination: { total: 0, pages: 1, currentPage: 1, limit: parseInt(limit) },
                branches: allowedBranches,
                error: res.message || 'Error al obtener órdenes de compra',
                canCreate,
                canUpdate,
                canDelete,
                canVoid,
                filters: { doc_num, co_prov, search, status, fec_d, fec_h }
            };
        }

        return {
            orders: res.data || [],
            pagination: {
                total: (res as any).total_items || (res as any).pagination?.total || (res.data || []).length,
                pages: (res as any).total_pages || (res as any).pagination?.pages || 1,
                currentPage: (res as any).page || (res as any).pagination?.currentPage || parseInt(page),
                limit: (res as any).limit || (res as any).pagination?.limit || parseInt(limit)
            },
            branches: allowedBranches,
            selectedBranchId: selectedBranch.id,
            canCreate,
            canUpdate,
            canDelete,
            canVoid,
            canSeeOthers,
            filters: { doc_num, co_prov, search, status, fec_d, fec_h }
        };
    } catch (e: any) {
        return {
            orders: [],
            pagination: { total: 0, pages: 1, currentPage: 1, limit: parseInt(limit) },
            branches: allowedBranches,
            error: 'Error al conectar con el Agente: ' + e.message,
            canCreate,
            canUpdate,
            canDelete,
            canVoid,
            filters: { doc_num, co_prov, search, status, fec_d, fec_h }
        };
    }
});

export const actions = {
    deleteOrder: protectAction('pur_orders', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        const doc_num = String(formData.get('doc_num') || '').trim();
        const branch_id = String(formData.get('branch_id') || '').trim();
        const password = String(formData.get('password') || '');
        const profile = (locals as any).profile;

        if (!hasPermission(profile, 'pur_orders', 'delete')) {
            return fail(403, { success: false, message: 'No tienes permiso para eliminar órdenes de compra.' });
        }

        if (!doc_num) return fail(400, { success: false, message: 'Documento no válido.' });
        if (!branch_id) return fail(400, { success: false, message: 'Sucursal no válida.' });
        if (!password) {
            return fail(400, { success: false, message: 'La contraseña es requerida para confirmar la eliminación.' });
        }

        const email = locals.session?.user?.email;
        if (!email) return fail(401, { success: false, message: 'Sesión no válida.' });

        // Confirmación de seguridad: validar contraseña actual del usuario.
        const { error: authErr } = await locals.supabase.auth.signInWithPassword({ email, password });
        if (authErr) return fail(401, { success: false, message: 'Contraseña de confirmación incorrecta.' });

        const branch = profile.allowed_branches?.find((b: any) => b.id === branch_id);
        if (!branch) return fail(403, { success: false, message: 'Sucursal no autorizada.' });

        const agentClient = new AgentClient(branch, profile, fetch);

        // Pre-validación de estado: solo órdenes "Sin procesar" y no anuladas.
        try {
            const detailRes: any = await agentClient.getPurchaseOrder(doc_num, branch_id);
            const detailRaw = Array.isArray(detailRes?.data) ? detailRes.data[0] : detailRes?.data;
            const order = detailRaw && Array.isArray(detailRaw) ? detailRaw[0] : detailRaw;
            if (order) {
                if (!hasPermission(profile, 'pur_orders', 'others')) {
                    const userCode = (profile.profit_user || '').trim().toUpperCase();
                    const orderUser = (order.co_us_in || '').trim().toUpperCase();
                    if (!userCode || (orderUser && orderUser !== userCode)) {
                        return fail(403, { success: false, message: 'No tienes permiso para eliminar órdenes de compra de otros usuarios.' });
                    }
                }

                const rawStatus = String(order?.status ?? '').trim();
                const isAnulada = Boolean(order?.anulado);

                const statusLabel = (st: string, anulada: boolean) => {
                    if (anulada) return 'Anulada';
                    if (st === '0') return 'Sin procesar';
                    if (st === '1') return 'Parcialmente procesada';
                    if (st === '2') return 'Procesada';
                    return st ? `Estado ${st}` : 'Desconocido';
                };

                if (isAnulada || rawStatus !== '0') {
                    return fail(400, {
                        success: false,
                        message: `No se puede eliminar la orden de compra ${doc_num} porque está en estado "${statusLabel(rawStatus, isAnulada)}". Solo se permiten órdenes de compra sin procesar.`
                    });
                }
            }
        } catch (e: any) {
            console.warn('[DELETE ORDER] Advertencia al pre-validar estado:', e.message);
        }

        try {
            const res = await agentClient.deletePurchaseOrder(doc_num, branch_id);
            if (res.success || res.status === 200) {
                try {
                    await logAction({
                        uid: profile.id ?? null,
                        user_email: profile.email ?? 'system',
                        action: 'DELETE',
                        module: 'ORDENES_COMPRA',
                        record_id: doc_num,
                        branch_id: branch_id,
                        old_data: { doc_num },
                        new_data: null,
                        source: 'cloud'
                    });
                } catch (auditErr) {
                    console.error('[AUDIT] Error:', auditErr);
                }

                return { success: true, message: res.message || `Orden de compra ${doc_num} eliminada exitosamente.` };
            } else {
                return fail(400, { success: false, message: res.message || 'Error al eliminar la orden de compra en Profit Plus.' });
            }
        } catch (e: any) {
            return fail(500, { success: false, message: e.message || 'Error interno al comunicarse con el Agente.' });
        }
    }, 'delete'),

    anularOrder: protectAction('pur_orders', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        const doc_num = String(formData.get('doc_num') || '').trim();
        const branch_id = String(formData.get('branch_id') || '').trim();
        const password = String(formData.get('password') || '');
        const profile = (locals as any).profile;

        if (!hasPermission(profile, 'pur_orders', 'void')) {
            return fail(403, { success: false, message: 'No tienes permiso para anular órdenes de compra.' });
        }

        if (!doc_num) return fail(400, { success: false, message: 'Documento no válido.' });
        if (!branch_id) return fail(400, { success: false, message: 'Sucursal no válida.' });
        if (!password) {
            return fail(400, { success: false, message: 'La contraseña es requerida para confirmar la anulación.' });
        }

        const email = locals.session?.user?.email;
        if (!email) return fail(401, { success: false, message: 'Sesión no válida.' });

        // Confirmación de seguridad: validar contraseña actual del usuario.
        const { error: authErr } = await locals.supabase.auth.signInWithPassword({ email, password });
        if (authErr) return fail(401, { success: false, message: 'Contraseña de confirmación incorrecta.' });

        const branch = profile.allowed_branches?.find((b: any) => b.id === branch_id);
        if (!branch) return fail(403, { success: false, message: 'Sucursal no autorizada.' });

        const agentClient = new AgentClient(branch, profile, fetch);

        // Pre-validación de estado: solo órdenes "Sin procesar" y no anuladas.
        try {
            const detailRes: any = await agentClient.getPurchaseOrder(doc_num, branch_id);
            const detailRaw = Array.isArray(detailRes?.data) ? detailRes.data[0] : detailRes?.data;
            const order = detailRaw && Array.isArray(detailRaw) ? detailRaw[0] : detailRaw;
            if (order) {
                if (!hasPermission(profile, 'pur_orders', 'others')) {
                    const userCode = (profile.profit_user || '').trim().toUpperCase();
                    const orderUser = (order.co_us_in || '').trim().toUpperCase();
                    if (!userCode || (orderUser && orderUser !== userCode)) {
                        return fail(403, { success: false, message: 'No tienes permiso para anular órdenes de compra de otros usuarios.' });
                    }
                }

                const rawStatus = String(order?.status ?? '').trim();
                const isAnulada = Boolean(order?.anulado);

                const statusLabel = (st: string, anulada: boolean) => {
                    if (anulada) return 'Anulada';
                    if (st === '0') return 'Sin procesar';
                    if (st === '1') return 'Parcialmente procesada';
                    if (st === '2') return 'Procesada';
                    return st ? `Estado ${st}` : 'Desconocido';
                };

                if (isAnulada || rawStatus !== '0') {
                    return fail(400, {
                        success: false,
                        message: `No se puede anular la orden de compra ${doc_num} porque está en estado "${statusLabel(rawStatus, isAnulada)}". Solo se permiten órdenes de compra sin procesar.`
                    });
                }
            }
        } catch (e: any) {
            console.warn('[VOID ORDER] Advertencia al pre-validar estado:', e.message);
        }

        try {
            const res = await agentClient.anularPurchaseOrder(doc_num, branch_id);
            if (res.success || res.status === 200) {
                try {
                    await logAction({
                        uid: profile.id ?? null,
                        user_email: profile.email ?? 'system',
                        action: 'VOID',
                        module: 'ORDENES_COMPRA',
                        record_id: doc_num,
                        branch_id: branch_id,
                        old_data: { doc_num, anulado: false },
                        new_data: { doc_num, anulado: true },
                        source: 'cloud'
                    });
                } catch (auditErr) {
                    console.error('[AUDIT] Error:', auditErr);
                }

                return { success: true, message: res.message || `Orden de compra ${doc_num} anulada exitosamente.` };
            } else {
                return fail(400, { success: false, message: res.message || 'Error al anular la orden de compra en Profit Plus.' });
            }
        } catch (e: any) {
            return fail(500, { success: false, message: e.message || 'Error interno al comunicarse con el Agente.' });
        }
    }, 'void')
};
