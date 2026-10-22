import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { getBranchById } from '$lib/server/branches';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_orders', async ({ params, url, locals, fetch }) => {
    const { doc_num } = params;
    const branchId = url.searchParams.get('branch_id');

    if (!doc_num) {
        throw error(400, 'Falta el número de documento de orden de compra.');
    }

    try {
        // 1. Obtener datos completos de la sucursal con membrete fiscal
        const allowedBranches = locals.profile?.allowed_branches || [];
        let branch = await getBranchById(branchId, allowedBranches, fetch);

        if (!branch) {
            throw error(404, 'No se encontró la configuración de la sucursal.');
        }

        // 2. Obtener datos de la orden de compra desde el Agente
        const agentClient = new AgentClient({ slug: branch.id, ...branch } as any, locals.profile || undefined, fetch);
        const res = await agentClient.getPurchaseOrder(doc_num, branch.profit_server_id || branch.id);
        
        if (!res.success || !res.data) {
            throw error(404, res?.message || 'No se pudo obtener el detalle de la orden de compra desde el agente.');
        }

        const rawData = res.data;
        let order: any = null;
        if (Array.isArray(rawData)) {
            order = rawData.find((item: any) => item && !item.error && (item.doc_num || item.renglones)) || rawData[0];
        } else {
            order = rawData;
        }

        if (!order || order.error) {
            throw error(404, order?.error || 'No se encontró la orden de compra solicitada.');
        }

        // Sincronizar el membrete a la sede real del documento si difiere de la sucursal de consulta
        const docSede = order?.sede_id || order?.sede || order?._branch_id;
        if (docSede && String(docSede).toLowerCase() !== String(branch.id).toLowerCase()) {
            const realBranch = await getBranchById(docSede, allowedBranches, fetch);
            if (realBranch) {
                branch = realBranch;
            }
        }

        // 3. Enriquecer con datos del proveedor
        if (order && order.co_prov) {
            try {
                const provRes = await agentClient.getSupplier(order.co_prov.trim());
                if (provRes.success && provRes.data) {
                    const provData = Array.isArray(provRes.data) ? provRes.data[0] : provRes.data;
                    order.prov_dir = provData.direc1 || provData.direc2 || order.prov_dir;
                    order.contribu_e = provData.contribu_e;
                    order.porc_esp = provData.porc_esp;
                    order.prov_cond_pag = provData.cond_pag || order.prov_cond_pag;
                    order.prov_cond_des = provData.cond_des || provData.cond_pag_des || order.prov_cond_des;
                    if (!order.cond_des || order.cond_des === 'CONTADO') {
                        if (order.prov_cond_des) {
                            order.cond_des = order.prov_cond_des;
                        }
                    }
                }
            } catch (e) {
                console.warn('[PRINT-ORDER] Warning fetching extra supplier data:', e);
            }
        }

        // 4. Buscar nombres de Creador (co_us_in) y Editor (co_us_mo) en Supabase profiles
        let creatorName = '';
        let editorName = '';
        const creatorUser = (order.co_us_in || '').trim();
        const editorUser = (order.co_us_mo || '').trim();

        const usersToFetch = Array.from(new Set([creatorUser, editorUser].filter(Boolean)));

        if (usersToFetch.length > 0) {
            try {
                const { data: profiles } = await supabaseAdmin
                    .from('profiles')
                    .select('full_name, profit_user');

                const profileMap = new Map<string, string>();
                (profiles || []).forEach((p: any) => {
                    if (p.profit_user && p.full_name) {
                        profileMap.set(p.profit_user.trim().toUpperCase(), p.full_name);
                    }
                });

                creatorName = profileMap.get(creatorUser.toUpperCase()) || creatorUser;
                if (editorUser && editorUser.toUpperCase() !== creatorUser.toUpperCase()) {
                    editorName = profileMap.get(editorUser.toUpperCase()) || editorUser;
                }
            } catch (e) {
                console.warn('[PRINT-ORDER] Warning looking up creator/editor profiles:', e);
                creatorName = creatorUser;
                if (editorUser && editorUser.toUpperCase() !== creatorUser.toUpperCase()) {
                    editorName = editorUser;
                }
            }
        }

        order.creator_name = creatorName;
        order.buyer_name = creatorName;
        order.editor_name = editorName;
        order.has_editor = !!editorName;

        // 5. Obtener branding global (tolerante a fallos)
        let settings: any = {};
        try {
            const { data: sysSettings } = await supabaseAdmin.from('system_settings').select('*').single();
            if (sysSettings) settings = sysSettings;
        } catch (e) {
            console.warn('[PRINT-ORDER] Warning fetching system_settings:', e);
        }

        return {
            order,
            branch,
            settings: settings || {},
            title: `Orden de Compra ${doc_num}`
        };

    } catch (err: any) {
        console.error('[PRINT-ORDER] Error:', err);
        throw error(err.status || 500, err.message || 'Error interno al generar reporte.');
    }
});
