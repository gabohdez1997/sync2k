// src/routes/dashboard/purchases/documents/history/+page.server.ts
import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_documents', async ({ url, locals, fetch }) => {
    const profile = (locals as any).profile;
    const allowedBranches = profile.allowed_branches || [];

    // Lógica de Permisos
    const canSeeOthers = hasPermission(profile, 'pur_documents', 'others');
    const canVoid = hasPermission(profile, 'pur_documents', 'void');
    const canDelete = hasPermission(profile, 'pur_documents', 'delete');
    const canCreate = hasPermission(profile, 'pur_documents', 'create');
    const canEdit = hasPermission(profile, 'pur_documents', 'update') || canCreate;

    if (allowedBranches.length === 0) {
        return {
            documents: [],
            pagination: { total: 0, pages: 1, currentPage: 1, limit: 20 },
            metrics: {},
            branches: [],
            selectedBranchId: '',
            activeRate: 1,
            canSeeOthers,
            canVoid,
            canDelete,
            canCreate,
            canEdit,
            filters: {},
            error: 'No tienes sucursales asignadas.'
        };
    }

    const urlBranchId = url.searchParams.get('branch_id');
    const selectedBranch = urlBranchId
        ? allowedBranches.find((b: any) => b.id === urlBranchId)
        : allowedBranches[0];

    if (!selectedBranch || !selectedBranch.agent_url) {
        return {
            documents: [],
            pagination: { total: 0, pages: 1, currentPage: 1, limit: 20 },
            metrics: {},
            branches: allowedBranches,
            selectedBranchId: '',
            activeRate: 1,
            canSeeOthers,
            canVoid,
            canDelete,
            canCreate,
            canEdit,
            filters: {},
            error: 'Sucursal no configurada.'
        };
    }

    const agentClient = new AgentClient(selectedBranch, profile, fetch);

    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '20';
    const doc_num = url.searchParams.get('doc_num') || '';
    const co_prov = url.searchParams.get('co_prov') || '';
    const nro_fact = url.searchParams.get('nro_fact') || '';
    const co_tipo_doc = url.searchParams.get('co_tipo_doc') || '';
    const status = url.searchParams.get('status') || '';
    const search = url.searchParams.get('search') || '';
    const fec_d = url.searchParams.get('fec_d') || '';
    const fec_h = url.searchParams.get('fec_h') || '';
    const order_by = url.searchParams.get('order_by') || 'fec_emis';
    const order_dir = url.searchParams.get('order_dir') || 'DESC';

    let co_us_in = url.searchParams.get('co_us_in') || '';

    if (!canSeeOthers) {
        const userCode = (profile.profit_user || '').trim().toUpperCase();
        if (!userCode) {
            return {
                documents: [],
                pagination: { total: 0, pages: 1, currentPage: 1, limit: 20 },
                metrics: {},
                branches: allowedBranches,
                selectedBranchId: selectedBranch.id,
                activeRate: 1,
                canSeeOthers,
                canVoid,
                canDelete,
                canCreate,
                canEdit,
                filters: {},
                error: 'Tu perfil no tiene asociado un código de Usuario de Profit Plus. No puedes visualizar documentos de compra.'
            };
        }
        co_us_in = userCode;
    }

    const queryParams = new URLSearchParams({
        page,
        limit,
        doc_num,
        co_prov,
        nro_fact,
        co_tipo_doc,
        status,
        search,
        co_us_in: co_us_in || '',
        fec_d,
        fec_h,
        order_by,
        order_dir
    });

    try {
        const [res, tasaRes] = await Promise.all([
            agentClient.request<any>(`/documentos-compra?${queryParams.toString()}`),
            agentClient.request<any>('/catalogos/tasa').catch(() => null)
        ]);

        let activeRate = 1;
        const tasaData = (tasaRes as any)?.data || (Array.isArray(tasaRes) ? tasaRes : []);
        if (tasaData.length > 0 && Number(tasaData[0].tasa) > 0) {
            activeRate = Number(tasaData[0].tasa);
        }

        if (!res.success) {
            return {
                documents: [],
                pagination: { total: 0, pages: 1, currentPage: 1, limit: 20 },
                metrics: {},
                branches: allowedBranches,
                selectedBranchId: selectedBranch.id,
                activeRate,
                error: res.message || 'Error al obtener documentos de compra',
                canSeeOthers,
                canVoid,
                canDelete,
                canCreate,
                canEdit,
                filters: {}
            };
        }

        let documents = res.data || [];

        // Consultar nombres de usuarios para el creador
        let usersMap: Record<string, string> = {};
        const { data: profilesData } = await supabaseAdmin
            .from('profiles')
            .select('profit_user, full_name');

        if (profilesData) {
            profilesData.forEach((p: any) => {
                if (p.profit_user) {
                    usersMap[p.profit_user.trim().toLowerCase()] = p.full_name;
                }
            });
        }

        documents = documents.map((doc: any) => {
            const code = (doc.co_us_in || '').trim().toLowerCase();
            return {
                ...doc,
                user_name: usersMap[code] || doc.co_us_in
            };
        });

        const metricsData = (res as any)?.metrics || {};

        return {
            documents,
            pagination: {
                total: metricsData.total_items || (res as any).total_items || (res as any).pagination?.total || documents.length,
                pages: (res as any).pagination?.pages || 1,
                currentPage: (res as any).pagination?.currentPage || parseInt(page),
                limit: (res as any).pagination?.limit || parseInt(limit)
            },
            metrics: metricsData,
            branches: allowedBranches,
            selectedBranchId: selectedBranch.id,
            activeRate,
            canSeeOthers,
            canVoid,
            canDelete,
            canCreate,
            canEdit,
            filters: { doc_num, co_prov, nro_fact, co_tipo_doc, status, search, co_us_in, fec_d, fec_h, order_by, order_dir }
        };
    } catch (e: any) {
        return {
            documents: [],
            pagination: { total: 0, pages: 1, currentPage: 1, limit: 20 },
            metrics: {},
            branches: allowedBranches,
            selectedBranchId: selectedBranch.id,
            activeRate: 1,
            error: 'Error al conectar con el Agente: ' + e.message,
            canSeeOthers,
            canVoid,
            canDelete,
            canCreate,
            canEdit,
            filters: {}
        };
    }
});

export const actions = {
    voidDocument: protectAction('pur_documents', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        const co_tipo_doc = String(formData.get('co_tipo_doc') || '').trim();
        const nro_doc = String(formData.get('nro_doc') || '').trim();
        const branch_id = String(formData.get('branch_id') || '').trim();
        const password = String(formData.get('password') || '');
        const profile = (locals as any).profile;

        if (!hasPermission(profile, 'pur_documents', 'void')) {
            return fail(403, { success: false, message: 'No tienes permiso para anular documentos de compra.' });
        }

        if (!co_tipo_doc || !nro_doc) return fail(400, { success: false, message: 'Documento no válido.' });
        if (!branch_id) return fail(400, { success: false, message: 'Sucursal no válida.' });
        if (!password) {
            return fail(400, { success: false, message: 'La contraseña es requerida para confirmar la anulación.' });
        }

        const email = locals.session?.user?.email;
        if (!email) return fail(401, { success: false, message: 'Sesión no válida.' });

        // Confirmación de seguridad
        const { error: authErr } = await locals.supabase.auth.signInWithPassword({ email, password });
        if (authErr) return fail(401, { success: false, message: 'Contraseña de confirmación incorrecta.' });

        const branch = profile.allowed_branches?.find((b: any) => b.id === branch_id);
        if (!branch) return fail(403, { success: false, message: 'Sucursal no autorizada.' });

        const agentClient = new AgentClient(branch, profile, fetch);

        const res: any = await agentClient.request(`/documentos-compra/${encodeURIComponent(co_tipo_doc)}/${encodeURIComponent(nro_doc)}/anular?sede=${branch.id}`, { method: 'POST' });

        if (!res?.success) {
            return fail(500, { success: false, message: res?.message || 'No se pudo anular el documento de compra.' });
        }

        // Auditoría
        try {
            await locals.supabase.from('audit_log').insert({
                action: 'VOID',
                module: 'pur_documents',
                record_id: nro_doc,
                user_email: email,
                branch_id: branch.id,
                metadata: {
                    message: `Documento de compra ${co_tipo_doc} ${nro_doc} anulado con éxito`,
                    co_tipo_doc,
                    nro_doc
                }
            });
        } catch (auditError) {
            console.error('Error al guardar log de auditoría de anulación:', auditError);
        }

        return { success: true, message: res?.message || 'Documento anulado correctamente.' };
    }),

    deleteDocument: protectAction('pur_documents', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        const co_tipo_doc = String(formData.get('co_tipo_doc') || '').trim();
        const nro_doc = String(formData.get('nro_doc') || '').trim();
        const branch_id = String(formData.get('branch_id') || '').trim();
        const password = String(formData.get('password') || '');
        const profile = (locals as any).profile;

        if (!hasPermission(profile, 'pur_documents', 'delete')) {
            return fail(403, { success: false, message: 'No tienes permiso para eliminar documentos de compra.' });
        }

        if (!co_tipo_doc || !nro_doc) return fail(400, { success: false, message: 'Documento no válido.' });
        if (!branch_id) return fail(400, { success: false, message: 'Sucursal no válida.' });
        if (!password) {
            return fail(400, { success: false, message: 'La contraseña es requerida para confirmar la eliminación.' });
        }

        const email = locals.session?.user?.email;
        if (!email) return fail(401, { success: false, message: 'Sesión no válida.' });

        // Confirmación de seguridad
        const { error: authErr } = await locals.supabase.auth.signInWithPassword({ email, password });
        if (authErr) return fail(401, { success: false, message: 'Contraseña de confirmación incorrecta.' });

        const branch = profile.allowed_branches?.find((b: any) => b.id === branch_id);
        if (!branch) return fail(403, { success: false, message: 'Sucursal no autorizada.' });

        const agentClient = new AgentClient(branch, profile, fetch);

        const res: any = await agentClient.request(`/documentos-compra/${encodeURIComponent(co_tipo_doc)}/${encodeURIComponent(nro_doc)}?sede=${branch.id}`, { method: 'DELETE' });

        if (!res?.success) {
            return fail(500, { success: false, message: res?.message || 'No se pudo eliminar el documento de compra.' });
        }

        // Auditoría
        try {
            await locals.supabase.from('audit_log').insert({
                action: 'DELETE',
                module: 'pur_documents',
                record_id: nro_doc,
                user_email: locals.session?.user?.email ?? 'system',
                branch_id: branch.id,
                metadata: {
                    message: `Documento de compra ${co_tipo_doc} ${nro_doc} eliminado con éxito`,
                    co_tipo_doc,
                    nro_doc
                }
            });
        } catch (auditError) {
            console.error('Error al guardar log de auditoría de eliminación:', auditError);
        }

        return { success: true, message: res?.message || 'Documento eliminado correctamente.' };
    })
};

