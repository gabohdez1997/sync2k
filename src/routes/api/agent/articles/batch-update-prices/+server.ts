import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, fetch: svelteFetch }) => {
    const profile = (locals as any).profile;
    if (!profile) {
        return json({ success: false, message: 'No autenticado.' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { branch_id, broadcast = true, items } = body;

        const allowedBranches = profile.allowed_branches || [];
        const branch = allowedBranches.find((b: any) => b.id === branch_id) || allowedBranches[0];

        if (!branch || !branch.agent_url) {
            return json({ success: false, message: 'Sucursal no válida o agente no configurado.' }, { status: 400 });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, svelteFetch);

        const queryParam = broadcast ? '' : `?sede=${branch.id}`;
        const response = await agentClient.request<any>(`/articulos/batch-update-prices${queryParam}`, {
            method: 'POST',
            body: JSON.stringify({ items: items || [] })
        });

        return json(response);
    } catch (err: any) {
        console.error('[API BATCH UPDATE PRICES ERROR]:', err);
        return json({ success: false, message: err.message || 'Error al actualizar precios.' }, { status: 500 });
    }
};
