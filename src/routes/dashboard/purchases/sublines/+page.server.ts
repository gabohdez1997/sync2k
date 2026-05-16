import { protectLoad, protectAction } from '$lib/server/permissions';
import { AgentClient } from '$lib/server/agent';
import { supabaseAdmin } from '$lib/server/supabase';
import { fail } from '@sveltejs/kit';
import { logAction } from '$lib/server/audit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = protectLoad('pur_sublines', async ({ locals, fetch }) => {
    try {
        const userProfile = (locals as any).profile;

        const { data: dbBranches } = await supabaseAdmin
            .from('branches')
            .select('id, name, agent_url, agent_token, active')
            .eq('active', true)
            .order('sort_order');

        if (!dbBranches || dbBranches.length === 0) {
            return { sublines: [], lines: [], error: 'No hay sucursales configuradas.' };
        }

        const firstBranch = dbBranches.find(b => b.agent_url);
        if (!firstBranch) return { sublines: [], lines: [], error: 'No hay agentes disponibles.' };

        const agent = new AgentClient({
            slug: firstBranch.id,
            agent_url: firstBranch.agent_url,
            agent_api_key: firstBranch.agent_token
        }, userProfile || undefined, fetch);

        const [subRes, linRes] = await Promise.all([
            agent.request<any>('/catalogos/sublineas').catch(() => ({ data: [] })),
            agent.request<any>('/catalogos/lineas').catch(() => ({ data: [] }))
        ]);

        const sublines = (subRes as any).data || [];
        const lines = (linRes as any).data || [];

        return {
            sublines,
            lines,
            crud: userProfile?.permissions?.pur_sublines || { create: false, update: false, delete: false, read: true }
        };
    } catch (e: any) {
        return { sublines: [], lines: [], error: `Error: ${e.message}` };
    }
});

export const actions: Actions = {
    saveSubline: protectAction('pur_sublines', async ({ request, locals, fetch }) => {
        const formData = await request.formData();
        const co_subl = formData.get('co_subl')?.toString().trim();
        const subl_des = formData.get('subl_des')?.toString().trim();
        const co_lin = formData.get('co_lin')?.toString().trim();
        const is_new = formData.get('is_new') === 'true';

        if (!co_subl || !subl_des || !co_lin) {
            return fail(400, { error: 'Código, descripción y línea son obligatorios.' });
        }

        const { data: dbBranches } = await supabaseAdmin
            .from('branches')
            .select('id, name, agent_url, agent_token, active')
            .eq('active', true);

        if (!dbBranches || dbBranches.length === 0) {
            return fail(500, { error: 'No hay sucursales configuradas.' });
        }

        const userProfile = (locals as any).profile;
        const errors: string[] = [];
        let successCount = 0;

        for (const branch of dbBranches) {
            if (!branch.agent_url) continue;

            const agent = new AgentClient({
                slug: branch.id,
                agent_url: branch.agent_url,
                agent_api_key: branch.agent_token
            }, userProfile || undefined, fetch);

            try {
                const endpoint = is_new ? '/catalogos/sublineas' : `/catalogos/sublineas/${encodeURIComponent(co_subl)}`;
                const method = is_new ? 'POST' : 'PUT';
                const res = await agent.request(endpoint, {
                    method,
                    body: JSON.stringify({ co_subl, subl_des, co_lin })
                });

                if ((res as any).success === false) {
                    errors.push(`[${branch.name}] ${(res as any).message || 'Error'}`);
                } else {
                    successCount++;
                    await logAction({
                        uid: userProfile?.id ?? null,
                        user_email: userProfile?.email ?? 'system',
                        action: is_new ? 'CREATE' : 'UPDATE',
                        module: 'pur_sublines',
                        record_id: co_subl,
                        branch_id: branch.id,
                        new_data: { co_subl, subl_des, co_lin },
                        source: 'cloud'
                    });
                }
            } catch (err: any) {
                errors.push(`[${branch.name}] ${err.message}`);
            }
        }

        if (successCount === 0) {
            return fail(500, { error: 'Fallo en todas las sedes:\n' + errors.join('\n') });
        }

        if (errors.length > 0) {
            return { success: true, warning: 'Guardado con advertencias:\n' + errors.join('\n') };
        }

        return { success: true };
    })
};
