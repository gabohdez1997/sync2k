import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';

export async function GET({ url, locals, fetch }) {
    const prefix = url.searchParams.get('prefix');
    if (!prefix) return json({ error: 'Prefijo requerido' }, { status: 400 });

    try {
        const { data: dbBranches } = await supabaseAdmin
            .from('branches')
            .select('id, name, agent_url, agent_token, active, profit_branch_codes')
            .eq('active', true)
            .limit(1);

        if (!dbBranches || dbBranches.length === 0) {
            return json({ error: 'No hay sucursales configuradas.' }, { status: 500 });
        }

        const branch = dbBranches[0];
        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, locals.profile || undefined, fetch);

        const res = await agentClient.request(`/articulos/next-code?prefix=${prefix}`);
        return json(res);
    } catch (e: any) {
        return json({ error: e.message }, { status: 500 });
    }
}
