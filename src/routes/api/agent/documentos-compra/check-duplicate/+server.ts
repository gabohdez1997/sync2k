import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import { getActiveBranches } from '$lib/server/branches';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, fetch: svelteFetch }) => {
    const profile = (locals as any).profile;
    if (!profile) {
        return json({ success: false, message: 'No autenticado.' }, { status: 401 });
    }

    if (!hasPermission(profile, 'pur_documents', 'read') && !hasPermission(profile, 'pur_documents', 'create')) {
        return json({ success: false, message: 'No tienes permisos para consultar documentos de compra.' }, { status: 403 });
    }

    const branchId = url.searchParams.get('branch_id');
    const co_prov = url.searchParams.get('co_prov') || '';
    const rif = url.searchParams.get('rif') || '';
    const nro_fact = url.searchParams.get('nro_fact') || '';
    const exclude_doc = url.searchParams.get('exclude_doc') || '';

    if (!nro_fact || (!co_prov && !rif)) {
        return json({ success: true, duplicate: null });
    }

    try {
        // Obtener todas las sucursales activas configuradas
        let branchesToQuery: any[] = [];
        try {
            const allBranches = await getActiveBranches(svelteFetch);
            branchesToQuery = (allBranches || []).filter(b => b && b.agent_url && b.active !== false);
        } catch (eBranch) {
            console.warn('[CHECK DUPLICATE] Error consultando getActiveBranches:', eBranch);
        }

        // Si no se obtuvieron sucursales en caché o no está la actual, buscar directamente en DB
        if (branchesToQuery.length === 0 || (branchId && !branchesToQuery.some(b => String(b.id).toLowerCase() === String(branchId).toLowerCase()))) {
            const { data: dbBranches } = await supabaseAdmin
                .from('branches')
                .select('*')
                .eq('active', true);
            if (dbBranches && dbBranches.length > 0) {
                branchesToQuery = dbBranches.filter(b => b.agent_url);
            }
        }

        if (branchesToQuery.length === 0) {
            return json({ success: true, duplicate: null });
        }

        // Consultar los agentes de todas las sucursales en paralelo
        const checkPromises = branchesToQuery.map(async (b) => {
            try {
                const agentClient = new AgentClient({
                    slug: b.id,
                    agent_url: b.agent_url,
                    agent_api_key: b.agent_token
                }, profile, svelteFetch);

                const isCurrent = branchId && String(b.id).toLowerCase() === String(branchId).toLowerCase();
                const queryParams = new URLSearchParams({
                    sede: b.id,
                    co_prov,
                    rif,
                    nro_fact,
                    exclude_doc: isCurrent ? exclude_doc : ''
                });

                const resp = await agentClient.request<any>(`/documentos-compra/check-duplicate?${queryParams.toString()}`);
                if (resp && resp.duplicate) {
                    return resp.duplicate;
                }
            } catch (errBranch: any) {
                console.warn(`[CHECK DUPLICATE] Error consultando sucursal ${b.name || b.id}:`, errBranch?.message);
            }
            return null;
        });

        const results = await Promise.all(checkPromises);
        const duplicateMatch = results.find(d => d != null);

        return json({ success: true, duplicate: duplicateMatch || null });
    } catch (err: any) {
        console.error('[API CHECK DUPLICATE DOCS ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};
