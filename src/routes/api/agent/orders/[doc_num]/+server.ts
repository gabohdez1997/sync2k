import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals, fetch: svelteFetch }) => {
    console.log(`[API /api/agent/orders/${params.doc_num}] HIT. URL:`, url.toString());
    const profile = (locals as any).profile;
    if (!profile) {
        console.warn(`[API /api/agent/orders/${params.doc_num}] No profile found in locals.`);
        return json({ success: false, message: 'No autenticado.' }, { status: 401 });
    }

    if (!hasPermission(profile, 'cash_billing', 'read')) {
        console.warn(`[API /api/agent/orders/${params.doc_num}] Profile does not have cash_billing read permission.`);
        return json({ success: false, message: 'No tienes permisos de facturación.' }, { status: 403 });
    }

    const { doc_num } = params;
    const branchId = url.searchParams.get('branch_id');
    console.log(`[API /api/agent/orders/${doc_num}] branchId:`, branchId);

    if (!doc_num || !branchId) {
        return json({ success: false, message: 'Faltan parámetros obligatorios (doc_num, branch_id).' }, { status: 400 });
    }

    try {
        console.log(`[API /api/agent/orders/${doc_num}] Fetching branch from Supabase...`);
        const { data: branch, error: bErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branchId)
            .single();

        if (bErr || !branch || !branch.agent_url) {
            console.error(`[API /api/agent/orders/${doc_num}] Branch error or no agent_url:`, bErr, branch);
            return json({ success: false, message: 'Sucursal no válida o agente no configurado.' }, { status: 400 });
        }
        console.log(`[API /api/agent/orders/${doc_num}] Branch agent_url:`, branch.agent_url);

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, svelteFetch);

        console.log(`[API /api/agent/orders/${doc_num}] Requesting order details from agent...`);
        const response = await agentClient.request<any>(`/pedidos/${doc_num.trim()}?sede=${branchId}`);
        console.log(`[API /api/agent/orders/${doc_num}] Agent response success:`, response?.success);

        if (!response || !response.success) {
            return json({ success: false, message: response?.message || 'Error al obtener detalle del pedido.' });
        }

        if (response.data && response.data.length > 0) {
            const order = response.data[0];
            if (order.anulado) {
                return json({ success: false, message: 'El pedido seleccionado está anulado y no puede ser facturado.' });
            }
            const statusStr = String(order.status).trim();
            if (statusStr !== '0' && statusStr !== '1') {
                return json({ success: false, message: 'El pedido seleccionado ya ha sido procesado o facturado por completo.' });
            }
        }

        return json(response);
    } catch (err: any) {
        console.error('[API ORDER DETAIL LOAD ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};
