import { json } from '@sveltejs/kit';
import { getActiveBranches } from '$lib/server/branches';
import { AgentClient } from '$lib/server/agent';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, fetch: svelteFetch }) => {
    const profile = (locals as any).profile;
    if (!profile) {
        return json({ success: false, message: 'No autenticado.' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { branch_id, items } = body;

        const allBranches = await getActiveBranches(svelteFetch);
        const profileAllowed = profile?.allowed_branches || [];
        const profileBranchIds: string[] = Array.isArray(profileAllowed) 
            ? profileAllowed.map((b: any) => (typeof b === 'object' ? b.id : b))
            : [];
        const isAdmin = profileBranchIds.length === 0;
        const allowedBranches = isAdmin ? allBranches : allBranches.filter(b => profileBranchIds.includes(b.id));

        const branch = allowedBranches.find((b: any) => b.id === branch_id) || allowedBranches[0];

        if (!branch || !branch.agent_url) {
            return json({ success: false, message: 'Sucursal no válida o agente no configurado.' }, { status: 400 });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, svelteFetch);

        const response = await agentClient.request<any>('/articulos/preview-price-changes', {
            method: 'POST',
            body: JSON.stringify({
                sede: branch.id,
                items: items || []
            })
        });

        return json(response);
    } catch (err: any) {
        console.error('[API PREVIEW PRICE CHANGES ERROR]:', err);
        return json({ success: false, message: err.message || 'Error al obtener preview de precios.' }, { status: 500 });
    }
};
