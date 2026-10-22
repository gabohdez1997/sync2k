import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('cash_billing', async ({ params, url, locals, fetch }) => {
    const { doc_num } = params;
    const allowedBranches = locals.profile?.allowed_branches || [];
    let branchId = url.searchParams.get('branch_id');

    if (!branchId && allowedBranches.length > 0) {
        branchId = allowedBranches[0].id;
    }

    if (!doc_num || !branchId) {
        throw error(400, 'Faltan parámetros de documento o sucursal.');
    }

    try {
        // 1. Obtener datos de la sucursal (revisar primero en allowed_branches, luego Supabase, luego DB local)
        let branch = allowedBranches.find((b: any) => String(b.id) === String(branchId));

        if (!branch) {
            try {
                const { data: bData, error: branchErr } = await supabaseAdmin
                    .from('branches')
                    .select('*')
                    .eq('id', branchId)
                    .single();
                if (!branchErr && bData) branch = bData;
            } catch (e) {
                console.warn('[PRINT-INVOICE] Supabase branch fetch failed, falling back to local DB:', e);
            }
        }

        if (!branch) {
            try {
                const { queryLocal } = await import('$lib/server/local-db');
                const localBranches = await queryLocal('SELECT * FROM branches WHERE id = $1', [branchId]);
                if (localBranches.rows?.length) {
                    branch = localBranches.rows[0];
                }
            } catch (e) {
                console.warn('[PRINT-INVOICE] Local DB branch fetch failed:', e);
            }
        }

        if (!branch && allowedBranches.length > 0) {
            branch = allowedBranches[0];
        }

        if (!branch) {
            throw error(404, 'No se encontró la configuración de la sucursal.');
        }

        // 2. Obtener datos de la factura desde el Agente
        const agentClient = new AgentClient({ slug: branch.id, ...branch } as any, locals.profile || undefined, fetch);
        const res = await agentClient.request(`/facturas/${encodeURIComponent(doc_num.trim())}`);
        
        if (!res.success || !res.data) {
            throw error(404, 'No se pudo obtener el detalle de la factura desde el agente.');
        }

        const invoice = Array.isArray(res.data)
            ? (res.data.find((item: any) => item && !item.error && (item.doc_num || item.renglones)) || res.data[0])
            : res.data;

        // 3. Enriquecer con datos del cliente
        if (invoice && invoice.co_cli) {
            try {
                const clientRes = await agentClient.request(`/clientes/${encodeURIComponent(String(invoice.co_cli).trim())}`);
                if (clientRes.success && clientRes.data) {
                    const clientData = Array.isArray(clientRes.data) ? clientRes.data[0] : clientRes.data;
                    invoice.cli_dir = clientData.direc1 || clientData.direc2 || invoice.cli_dir || invoice.direc1;
                    invoice.contribu_e = clientData.contribu_e;
                    invoice.porc_esp = clientData.porc_esp;
                }
            } catch (e) {
                console.warn('[PRINT-INVOICE] Error fetching client details:', e);
            }
        }

        let settings = {};
        try {
            const { data: sData } = await supabaseAdmin.from('system_settings').select('*').single();
            if (sData) settings = sData;
        } catch (e) {
            console.warn('[PRINT-INVOICE] Could not fetch system_settings:', e);
        }

        return {
            invoice,
            branch,
            settings,
            title: `Factura ${doc_num}`
        };

    } catch (err: any) {
        console.error('[PRINT-INVOICE] Error:', err);
        throw error(err.status || 500, err.message || 'Error interno al generar reporte.');
    }
});
