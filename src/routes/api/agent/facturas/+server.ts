import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, fetch: svelteFetch }) => {
    console.log('[API /api/agent/facturas] HIT. URL:', url.toString());
    const profile = (locals as any).profile;
    if (!profile) {
        console.warn('[API /api/agent/facturas] No profile found in locals.');
        return json({ success: false, message: 'No autenticado.' }, { status: 401 });
    }

    if (!hasPermission(profile, 'cash_billing', 'read')) {
        console.warn('[API /api/agent/facturas] Profile does not have cash_billing read permission.');
        return json({ success: false, message: 'No tienes permisos de facturación.' }, { status: 403 });
    }

    const branchId = url.searchParams.get('branch_id');
    const search = url.searchParams.get('search') || '';
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '20';
    const doc_num = url.searchParams.get('doc_num') || '';
    const co_cli = url.searchParams.get('co_cli') || '';
    const fec_d = url.searchParams.get('fec_d') || '';
    const fec_h = url.searchParams.get('fec_h') || '';

    // Permiso de ver terceros para facturas
    const canSeeOthers = hasPermission(profile, 'cash_billing', 'others');
    let co_us_in = url.searchParams.get('co_us_in') || '';

    if (!canSeeOthers) {
        const cashierCode = (profile.profit_user || '').trim().toUpperCase();
        if (!cashierCode) {
            return json({ success: false, message: 'Tu perfil no tiene asociado un código de Cajero/Usuario de Profit Plus. No puedes visualizar facturas.' }, { status: 403 });
        }
        co_us_in = cashierCode;
    }

    if (!branchId) {
        return json({ success: false, message: 'Parámetro branch_id es obligatorio.' }, { status: 400 });
    }

    try {
        console.log('[API /api/agent/facturas] Fetching branch from Supabase...');
        const { data: branch, error: bErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branchId)
            .single();

        if (bErr || !branch || !branch.agent_url) {
            console.error('[API /api/agent/facturas] Branch error or no agent_url:', bErr, branch);
            return json({ success: false, message: 'Sucursal no válida o agente no configurado.' }, { status: 400 });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, svelteFetch);

        const queryParams = new URLSearchParams({
            page,
            limit,
            doc_num,
            co_cli,
            search,
            co_us_in: co_us_in || '',
            fec_d,
            fec_h
        });

        console.log('[API /api/agent/facturas] Requesting facturas from agent...');
        const response = await agentClient.request<any>(`/facturas?sede=${branchId}&${queryParams.toString()}`);
        return json(response);
    } catch (err: any) {
        console.error('[API FACTURAS LOAD ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ request, locals, fetch: svelteFetch }) => {
    console.log('[API /api/agent/facturas] HIT POST.');
    const profile = (locals as any).profile;
    if (!profile) {
        console.warn('[API /api/agent/facturas] No profile found in locals.');
        return json({ success: false, message: 'No autenticado.' }, { status: 401 });
    }

    if (!hasPermission(profile, 'cash_billing', 'create')) {
        console.warn('[API /api/agent/facturas] Profile does not have cash_billing create permission.');
        return json({ success: false, message: 'No tienes permisos de facturación para crear.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { branch_id, invoice } = body;

        if (!branch_id || !invoice) {
            return json({ success: false, message: 'Faltan parámetros obligatorios (branch_id, invoice).' }, { status: 400 });
        }

        console.log('[API /api/agent/facturas] Fetching branch config for branch_id:', branch_id);
        const { data: branch, error: bErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branch_id)
            .single();

        if (bErr || !branch || !branch.agent_url) {
            console.error('[API /api/agent/facturas] Branch error or no agent_url:', bErr, branch);
            return json({ success: false, message: 'Sucursal no válida o agente no configurado.' }, { status: 400 });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, svelteFetch);

        console.log('[API /api/agent/facturas] Sending save request to agent...');
        const response = await agentClient.request<any>(`/facturas?sede=${branch_id}`, {
            method: 'POST',
            body: JSON.stringify(invoice)
        });

        return json(response);
    } catch (err: any) {
        console.error('[API FACTURAS SAVE ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};

