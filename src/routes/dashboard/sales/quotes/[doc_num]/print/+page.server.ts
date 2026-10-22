import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { getBranchById } from '$lib/server/branches';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sales_quotes', async ({ params, url, locals, fetch }) => {
    const { doc_num } = params;
    const branchId = url.searchParams.get('branch_id');

    if (!doc_num) {
        throw error(400, 'Falta el número de documento de la cotización.');
    }

    try {
        // 1. Obtener datos completos de la sucursal con membrete fiscal
        const allowedBranches = locals.profile?.allowed_branches || [];
        let branch = await getBranchById(branchId, allowedBranches, fetch);

        if (!branch) {
            throw error(404, 'No se encontró la configuración de la sucursal.');
        }

        // 2. Obtener datos de la cotización desde el Agente
        const agentClient = new AgentClient({ slug: branch.id, ...branch } as any, locals.profile || undefined, fetch);
        const res = await agentClient.request(`/cotizaciones/${encodeURIComponent(doc_num)}`);
        
        if (!res.success || !res.data) {
            throw error(404, res?.message || 'No se pudo obtener el detalle de la cotización desde el agente.');
        }

        const rawData = res.data;
        let quote: any = null;
        if (Array.isArray(rawData)) {
            quote = rawData.find((item: any) => item && !item.error && (item.doc_num || item.renglones)) || rawData[0];
        } else {
            quote = rawData;
        }

        if (!quote || quote.error) {
            throw error(404, quote?.error || 'No se encontró la cotización solicitada.');
        }

        // Sincronizar el membrete a la sede real del documento si difiere de la sucursal de consulta
        const docSede = quote?.sede_id || quote?.sede || quote?._branch_id;
        if (docSede && String(docSede).toLowerCase() !== String(branch.id).toLowerCase()) {
            const realBranch = await getBranchById(docSede, allowedBranches, fetch);
            if (realBranch) {
                branch = realBranch;
            }
        }

        // 3. Enriquecer con datos del cliente (especialmente la dirección que no viene en la cotización)
        if (quote && quote.co_cli) {
            try {
                const clientRes = await agentClient.request(`/clientes/${quote.co_cli.trim()}`);
                if (clientRes.success && clientRes.data) {
                    const clientData = Array.isArray(clientRes.data) ? clientRes.data[0] : clientRes.data;
                    quote.cli_dir = clientData.direc1 || clientData.direc2 || quote.cli_dir;
                    quote.contribu_e = clientData.contribu_e;
                    quote.porc_esp = clientData.porc_esp;
                }
            } catch (e) {
                console.warn('[PRINT-QUOTE] Warning fetching extra client data:', e);
            }
        }

        // 4. Obtener branding global (tolerante a fallos)
        let settings: any = {};
        try {
            const { data: sysSettings } = await supabaseAdmin.from('system_settings').select('*').single();
            if (sysSettings) settings = sysSettings;
        } catch (e) {
            console.warn('[PRINT-QUOTE] Warning fetching system_settings:', e);
        }

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
