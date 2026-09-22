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
        const { branch_id, broadcast = true, items } = body;

        const allBranches = await getActiveBranches(svelteFetch);
        const profileAllowed = profile?.allowed_branches || [];
        const profileBranchIds: string[] = Array.isArray(profileAllowed) 
            ? profileAllowed.map((b: any) => (typeof b === 'object' ? b.id : b))
            : [];
        const isAdmin = profileBranchIds.length === 0;
        const allowedBranches = isAdmin ? allBranches : allBranches.filter(b => profileBranchIds.includes(b.id));

        const targetBranches = broadcast
            ? allowedBranches.filter((b: any) => b.agent_url)
            : allowedBranches.filter((b: any) => b.id === branch_id && b.agent_url);

        if (targetBranches.length === 0) {
            return json({ success: false, message: 'Sucursal no válida o no hay agentes configurados.' }, { status: 400 });
        }

        const outcomes = await Promise.allSettled(
            targetBranches.map(async (target) => {
                const client = new AgentClient({
                    slug: target.id,
                    agent_url: target.agent_url,
                    agent_api_key: target.agent_token
                }, profile, svelteFetch);

                return client.request<any>(`/articulos/batch-update-prices?sede=${target.id}`, {
                    method: 'POST',
                    body: JSON.stringify({ items: items || [] })
                });
            })
        );

        const results: any[] = [];
        let successCount = 0;

        for (let i = 0; i < targetBranches.length; i++) {
            const b = targetBranches[i];
            const outcome = outcomes[i];

            if (outcome.status === 'fulfilled') {
                const resData = outcome.value;
                if (resData?.success) {
                    successCount++;
                    results.push({
                        sede_id: b.id,
                        sede_nombre: b.name,
                        success: true,
                        ...(resData.results?.[0] || {})
                    });
                } else {
                    results.push({
                        sede_id: b.id,
                        sede_nombre: b.name,
                        success: false,
                        error: resData?.message || 'Error desconocido reportado por el agente.'
                    });
                }
            } else {
                results.push({
                    sede_id: b.id,
                    sede_nombre: b.name,
                    success: false,
                    error: outcome.reason?.message || 'Error de conexión con el agente de la sede.'
                });
            }
        }

        const allOk = successCount === targetBranches.length;
        const anyOk = successCount > 0;

        return json({
            success: anyOk,
            message: allOk 
                ? 'Precios actualizados en todas las sedes con éxito.' 
                : anyOk 
                    ? 'Precios actualizados parcialmente (algunas sedes fallaron).' 
                    : 'Error al actualizar precios en las sedes.',
            results
        });
    } catch (err: any) {
        console.error('[API BATCH UPDATE PRICES ERROR]:', err);
        return json({ success: false, message: err.message || 'Error al actualizar precios.' }, { status: 500 });
    }
};
