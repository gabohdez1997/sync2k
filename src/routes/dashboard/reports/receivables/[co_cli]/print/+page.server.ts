import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('reports_receivables', async ({ params, url, locals, fetch }) => {
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

        // 2. Determinar si posee permiso para ver otros vendedores
        const hasOthers = hasPermission(profile, 'reports_receivables', 'others');
        let coVenFilter = '';
        if (!hasOthers) {
            coVenFilter = profile.profit_user || '';
        }

        // 3. Crear cliente del agente y solicitar documentos de este cliente (limit=1000)
        const agentClient = new AgentClient({
            slug: branch.id, 
            agent_url: branch.agent_url, 
            agent_api_key: branch.agent_token
        }, profile, fetch);

        const query = new URLSearchParams();
        query.set('search', co_cli.trim());
        query.set('limit', '1000');
        if (coVenFilter) {
            query.set('co_ven', coVenFilter);
        }

        const res = await agentClient.request<any>(`/reportes/cxc?${query.toString()}`);

        if (!res || !res.success) {
            throw error(500, res?.message || 'Error al obtener reporte del agente local.');
        }

        // Filtrar documentos que coincidan exactamente con el co_cli para evitar falsos positivos de coincidencia parcial
        const documents = (res.data || []).filter((d: any) => (d.co_cli || "").trim().toUpperCase() === co_cli.trim().toUpperCase());

        if (documents.length === 0) {
            throw error(404, 'No se encontraron cuentas por cobrar activas para este cliente.');
        }

        // 4. Obtener información extendida del cliente desde el maestro para detalles de contacto/fiscales
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
                clientInfo = {
                    co_cli: (cData.co_cli || co_cli).trim(),
                    cli_des: (cData.cli_des || clientInfo.cli_des).trim(),
                    direc1: (cData.direc1 || '').trim(),
                    telefonos: (cData.telefonos || '').trim(),
                    rif: (cData.rif || co_cli).trim()
                };
            }
        } catch (clientErr) {
            console.warn('[PRINT-CXC] No se pudo cargar info extendida del cliente:', clientErr);
        }

        // 5. Obtener ajustes del sistema (branding / logos)
        const { data: settings } = await supabaseAdmin.from('system_settings').select('*').single();

        return {
            client: clientInfo,
            documents,
            branch,
            settings: settings || {},
            title: `Estado de Cuenta - ${clientInfo.cli_des}`
        };

    } catch (err: any) {
        console.error('[PRINT-RECEIVABLES] Error:', err);
        throw error(err.status || 500, err.message || 'Error interno al generar reporte.');
    }
});
