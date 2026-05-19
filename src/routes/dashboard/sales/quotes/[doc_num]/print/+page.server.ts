import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_quotes', async ({ params, url, locals, fetch }) => {
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

        // 2. Obtener datos de la cotización desde el Agente
        const agentClient = new AgentClient(branch, locals.profile || undefined, fetch);
        const res = await agentClient.request(`/cotizaciones/${doc_num}`);
        
        if (!res.success || !res.data) {
            throw error(404, 'No se pudo obtener el detalle de la cotización desde el agente.');
        }

        // El agente devuelve un array (aunque sea uno), tomamos el primero
        const quote = Array.isArray(res.data) ? res.data[0] : res.data;

        // 3. Enriquecer con datos del cliente (especialmente la dirección que no viene en la cotización)
        if (quote && quote.co_cli) {
            const clientRes = await agentClient.request(`/clientes/${quote.co_cli.trim()}`);
            if (clientRes.success && clientRes.data) {
                const clientData = Array.isArray(clientRes.data) ? clientRes.data[0] : clientRes.data;
                // Adjuntamos la dirección al objeto quote para que el PDF la consuma
                quote.cli_dir = clientData.direc1 || clientData.direc2 || quote.cli_dir;
                quote.contribu_e = clientData.contribu_e;
                quote.porc_esp = clientData.porc_esp;
            }
        }

        // 4. Obtener branding global (backup si la sucursal no tiene logo)
        const { data: settings } = await supabaseAdmin.from('system_settings').select('*').single();

        return {
            quote,
            branch,
            settings: settings || {},
            title: `Cotización ${doc_num}`
        };

    } catch (err: any) {
        console.error('[PRINT-QUOTE] Error:', err);
        throw error(err.status || 500, err.message || 'Error interno al generar reporte.');
    }
});
