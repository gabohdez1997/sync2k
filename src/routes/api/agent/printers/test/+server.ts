import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    const profile = (locals as any).profile;
    if (!profile) {
        return json({ success: false, message: 'No autenticado.' }, { status: 401 });
    }

    // Check permissions
    if (!hasPermission(profile, 'sec_printers', 'update')) {
        return json({ success: false, message: 'No tienes permisos para probar impresoras.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { branch_id, ip_address, port } = body;

        if (!branch_id || !ip_address) {
            return json({ success: false, message: 'Faltan parámetros obligatorios.' }, { status: 400 });
        }

        // Get branch config
        const { data: branch, error: bErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branch_id)
            .single();

        if (bErr || !branch || !branch.agent_url) {
            return json({ success: false, message: 'La sucursal no tiene agente configurado.' }, { status: 400 });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, fetch);

        // Call agent printing connection test endpoint
        const response = await agentClient.request<any>('/impresion/probar', {
            method: 'POST',
            body: JSON.stringify({
                ip: ip_address,
                port: parseInt(port || '9100')
            })
        });

        if (!response || !response.success) {
            return json({ success: false, message: response?.message || 'Error al conectar con la impresora local.' });
        }

        return json({ success: true, message: 'Conectividad verificada.' });

    } catch (err: any) {
        console.error('[API PRINTER TEST ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};
