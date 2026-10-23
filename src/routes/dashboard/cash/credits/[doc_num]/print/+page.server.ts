import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { getBranchById } from '$lib/server/branches';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('cash_credits', async ({ params, url, locals, fetch }) => {
    const { doc_num } = params;
    const allowedBranches = locals.profile?.allowed_branches || [];
    let branchId = url.searchParams.get('branch_id');

    if (!doc_num) {
        throw error(400, 'Faltan parámetros de documento o sucursal.');
    }

    try {
        // 1. Obtener datos completos de la sucursal con membrete fiscal
        let branch = await getBranchById(branchId, allowedBranches, fetch);

        if (!branch) {
            throw error(404, 'No se encontró la configuración de la sucursal.');
        }

        // 2. Obtener datos de la devolución desde el Agente
        const agentClient = new AgentClient({ slug: branch.id, ...branch } as any, locals.profile || undefined, fetch);
        const res = await agentClient.request<any>(`/devoluciones-ventas/${encodeURIComponent(doc_num.trim())}?sede=${branch.id}`);
        
        if (!res.success || !res.data) {
            throw error(404, 'No se pudo obtener el detalle de la devolución desde el agente.');
        }

        const credit = Array.isArray(res.data)
            ? (res.data.find((item: any) => item && !item.error && (item.doc_num || item.renglones)) || res.data[0])
            : res.data;

        if (!credit) {
            throw error(404, 'No se encontraron datos de la devolución solicitada.');
        }

        // Sincronizar el membrete a la sede real del documento si difiere de la sucursal de consulta
        const docSede = credit?.sede_id || credit?.sede || credit?._branch_id;
        if (docSede && String(docSede).toLowerCase() !== String(branch.id).toLowerCase()) {
            const realBranch = await getBranchById(docSede, allowedBranches, fetch);
            if (realBranch) {
                branch = realBranch;
            }
        }

        // 3. Enriquecer con datos del cliente si faltan campos
        if (credit && credit.co_cli) {
            try {
                const clientRes = await agentClient.request<any>(`/clientes/${encodeURIComponent(String(credit.co_cli).trim())}`);
                if (clientRes.success && clientRes.data) {
                    const clientData = Array.isArray(clientRes.data) ? clientRes.data[0] : clientRes.data;
                    credit.cli_dir = clientData.direc1 || clientData.direc2 || credit.cli_dir || credit.direc1;
                    credit.contribu_e = clientData.contribu_e ?? credit.contribu_e;
                    credit.porc_esp = clientData.porc_esp ?? credit.porc_esp;
                }
            } catch (e) {
                console.warn('[PRINT-CREDIT] Error fetching client details:', e);
            }
        }

        // 4. Determinar factura de origen a partir de los renglones si no viene definida
        if (!credit.factura_origen) {
            const rengs = credit.renglones || [];
            const found = rengs.find(
                (r: any) => (r.num_doc && String(r.num_doc).trim() !== "") ||
                            (r.doc_num_factura && String(r.doc_num_factura).trim() !== "")
            );
            if (found) {
                credit.factura_origen = String(found.num_doc || found.doc_num_factura).trim();
            }
        }

        let settings = {};
        try {
            const { data: sData } = await supabaseAdmin.from('system_settings').select('*').single();
            if (sData) settings = sData;
        } catch (e) {
            console.warn('[PRINT-CREDIT] Could not fetch system_settings:', e);
        }

        return {
            credit,
            branch,
            settings,
            title: `Devolución ${doc_num}`
        };

    } catch (err: any) {
        console.error('[PRINT-CREDIT] Error:', err);
        throw error(err.status || 500, err.message || 'Error interno al generar reporte.');
    }
});
