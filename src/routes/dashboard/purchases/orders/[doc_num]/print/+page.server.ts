import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_orders', async ({ params, url, locals, fetch }) => {
    const { doc_num } = params;
    const branchId = url.searchParams.get('branch_id');

    if (!doc_num || !branchId) {
        throw error(400, 'Faltan parámetros de documento o sucursal.');
    }

    try {
        // 1. Obtener datos de la sucursal desde Supabase
        const { data: branch, error: branchErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branchId)
            .single();

        if (branchErr || !branch) {
            throw error(404, 'No se encontró la configuración de la sucursal.');
        }

        // 2. Obtener datos de la orden de compra desde el Agente
        const agentClient = new AgentClient(branch, locals.profile || undefined, fetch);
        const res = await agentClient.getPurchaseOrder(doc_num);
        
        if (!res.success || !res.data) {
            throw error(404, 'No se pudo obtener el detalle de la orden de compra desde el agente.');
        }

        const order = Array.isArray(res.data) ? res.data[0] : res.data;

        // 3. Enriquecer con datos del proveedor
        if (order && order.co_prov) {
            try {
                const provRes = await agentClient.getSupplier(order.co_prov.trim());
                if (provRes.success && provRes.data) {
                    const provData = Array.isArray(provRes.data) ? provRes.data[0] : provRes.data;
                    order.prov_dir = provData.direc1 || provData.direc2 || order.prov_dir;
                    order.contribu_e = provData.contribu_e;
                    order.porc_esp = provData.porc_esp;
                }
            } catch (e) {
                console.warn('[PRINT-ORDER] Warning fetching extra supplier data:', e);
            }
        }

        // 4. Obtener branding global
        const { data: settings } = await supabaseAdmin.from('system_settings').select('*').single();

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
