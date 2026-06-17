import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, fetch: svelteFetch }) => {
    console.log('[API /api/agent/orders] HIT. URL:', url.toString());
    const profile = (locals as any).profile;
    if (!profile) {
        console.warn('[API /api/agent/orders] No profile found in locals.');
        return json({ success: false, message: 'No autenticado.' }, { status: 401 });
    }

    if (!hasPermission(profile, 'cash_billing', 'read')) {
        console.warn('[API /api/agent/orders] Profile does not have cash_billing read permission.');
        return json({ success: false, message: 'No tienes permisos de facturación.' }, { status: 403 });
    }

    const branchId = url.searchParams.get('branch_id');
    const search = url.searchParams.get('search') || '';
    console.log('[API /api/agent/orders] branchId:', branchId, 'search:', search);

    if (!branchId) {
        return json({ success: false, message: 'Parámetro branch_id es obligatorio.' }, { status: 400 });
    }

    try {
        console.log('[API /api/agent/orders] Fetching branch from Supabase...');
        const { data: branch, error: bErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branchId)
            .single();

        if (bErr || !branch || !branch.agent_url) {
            console.error('[API /api/agent/orders] Branch error or no agent_url:', bErr, branch);
            return json({ success: false, message: 'Sucursal no válida o agente no configurado.' }, { status: 400 });
        }
        console.log('[API /api/agent/orders] Branch agent_url:', branch.agent_url);

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, svelteFetch);

        console.log('[API /api/agent/orders] Requesting orders from agent...');
        const response = await agentClient.request<any>(`/pedidos?sede=${branchId}&search=${encodeURIComponent(search)}&limit=50&status=0,1&anulado=0`);
        console.log('[API /api/agent/orders] Agent response success:', response?.success);

        if (!response || !response.success) {
            return json({ success: false, message: response?.message || 'Error al obtener pedidos del agente.' });
        }

        if (response.data && Array.isArray(response.data)) {
            response.data = response.data.filter((order: any) => !order.anulado && (String(order.status).trim() === '0' || String(order.status).trim() === '1'));
        }

        return json(response);
    } catch (err: any) {
        console.error('[API ORDERS LOAD ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};
