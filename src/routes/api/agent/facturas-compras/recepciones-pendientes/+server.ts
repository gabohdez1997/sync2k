import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, fetch: svelteFetch }) => {
    const profile = (locals as any).profile;
    if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

    if (!hasPermission(profile, 'pur_invoices', 'read')) {
        return json({ success: false, message: 'No tienes permisos para consultar recepciones pendientes.' }, { status: 403 });
    }

    const branchId = url.searchParams.get('branch_id');
    const search = url.searchParams.get('search') || '';
    const co_prov = url.searchParams.get('co_prov') || '';

    if (!branchId) {
        return json({ success: false, message: 'Parámetro branch_id es obligatorio.' }, { status: 400 });
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
            search,
            co_prov
        });

        const response = await agentClient.request<any>(`/facturas-compras/recepciones/pendientes?${queryParams.toString()}`);
        return json(response);
    } catch (err: any) {
        console.error('[API RECEPCIONES PENDIENTES ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};
