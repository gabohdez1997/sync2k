import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_orders', async ({ params, url, locals, fetch }) => {
    const { doc_num } = params;
    const branchId = url.searchParams.get('branch_id');

    if (!doc_num) {
        throw error(400, 'Falta el número de documento del pedido.');
    }

    try {
        // 1. Obtener datos de la sucursal: priorizar allowed_branches del perfil, luego Supabase y local DB
        const allowedBranches = locals.profile?.allowed_branches || [];
        let branch = allowedBranches.find(
            (b: any) => b.id === branchId || b.profit_server_id === branchId || b.name === branchId
        );

        if (!branch && branchId) {
            try {
                const { data, error: branchErr } = await supabaseAdmin
                    .from('branches')
                    .select('*')
                    .eq('id', branchId)
                    .single();
                if (!branchErr && data) branch = data;
            } catch (e) {
                console.warn('[PRINT-ORDER] Supabase branch query warning:', e);
            }
        }

        if (!branch && branchId) {
            try {
                const { queryLocalDb } = await import('$lib/server/local-db');
                const res = await queryLocalDb('SELECT * FROM branches WHERE id = $1 OR profit_server_id = $1', [branchId]);
                if (res.rows.length > 0) branch = res.rows[0];
            } catch (e) {
                console.warn('[PRINT-ORDER] Local DB branch query warning:', e);
            }
        }

        // Fallback a la primera sucursal autorizada si no se encontró por ID
        if (!branch && allowedBranches.length > 0) {
            branch = allowedBranches[0];
        }

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

        // 3. Enriquecer con datos del cliente (especialmente la dirección que no viene en el pedido)
        if (order && order.co_cli) {
            try {
                const clientRes = await agentClient.request(`/clientes/${order.co_cli.trim()}`);
                if (clientRes.success && clientRes.data) {
                    const clientData = Array.isArray(clientRes.data) ? clientRes.data[0] : clientRes.data;
                    order.cli_dir = clientData.direc1 || clientData.direc2 || order.cli_dir;
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
