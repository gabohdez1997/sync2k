// src/routes/dashboard/purchases/invoices/history/+page.server.ts
import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_invoices', async ({ url, locals, fetch }) => {
    const profile = (locals as any).profile;
    const allowedBranches = profile.allowed_branches || [];
    
    if (allowedBranches.length === 0) {
        return { invoices: [], branches: [], error: 'No tienes sucursales asignadas.' };
    }

    const urlBranchId = url.searchParams.get('branch_id');
    const selectedBranch = urlBranchId 
        ? allowedBranches.find((b: any) => b.id === urlBranchId)
        : allowedBranches[0];

    if (!selectedBranch || !selectedBranch.agent_url) {
        return { invoices: [], branches: allowedBranches, error: 'Sucursal no configurada.' };
    }

    const agentClient = new AgentClient(selectedBranch, profile, fetch);
    
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '20';
    const doc_num = url.searchParams.get('doc_num') || '';
    const co_prov = url.searchParams.get('co_prov') || '';
    const nro_fact = url.searchParams.get('nro_fact') || '';
    const search = url.searchParams.get('search') || '';
    const fec_d = url.searchParams.get('fec_d') || '';
    const fec_h = url.searchParams.get('fec_h') || '';
    
    // Lógica de Permisos
    const canSeeOthers = hasPermission(profile, 'pur_invoices', 'others');
    const canVoid = hasPermission(profile, 'pur_invoices', 'void');
    const canDelete = hasPermission(profile, 'pur_invoices', 'delete');
    const canCreate = hasPermission(profile, 'pur_invoices', 'create');

    let co_us_in = url.searchParams.get('co_us_in') || '';

    if (!canSeeOthers) {
        const userCode = (profile.profit_user || '').trim().toUpperCase();
        if (!userCode) {
            return {
                invoices: [],
                branches: allowedBranches,
                error: 'Tu perfil no tiene asociado un código de Usuario de Profit Plus. No puedes visualizar facturas de compra.',
                canSeeOthers,
                canVoid,
                canDelete,
                canCreate
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
        search,
        co_us_in: co_us_in || '',
        fec_d,
        fec_h
    });

    try {
        const res = await agentClient.request<any>(`/facturas-compras?${queryParams.toString()}`);
        if (!res.success) {
            return {
                invoices: [],
                branches: allowedBranches,
                error: res.message || 'Error al obtener facturas de compra',
                canSeeOthers,
                canVoid,
                canCreate
            };
        }

        let invoices = res.data || [];

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

        invoices = invoices.map((inv: any) => {
            const code = (inv.co_us_in || '').trim().toLowerCase();
            return {
                ...inv,
                user_name: usersMap[code] || inv.co_us_in
            };
        });

        return {
            invoices,
            pagination: {
                total: (res as any).total_items || (res as any).pagination?.total || invoices.length,
                pages: (res as any).total_pages || (res as any).pagination?.pages || 1,
                currentPage: (res as any).page || (res as any).pagination?.currentPage || parseInt(page),
                limit: (res as any).limit || (res as any).pagination?.limit || parseInt(limit)
            },
            branches: allowedBranches,
            selectedBranchId: selectedBranch.id,
            canSeeOthers,
            canVoid,
            canDelete,
            canCreate,
            filters: { doc_num, co_prov, nro_fact, search, co_us_in, fec_d, fec_h }
        };
    } catch (e: any) {
        return {
            invoices: [],
            branches: allowedBranches,
            error: 'Error al conectar con el Agente: ' + e.message,
            canSeeOthers,
            canVoid,
            canDelete,
            canCreate
        };
    }
});

export const actions = {
    voidInvoice: protectAction('pur_invoices', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        const doc_num = String(formData.get('doc_num') || '').trim();
        const branch_id = String(formData.get('branch_id') || '').trim();
        const password = String(formData.get('password') || '');
        const profile = (locals as any).profile;

        if (!hasPermission(profile, 'pur_invoices', 'void')) {
            return fail(403, { success: false, message: 'No tienes permiso para anular facturas de compra.' });
        }

        if (!doc_num) return fail(400, { success: false, message: 'Documento no válido.' });
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

        const res: any = await agentClient.request(`/facturas-compras/${doc_num}/anular?sede=${branch.id}`, { method: 'POST' });

        if (!res?.success) {
            return fail(500, { success: false, message: res?.message || 'No se pudo anular la factura de compra.' });
        }

        // Auditoría
        try {
            await locals.supabase.from('audit_log').insert({
                action: 'VOID',
                module: 'pur_invoices',
                record_id: doc_num,
                user_email: email,
                branch_id: branch.id,
                metadata: {
                    message: `Factura de compra ${doc_num} anulada con éxito`,
                    doc_num: doc_num
                }
            });
        } catch (auditError) {
            console.error('Error al guardar log de auditoría de anulación de factura de compra:', auditError);
        }

        return { success: true, message: res?.message || 'Factura de compra anulada correctamente.' };
    }),

    deleteInvoice: protectAction('pur_invoices', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        const doc_num = String(formData.get('doc_num') || '').trim();
        const branch_id = String(formData.get('branch_id') || '').trim();
        const password = String(formData.get('password') || '');
        const profile = (locals as any).profile;

        if (!hasPermission(profile, 'pur_invoices', 'delete')) {
            return fail(403, { success: false, message: 'No tienes permiso para eliminar facturas de compra.' });
        }

        if (!doc_num) return fail(400, { success: false, message: 'Documento no válido.' });
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

        const res: any = await agentClient.request(`/facturas-compras/${doc_num}?sede=${branch.id}`, { method: 'DELETE' });

        if (!res?.success) {
            return fail(500, { success: false, message: res?.message || 'No se pudo eliminar la factura de compra.' });
        }

        // Auditoría
        try {
            await locals.supabase.from('audit_log').insert({
                action: 'DELETE',
                module: 'pur_invoices',
                record_id: doc_num,
                user_email: email,
                branch_id: branch.id,
                metadata: {
                    message: `Factura de compra ${doc_num} eliminada con éxito`,
                    doc_num: doc_num
                }
            });
        } catch (auditError) {
            console.error('Error al guardar log de auditoría de eliminación de factura de compra:', auditError);
        }

        return { success: true, message: res?.message || 'Factura de compra eliminada exitosamente.' };
    })
};
