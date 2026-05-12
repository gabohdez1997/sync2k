import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_orders', async ({ params, url, locals, fetch }) => {
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

        // 2. Obtener datos del pedido desde el Agente
        const agentClient = new AgentClient(branch, locals.profile || undefined, fetch);
        const res = await agentClient.request(`/pedidos/${doc_num}`);
        
        if (!res.success || !res.data) {
            throw error(404, 'No se pudo obtener el detalle del pedido desde el agente.');
        }

        // El agente devuelve un array (aunque sea uno), tomamos el primero
        const order = Array.isArray(res.data) ? res.data[0] : res.data;

        // 3. Enriquecer con datos del cliente (especialmente la dirección que no viene en el pedido)
        if (order && order.co_cli) {
            const clientRes = await agentClient.request(`/clientes/${order.co_cli.trim()}`);
            if (clientRes.success && clientRes.data) {
                const clientData = Array.isArray(clientRes.data) ? clientRes.data[0] : clientRes.data;
                // Adjuntamos la dirección al objeto order para que el PDF la consuma
                order.cli_dir = clientData.direc1 || clientData.direc2 || order.cli_dir;
            }
        }

        // 4. Obtener branding global (backup si la sucursal no tiene logo)
        const { data: settings } = await supabaseAdmin.from('system_settings').select('*').single();

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
