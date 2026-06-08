import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('reports_payables', async ({ params, url, locals, fetch }) => {
    const { co_prov } = params;
    const branchId = url.searchParams.get('branch_id');
    const profile = (locals as any).profile;

    if (!co_prov || !branchId) {
        throw error(400, 'Faltan parámetros de proveedor o sucursal.');
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

        // 2. Crear cliente del agente y solicitar documentos de este proveedor (limit=1000)
        const agentClient = new AgentClient({
            slug: branch.id, 
            agent_url: branch.agent_url, 
            agent_api_key: branch.agent_token
        }, profile, fetch);

        const query = new URLSearchParams();
        query.set('search', co_prov.trim());
        query.set('limit', '1000');

        const res = await agentClient.request<any>(`/reportes/cxp?${query.toString()}`);

        if (!res || !res.success) {
            throw error(500, res?.message || 'Error al obtener reporte del agente local.');
        }

        // Filtrar documentos que coincidan exactamente con el co_prov para evitar falsos positivos
        let documents = (res.data || []).filter((d: any) => (d.co_prov || "").trim().toUpperCase() === co_prov.trim().toUpperCase());

        const onlyProviderRates = url.searchParams.get('only_provider_rates') === 'true';
        if (onlyProviderRates) {
            documents = documents.filter((d: any) => d.tasa_proveedor && d.tasa_proveedor > 0);
        }

        if (documents.length === 0) {
            throw error(404, 'No se encontraron cuentas por pagar activas para este proveedor.');
        }

        // 3. Obtener información extendida del proveedor desde el maestro
        let supplierInfo = {
            co_prov: co_prov.trim(),
            prov_des: documents[0].prov_des || 'Proveedor Desconocido',
            direc1: '',
            telefonos: '',
            rif: co_prov.trim()
        };

        try {
            const supplierRes = await agentClient.request<any>(`/compras/proveedores/${co_prov.trim()}`);
            if (supplierRes && supplierRes.success && supplierRes.data) {
                const sData = Array.isArray(supplierRes.data) ? supplierRes.data[0] : supplierRes.data;
                supplierInfo = {
                    co_prov: (sData.co_prov || co_prov).trim(),
                    prov_des: (sData.descripcion || supplierInfo.prov_des).trim(),
                    direc1: (sData.direc1 || '').trim(),
                    telefonos: (sData.telefonos || '').trim(),
                    rif: (sData.rif || co_prov).trim()
                };
            }
        } catch (supplierErr) {
            console.warn('[PRINT-CXP] No se pudo cargar info extendida del proveedor:', supplierErr);
        }

        // 4. Obtener ajustes del sistema (branding / logos)
        const { data: settings } = await supabaseAdmin.from('system_settings').select('*').single();

        return {
            supplier: supplierInfo,
            documents,
            branch,
            settings: settings || {},
            onlyProviderRates,
            title: `Estado de Cuenta - ${supplierInfo.prov_des}`
        };

    } catch (err: any) {
        console.error('[PRINT-PAYABLES] Error:', err);
        throw error(err.status || 500, err.message || 'Error interno al generar reporte.');
    }
});
