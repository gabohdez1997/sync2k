import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { getBranchById } from '$lib/server/branches';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_invoices', async ({ params, url, locals, fetch }) => {
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

        // 2. Obtener datos de la factura de compra desde el Agente
        const agentClient = new AgentClient({ slug: branch.id, ...branch } as any, locals.profile || undefined, fetch);
        const res = await agentClient.request<any>(`/facturas-compras/${encodeURIComponent(doc_num.trim())}?sede=${encodeURIComponent(branch.id)}`);
        
        if (!res.success || !res.data) {
            throw error(404, 'No se pudo obtener el detalle de la factura de compra desde el agente.');
        }

        const invoice = Array.isArray(res.data)
            ? (res.data.find((item: any) => item && !item.error && (item.doc_num || item.renglones)) || res.data[0])
            : res.data;

        if (!invoice) {
            throw error(404, 'Factura de compra no encontrada.');
        }

        // Sincronizar el membrete a la sede real del documento si difiere de la sucursal de consulta
        const docSede = invoice?.sede_id || invoice?.sede || invoice?._branch_id;
        if (docSede && String(docSede).toLowerCase() !== String(branch.id).toLowerCase()) {
            const realBranch = await getBranchById(docSede, allowedBranches, fetch);
            if (realBranch) {
                branch = realBranch;
            }
        }

        let settings: any = {};
        try {
            const { data: sData } = await supabaseAdmin.from('system_settings').select('*').single();
            if (sData) settings = sData;
        } catch (e) {
            console.warn('[PRINT-PURCHASE-INVOICE] Could not fetch system_settings:', e);
        }

        return {
            invoice,
            branch,
            settings,
            title: `Factura de Compra ${doc_num}`
        };

    } catch (err: any) {
        console.error('[PRINT-PURCHASE-INVOICE] Error:', err);
        throw error(err.status || 500, err.message || 'Error interno al generar reporte de factura de compra.');
    }
});
