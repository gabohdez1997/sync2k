import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('reports_detailed_account', async ({ params, url, locals, fetch }) => {
    const { co_cli } = params;
    const branchId = url.searchParams.get('branch_id');
    const profile = (locals as any).profile;

    if (!co_cli || !branchId) {
        throw error(400, 'Faltan parámetros de cliente o sucursal.');
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

        // 2. Crear cliente del agente y solicitar documentos de este cliente (limit=1000)
        const agentClient = new AgentClient({
            slug: branch.id, 
            agent_url: branch.agent_url, 
            agent_api_key: branch.agent_token
        }, profile, fetch);

        const query = new URLSearchParams();
        query.set('search', co_cli.trim());
        query.set('limit', '1000');

        const res = await agentClient.request<any>(`/reportes/cuenta-detallada?${query.toString()}`);

        if (!res || !res.success) {
            throw error(500, res?.message || 'Error al obtener reporte del agente local.');
        }

        // Filtrar documentos que coincidan exactamente con el co_cli
        const documents = (res.data || []).filter((d: any) => (d.co_cli || "").trim().toUpperCase() === co_cli.trim().toUpperCase());

        // Ordenar cronológicamente por fecha de emisión ascendente
        documents.sort((a: any, b: any) => new Date(a.fec_emis).getTime() - new Date(b.fec_emis).getTime());

        if (documents.length === 0) {
            throw error(404, 'No se encontraron movimientos activos para este cliente.');
        }

        // 3. Obtener información extendida del cliente
        let clientInfo = {
            co_cli: co_cli.trim(),
            cli_des: documents[0].cli_des || 'Cliente Desconocido',
            direc1: '',
            telefonos: '',
            rif: co_cli.trim()
        };

        try {
            const clientRes = await agentClient.request<any>(`/clientes/${co_cli.trim()}`);
            if (clientRes && clientRes.success && clientRes.data) {
                const cData = Array.isArray(clientRes.data) ? clientRes.data[0] : clientRes.data;
                if (cData) {
                    clientInfo = {
                        co_cli: (cData.co_cli || co_cli).trim(),
                        cli_des: (cData.descripcion || clientInfo.cli_des).trim(),
                        direc1: (cData.direc1 || '').trim(),
                        telefonos: (cData.telefonos || '').trim(),
                        rif: (cData.rif || co_cli).trim()
                    };
                }
            }
        } catch (clientErr) {
            console.warn('[PRINT-DETAILED-ACCOUNT] No se pudo cargar info extendida del cliente:', clientErr);
        }

        // 4. Obtener ajustes del sistema (branding / logos)
        const { data: settings } = await supabaseAdmin.from('system_settings').select('*').single();

        return {
            client: clientInfo,
            documents,
            branch,
            settings: settings || {},
            title: `Cuenta Detallada - ${clientInfo.cli_des}`
        };

    } catch (err: any) {
        console.error('[PRINT-DETAILED-ACCOUNT] Error:', err);
        throw error(err.status || 500, err.message || 'Error interno al generar reporte.');
    }
});
