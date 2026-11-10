import { protectLoad } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { getBranchById } from '$lib/server/branches';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('pur_payments', async ({ params, url, locals, fetch }) => {
    const rawCob = params.cob_num || '';
    const cob_num = rawCob.replace(/^\$+/, '').trim();
    const allowedBranches = locals.profile?.allowed_branches || [];
    let branchId = (url.searchParams.get('branch_id') || url.searchParams.get('sede') || '').replace(/^\$+/, '').trim();

    if (!cob_num) {
        throw error(400, 'Falta el número de pago.');
    }

    try {
        // 1. Obtener la sucursal y su configuración fiscal / membrete
        let branch = await getBranchById(branchId, allowedBranches, fetch);
        if (!branch) {
            throw error(404, 'No se encontró la configuración de la sucursal.');
        }

        // 2. Consultar el pago y sus retenciones desde el Agente
        const agentClient = new AgentClient({ slug: branch.id, ...branch } as any, locals.profile || undefined, fetch);
        const res = await agentClient.request<any>(`/pagos/${encodeURIComponent(cob_num)}?sede=${encodeURIComponent(branch.id)}`);

        if (!res.success || !res.data) {
            throw error(404, 'No se pudo obtener el detalle del pago desde el agente.');
        }

        const payment = Array.isArray(res.data)
            ? (res.data.find((item: any) => item && !item.error && (item.cob_num || item.renglones)) || res.data[0])
            : res.data;

        if (!payment) {
            throw error(404, 'Pago no encontrado.');
        }

        // Sincronizar sucursal si el pago fue registrado en otra sede
        const docSede = payment?.sede_id || payment?.sede;
        if (docSede && String(docSede).toLowerCase() !== String(branch.id).toLowerCase()) {
            const realBranch = await getBranchById(docSede, allowedBranches, fetch);
            if (realBranch) branch = realBranch;
        }

        return {
            payment,
            branch,
            coIslrFilter: url.searchParams.get('co_islr') || null,
            compFilter: url.searchParams.get('comp') || null
        };
    } catch (err: any) {
        console.error('[PRINT-RETENTION-ISLR] Error:', err);
        throw error(500, err.message || 'Error al cargar el comprobante de retención de ISLR.');
    }
});
