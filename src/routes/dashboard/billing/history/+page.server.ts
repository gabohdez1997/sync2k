import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { supabaseAdmin } from '$lib/server/supabase';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('cash_billing', async ({ url, locals, fetch }) => {
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
    const co_cli = url.searchParams.get('co_cli') || '';
    const search = url.searchParams.get('search') || '';
    const fec_d = url.searchParams.get('fec_d') || '';
    const fec_h = url.searchParams.get('fec_h') || '';
    
    // LÓGICA DE PERMISOS
    const canSeeOthers = hasPermission(profile, 'cash_billing', 'others');
    const canVoid = hasPermission(profile, 'cash_billing', 'void');

    let co_us_in = url.searchParams.get('co_us_in') || '';

    if (!canSeeOthers) {
        const cashierCode = (profile.profit_user || '').trim().toUpperCase();
        if (!cashierCode) {
            return {
                invoices: [],
                branches: allowedBranches,
                error: 'Tu perfil no tiene asociado un código de Cajero/Usuario de Profit Plus. No puedes visualizar facturas propias ni ajenas.',
                canSeeOthers,
                canVoid
            };
        }
        co_us_in = cashierCode;
    }

    const queryParams = new URLSearchParams({
        page,
        limit,
        doc_num,
        co_cli,
        search,
        co_us_in: co_us_in || '',
        fec_d,
        fec_h
    });

    try {
        const res = await agentClient.request<any>(`/facturas?${queryParams.toString()}`);
        if (!res.success) {
            return {
                invoices: [],
                branches: allowedBranches,
                error: res.message || 'Error desconocido del Agente',
                canSeeOthers, canVoid
            };
        }

        let invoices = res.data || [];
        let cashiersMap: Record<string, string> = {};

        const { data: profilesData } = await supabaseAdmin
            .from('profiles')
            .select('profit_user, full_name');

        if (profilesData) {
            profilesData.forEach((p: any) => {
                if (p.profit_user) {
                    cashiersMap[p.profit_user.trim().toLowerCase()] = p.full_name;
                }
            });
        }

        invoices = invoices.map((inv: any) => {
            const code = (inv.co_us_in || '').trim().toLowerCase();
            return {
                ...inv,
                cashier_name: cashiersMap[code] || inv.co_us_in
            };
        });

        return {
            invoices,
            pagination: {
                total: (res as any).total_items || 0,
                pages: (res as any).total_pages || 1,
                currentPage: (res as any).page || 1,
                limit: (res as any).limit || 20
            },
            branches: allowedBranches,
            selectedBranchId: selectedBranch.id,
            canSeeOthers,
            canVoid,
            filters: { doc_num, co_cli, search, co_us_in, fec_d, fec_h }
        };
    } catch (e: any) {
        return {
            invoices: [],
            branches: allowedBranches,
            error: 'Error al conectar con el Agente: ' + e.message
        };
    }
});

export const actions = {
    voidInvoice: protectAction('cash_billing', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        const doc_num = String(formData.get('doc_num') || '').trim();
        const branch_id = String(formData.get('branch_id') || '').trim();
        const password = String(formData.get('password') || '');
        const profile = (locals as any).profile;

        if (!hasPermission(profile, 'cash_billing', 'void')) {
            return fail(403, { success: false, message: 'No tienes permiso para anular facturas.' });
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

        const res: any = await agentClient.request(`/facturas/${doc_num}/anular`, { method: 'POST' });

        if (!res?.success) {
            return fail(500, { success: false, message: res?.message || 'No se pudo anular la factura.' });
        }

        // Auditoría
        try {
            await locals.supabase.from('audit_log').insert({
                action: 'VOID',
                module: 'cash_billing',
                record_id: doc_num,
                user_email: email,
                branch_id: branch.id,
                metadata: {
                    message: `Factura ${doc_num} anulada con éxito`,
                    doc_num: doc_num
                }
            });
        } catch (auditError) {
            console.error('Error al guardar log de auditoría de anulación:', auditError);
        }

        return { success: true, message: res?.message || 'Factura anulada correctamente.' };
    })
};
