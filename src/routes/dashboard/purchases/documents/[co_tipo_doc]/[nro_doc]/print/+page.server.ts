import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { getBranchById } from '$lib/server/branches';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_documents', async ({ params, url, locals, fetch }) => {
    const { co_tipo_doc, nro_doc } = params;
    const allowedBranches = locals.profile?.allowed_branches || [];
    const branchId = url.searchParams.get('branch_id');

    if (!co_tipo_doc || !nro_doc) {
        throw error(400, 'Faltan parámetros de documento.');
    }

    try {
        let branch = await getBranchById(branchId, allowedBranches, fetch);

        if (!branch) {
            throw error(404, 'No se encontró la configuración de la sucursal.');
        }

        const agentClient = new AgentClient({ slug: branch.id, ...branch } as any, locals.profile || undefined, fetch);
        const res = await agentClient.request<any>(
            `/documentos-compra/${encodeURIComponent(co_tipo_doc.trim())}/${encodeURIComponent(nro_doc.trim())}?sede=${encodeURIComponent(branch.id)}`
        );

        if (!res.success || !res.data) {
            throw error(404, res.message || 'No se pudo obtener el detalle del documento de compra desde el agente.');
        }

        const document = Array.isArray(res.data) ? res.data[0] : res.data;

        if (!document) {
            throw error(404, 'Documento de compra no encontrado.');
        }

        // Consultar nombre completo del usuario que registró
        if (document.co_us_in) {
            try {
                const userCode = String(document.co_us_in).trim();
                const { data: profileData } = await supabaseAdmin
                    .from('profiles')
                    .select('full_name')
                    .ilike('profit_user', userCode)
                    .limit(1)
                    .maybeSingle();

                if (profileData?.full_name) {
                    document.user_name = profileData.full_name;
                }
            } catch (err) {
                console.warn('[PRINT-PURCHASE-DOC] Error resolving user profile:', err);
            }
        }

        // Sincronizar el membrete a la sede real del documento si difiere de la sucursal de consulta
        const docSede = document?.sede_id || document?.sede || document?._branch_id;
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
            console.warn('[PRINT-PURCHASE-DOC] Could not fetch system_settings:', e);
        }

        return {
            document,
            branch,
            settings,
            title: `Documento de Compra ${co_tipo_doc} ${nro_doc}`
        };
    } catch (err: any) {
        console.error('[PRINT-PURCHASE-DOC] Error:', err);
        throw error(err.status || 500, err.message || 'Error interno al generar reporte del documento de compra.');
    }
});

