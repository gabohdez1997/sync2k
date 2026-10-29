import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { getBranchById } from '$lib/server/branches';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_orders', async ({ params, url, locals, fetch }) => {
    const { doc_num } = params;
    const branchId = url.searchParams.get('branch_id');

    if (!doc_num) {
        throw error(400, 'Falta el número de documento del pedido.');
    }

    try {
        // 1. Obtener datos completos de la sucursal con membrete fiscal
        const allowedBranches = locals.profile?.allowed_branches || [];
        let branch = await getBranchById(branchId, allowedBranches, fetch);

        if (!branch) {
            throw error(404, 'No se encontró la configuración de la sucursal.');
        }

        // 2. Obtener datos del pedido desde el Agente
        const agentClient = new AgentClient({ slug: branch.id, ...branch } as any, locals.profile || undefined, fetch);
        const res = await agentClient.request(`/pedidos/${encodeURIComponent(doc_num)}`);
        
        if (!res.success || !res.data) {
            throw error(404, res?.message || 'No se pudo obtener el detalle del pedido desde el agente.');
        }

        const rawData = res.data;
        let order: any = null;
        if (Array.isArray(rawData)) {
            order = rawData.find((item: any) => item && !item.error && (item.doc_num || item.renglones)) || rawData[0];
        } else {
            order = rawData;
        }

        if (!order || order.error) {
            throw error(404, order?.error || 'No se encontró el pedido solicitado.');
        }

        // Sincronizar el membrete a la sede real del documento si difiere de la sucursal de consulta
        const docSede = order?.sede_id || order?.sede || order?._branch_id;
        if (docSede && String(docSede).toLowerCase() !== String(branch.id).toLowerCase()) {
            const realBranch = await getBranchById(docSede, allowedBranches, fetch);
            if (realBranch) {
                branch = realBranch;
            }
        }

        // 3. Enriquecer con datos del cliente (especialmente la dirección que no viene en el pedido)
        if (order && order.co_cli) {
            try {
                const clientRes = await agentClient.request(`/clientes/${order.co_cli.trim()}`);
                if (clientRes.success && clientRes.data) {
                    const clientData = Array.isArray(clientRes.data) ? clientRes.data[0] : clientRes.data;
                    order.cli_dir = clientData.direc1 || clientData.direc2 || order.cli_dir;
                    order.rif = clientData.rif || order.rif;
                    order.tipo_per = clientData.tipo_per ?? order.tipo_per;
                    order.contrib = clientData.contrib ?? order.contrib;
                    order.contribu_e = clientData.contribu_e;
                    order.porc_esp = clientData.porc_esp;
                }
            } catch (e) {
                console.warn('[PRINT-ORDER] Warning fetching extra client data:', e);
            }
        }

        // 4. Obtener branding global (tolerante a fallos)
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
            title: `Pedido ${doc_num}`
        };

    } catch (err: any) {
        console.error('[PRINT-ORDER] Error:', err);
        throw error(err.status || 500, err.message || 'Error interno al generar reporte.');
    }
});
