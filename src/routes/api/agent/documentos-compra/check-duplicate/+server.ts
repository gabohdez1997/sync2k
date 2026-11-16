import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
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

    if (!branchId || !nro_fact || (!co_prov && !rif)) {
        return json({ success: true, duplicate: null });
    }

    try {
        const { data: branch, error: bErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branchId)
            .single();

        if (bErr || !branch || !branch.agent_url) {
            return json({ success: false, message: 'Sucursal no válida o agente no configurado.' }, { status: 400 });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, svelteFetch);

        const queryParams = new URLSearchParams({
            sede: branchId,
            co_prov,
            rif,
            nro_fact,
            exclude_doc
        });

        const response = await agentClient.request<any>(`/documentos-compra/check-duplicate?${queryParams.toString()}`);
        return json(response);
    } catch (err: any) {
        console.error('[API CHECK DUPLICATE DOCS ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};
