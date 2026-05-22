import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { logAction } from '$lib/server/audit';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_orders', async ({ url, locals, fetch }) => {
    const profile = (locals as any).profile;
    const allowedBranches = profile.allowed_branches || [];
    
    if (allowedBranches.length === 0) {
        return { orders: [], branches: [], error: 'No tienes sucursales asignadas.' };
    }

    const urlBranchId = url.searchParams.get('branch_id');
    const selectedBranch = urlBranchId 
        ? allowedBranches.find((b: any) => b.id === urlBranchId)
        : allowedBranches[0];

    if (!selectedBranch || !selectedBranch.agent_url) {
        return { orders: [], branches: allowedBranches, error: 'Sucursal no configurada.' };
    }

    const agentClient = new AgentClient(selectedBranch, profile, fetch);
    
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '20';
    const doc_num = url.searchParams.get('doc_num') || '';
    const co_cli = url.searchParams.get('co_cli') || '';
    const search = url.searchParams.get('search') || '';
    const fec_d = url.searchParams.get('fec_d') || '';
    const fec_h = url.searchParams.get('fec_h') || '';
    
    // LÓGICA DE PERMISOS
    const canSeeOthers = hasPermission(profile, 'sales_orders', 'others');
    const canCreate = hasPermission(profile, 'sales_orders', 'create');
    const canUpdate = hasPermission(profile, 'sales_orders', 'update');
    const canDelete = hasPermission(profile, 'sales_orders', 'delete');
    const canVoid = hasPermission(profile, 'sales_orders', 'void');

    let co_ven = url.searchParams.get('co_ven') || '';

    if (!canSeeOthers) {
        // Forzamos filtro por su propio código de vendedor si no tiene permiso de ver terceros
        const sellerCode = (profile.profit_user || '').trim().toUpperCase();
        if (!sellerCode) {
            return {
                orders: [],
                branches: allowedBranches,
                error: 'Tu perfil no tiene asociado un código de Vendedor de Profit Plus. No puedes visualizar pedidos propios ni ajenos.',
                canSeeOthers,
                canCreate,
                canUpdate,
                canDelete,
                canVoid
            };
        }
        co_ven = sellerCode;
    }

    const queryParams = new URLSearchParams({
        page,
        limit,
        doc_num,
        co_cli,
        search,
        co_ven: co_ven || '',
        fec_d,
        fec_h
    });

    try {
        const res = await agentClient.request<any>(`/pedidos?${queryParams.toString()}`);
        if (!res.success) {
            return {
                orders: [],
                branches: allowedBranches,
                error: res.message || 'Error desconocido del Agente',
                canSeeOthers, canCreate, canUpdate, canDelete
            };
        }

        return {
            orders: res.data || [],
            pagination: {
                total: (res as any).total_items || 0,
                pages: (res as any).total_pages || 1,
                currentPage: (res as any).page || 1,
                limit: (res as any).limit || 20
            },
            branches: allowedBranches,
            selectedBranchId: selectedBranch.id,
            canSeeOthers,
            canCreate,
            canUpdate,
            canDelete,
            canVoid,
            filters: { doc_num, co_cli, search, co_ven, fec_d, fec_h }
        };
    } catch (e: any) {
        return {
            orders: [],
            branches: allowedBranches,
            error: 'Error al conectar con el Agente: ' + e.message
        };
    }
});

export const actions = {
    deleteOrder: protectAction('sales_orders', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        const doc_num = String(formData.get('doc_num') || '').trim();
        const branch_id = String(formData.get('branch_id') || '').trim();
        const password = String(formData.get('password') || '');
        const profile = (locals as any).profile;

        if (!hasPermission(profile, 'sales_orders', 'delete')) {
            return fail(403, { success: false, message: 'No tienes permiso para eliminar pedidos.' });
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

        // Regla de negocio: solo eliminar pedidos "Sin procesar" y no anulados.
        const detailRes: any = await agentClient.request(`/pedidos/${doc_num}`);
        const detailRaw = Array.isArray(detailRes?.data) ? detailRes.data[0] : detailRes?.data;
        const order = detailRaw && Array.isArray(detailRaw) ? detailRaw[0] : detailRaw;
        const rawStatus = String(order?.status ?? '').trim();
        const isAnulada = Boolean(order?.anulado);

        const statusLabel = (status: string, anulada: boolean) => {
            if (anulada) return 'Anulada';
            if (status === '0') return 'Sin procesar';
            if (status === '1') return 'Procesada';
            if (status === '2') return 'Parcialmente procesada';
            return status ? `Estado ${status}` : 'Desconocido';
        };

        if (isAnulada || rawStatus !== '0') {
            return fail(400, {
                success: false,
                message: `No se puede eliminar el pedido ${doc_num} porque está en estado "${statusLabel(rawStatus, isAnulada)}". Solo se permiten pedidos sin procesar.`
            });
        }

        const res: any = await agentClient.request(`/pedidos/${doc_num}`, { method: 'DELETE' });

        if (!res?.success) {
            return fail(500, { success: false, message: res?.message || 'No se pudo eliminar el pedido.' });
        }

        // Auditoría
        try {
            await logAction({
                uid: profile.id ?? null,
                user_email: profile.email ?? 'system',
                action: 'DELETE',
                module: 'PEDIDOS',
                record_id: doc_num,
                branch_id: branch_id,
                old_data: { 
                    doc_num, 
                    co_cli: order?.co_cli, 
                    total: order?.total_neto,
                    status: rawStatus 
                },
                source: 'cloud'
            });
        } catch (auditErr) {
            console.error('[AUDIT] Error registrando auditoría de eliminación:', auditErr);
        }

        return { success: true, message: res?.message || 'Pedido eliminado correctamente.' };
    }),

    voidOrder: protectAction('sales_orders', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        const doc_num = String(formData.get('doc_num') || '').trim();
        const branch_id = String(formData.get('branch_id') || '').trim();
        const password = String(formData.get('password') || '');
        const profile = (locals as any).profile;

        if (!hasPermission(profile, 'sales_orders', 'void')) {
            return fail(403, { success: false, message: 'No tienes permiso para anular pedidos.' });
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

        // Regla de negocio: solo anular pedidos "Sin procesar" y no anulados.
        const detailRes: any = await agentClient.request(`/pedidos/${doc_num}`);
        const detailRaw = Array.isArray(detailRes?.data) ? detailRes.data[0] : detailRes?.data;
        const order = detailRaw && Array.isArray(detailRaw) ? detailRaw[0] : detailRaw;
        const rawStatus = String(order?.status ?? '').trim();
        const isAnulada = Boolean(order?.anulado);

        const statusLabel = (status: string, anulada: boolean) => {
            if (anulada) return 'Anulada';
            if (status === '0') return 'Sin procesar';
            if (status === '1') return 'Procesada';
            if (status === '2') return 'Parcialmente procesada';
            return status ? `Estado ${status}` : 'Desconocido';
        };

        if (isAnulada || rawStatus !== '0') {
            return fail(400, {
                success: false,
                message: `No se puede anular el pedido ${doc_num} porque está en estado "${statusLabel(rawStatus, isAnulada)}". Solo se permiten pedidos sin procesar.`
            });
        }

        const res: any = await agentClient.request(`/pedidos/${doc_num}/anular`, { method: 'POST' });

        if (!res?.success) {
            return fail(500, { success: false, message: res?.message || 'No se pudo anular el pedido.' });
        }

        // --- REGISTRO DE AUDITORÍA EN SUPABASE ---
        try {
            await locals.supabase.from('audit_log').insert({
                action: 'VOID',
                module: 'sales_orders',
                record_id: doc_num,
                user_email: email,
                branch_id: branch.id,
                metadata: {
                    message: `Pedido ${doc_num} anulado con éxito`,
                    doc_num: doc_num
                }
            });
        } catch (auditError) {
            console.error('Error al guardar log de auditoría de anulación:', auditError);
        }

        return { success: true, message: res?.message || 'Pedido anulado correctamente.' };
    }),

    voidAllOrders: protectAction('sales_orders', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        const branch_id = String(formData.get('branch_id') || '').trim();
        const password = String(formData.get('password') || '');
        const profile = (locals as any).profile;

        if (!hasPermission(profile, 'sales_orders', 'void')) {
            return fail(403, { success: false, message: 'No tienes permiso para anular pedidos.' });
        }

        if (!branch_id) return fail(400, { success: false, message: 'Sucursal no válida.' });
        if (!password) {
            return fail(400, { success: false, message: 'La contraseña es requerida para confirmar la anulación masiva.' });
        }

        const email = locals.session?.user?.email;
        if (!email) return fail(401, { success: false, message: 'Sesión no válida.' });

        // Confirmación de seguridad: validar contraseña actual del usuario.
        const { error: authErr } = await locals.supabase.auth.signInWithPassword({ email, password });
        if (authErr) return fail(401, { success: false, message: 'Contraseña de confirmación incorrecta.' });

        const branch = profile.allowed_branches?.find((b: any) => b.id === branch_id);
        if (!branch) return fail(403, { success: false, message: 'Sucursal no autorizada.' });

        const agentClient = new AgentClient(branch, profile, fetch);

        // LÓGICA DE PERMISOS PARA SELLER
        const canSeeOthers = hasPermission(profile, 'sales_orders', 'others');
        const sellerCode = !canSeeOthers ? (profile.profit_user || '').trim().toUpperCase() : '';

        if (!canSeeOthers && !sellerCode) {
            return fail(403, { success: false, message: 'Tu perfil no tiene asociado un código de Vendedor. No puedes anular pedidos.' });
        }

        try {
            const fetchParams = new URLSearchParams({
                limit: '1000',
                page: '1',
                co_ven: sellerCode || ''
            });

            const listRes: any = await agentClient.request(`/pedidos?${fetchParams.toString()}`);
            if (!listRes?.success) {
                return fail(500, { success: false, message: listRes?.message || 'Error al obtener pedidos del Agente.' });
            }

            const allDocs = listRes.data || [];
            const unprocessedDocs = allDocs.filter((d: any) => String(d.status).trim() === '0' && !d.anulado);

            if (unprocessedDocs.length === 0) {
                return { success: true, message: 'No hay pedidos sin procesar para anular en esta sucursal.' };
            }

            let successCount = 0;
            let failCount = 0;
            const errors: string[] = [];

            // Procesamiento secuencial seguro para evitar bloqueos/deadlocks en Profit
            for (const doc of unprocessedDocs) {
                try {
                    const res: any = await agentClient.request(`/pedidos/${doc.doc_num}/anular`, { method: 'POST' });
                    if (res?.success) {
                        successCount++;
                        // Registro de auditoría
                        await locals.supabase.from('audit_log').insert({
                            action: 'VOID',
                            module: 'sales_orders',
                            record_id: doc.doc_num,
                            user_email: email,
                            branch_id: branch.id,
                            metadata: {
                                message: `Pedido ${doc.doc_num} anulado en proceso masivo`,
                                doc_num: doc.doc_num,
                                batch: true
                            }
                        });
                    } else {
                        failCount++;
                        errors.push(`Pedido ${doc.doc_num}: ${res?.message || 'Error desconocido'}`);
                    }
                } catch (e: any) {
                    failCount++;
                    errors.push(`Pedido ${doc.doc_num}: ${e.message}`);
                }
            }

            if (failCount > 0) {
                return { 
                    success: true, 
                    message: `Se anularon ${successCount} pedidos. Fallaron ${failCount} documentos: ${errors.join(', ')}` 
                };
            }

            return { success: true, message: `Se anularon correctamente las ${successCount} pedidos sin procesar.` };
        } catch (e: any) {
            return fail(500, { success: false, message: 'Error de comunicación con el Agente: ' + e.message });
        }
    }),

    printOrder: protectAction('sales_orders', async ({ request, locals, fetch }) => {
        // Lógica para generar PDF (placeholder)
        return { success: true, message: 'Reporte generado correctamente' };
    })
};


