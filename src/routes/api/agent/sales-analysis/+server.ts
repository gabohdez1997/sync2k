import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, fetch }) => {
    try {
        const profile = locals.profile;
        if (!profile) return json({ error: 'Sesión no válida' }, { status: 401 });

        const branchId = url.searchParams.get('branch_id');
        const allowedBranches = profile.allowed_branches || [];
        const branch = allowedBranches.find(b => b.id === branchId) || allowedBranches[0];

        if (!branch || !branch.agent_url) {
            return json({ error: 'Sucursal no configurada' }, { status: 400 });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, fetch);

        const startDate = url.searchParams.get('startDate') || '';
        const endDate = url.searchParams.get('endDate') || '';
        const coArt = url.searchParams.get('co_art') || '';
        const coVen = url.searchParams.get('co_ven') || '';

        let agentUrl = '';
        if (coArt) {
            agentUrl = `/analisis-ventas/article-vendors?sede=${branch.id}&co_art=${encodeURIComponent(coArt)}`;
            if (startDate) agentUrl += `&startDate=${encodeURIComponent(startDate)}`;
            if (endDate) agentUrl += `&endDate=${encodeURIComponent(endDate)}`;
        } else {
            agentUrl = `/analisis-ventas?sede=${branch.id}`;
            if (startDate) agentUrl += `&startDate=${encodeURIComponent(startDate)}`;
            if (endDate) agentUrl += `&endDate=${encodeURIComponent(endDate)}`;
            if (coVen) agentUrl += `&co_ven=${encodeURIComponent(coVen)}`;
        }

        const response = await agentClient.request<any>(
            agentUrl,
            { method: 'GET' }
        );

        if (response && response.success) {
            return json(response);
        } else {
            return json({ error: response?.message || 'Error al consultar análisis de ventas' }, { status: 500 });
        }
    } catch (e: any) {
        console.error('[API /agent/sales-analysis ERROR]:', e);
        return json({ error: e.message || 'Error interno del servidor' }, { status: 500 });
    }
};
