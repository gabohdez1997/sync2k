import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals, fetch: svelteFetch }) => {
    const profile = (locals as any).profile;
    if (!profile) {
        return json({ success: false, message: 'No autenticado.' }, { status: 401 });
    }

    if (!hasPermission(profile, 'cash_credits', 'read')) {
        return json({ success: false, message: 'No tienes permisos para visualizar devoluciones.' }, { status: 403 });
    }

    const branchId = url.searchParams.get('branch_id');
    const search = url.searchParams.get('search') || '';
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '20';
    const doc_num = url.searchParams.get('doc_num') || '';
    const co_cli = url.searchParams.get('co_cli') || '';
    const fec_d = url.searchParams.get('fec_d') || '';
    const fec_h = url.searchParams.get('fec_h') || '';
    const anulado = url.searchParams.get('anulado');

    // Permiso de ver terceros para devoluciones
    const canSeeOthers = hasPermission(profile, 'cash_credits', 'others');
    let co_us_in = url.searchParams.get('co_us_in') || '';

    if (!canSeeOthers) {
        const cashierCode = (profile.profit_user || '').trim().toUpperCase();
        if (!cashierCode) {
            return json({ success: false, message: 'Tu perfil no tiene asociado un código de Cajero/Usuario de Profit Plus. No puedes visualizar devoluciones.' }, { status: 403 });
        }
        co_us_in = cashierCode;
    }

    if (!branchId) {
        return json({ success: false, message: 'Parámetro branch_id es obligatorio.' }, { status: 400 });
    }

    try {
        const { data: branch, error: bErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branchId)
            .single();

        if (bErr || !branch || !branch.agent_url) {
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
            fec_h,
            ...(anulado !== null ? { anulado } : {})
        });

        const response = await agentClient.request<any>(`/devoluciones-ventas?sede=${branchId}&${queryParams.toString()}`);
        return json(response);
    } catch (err: any) {
        console.error('[API CREDITS GET ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ request, locals, fetch: svelteFetch }) => {
    const profile = (locals as any).profile;
    if (!profile) {
        return json({ success: false, message: 'No autenticado.' }, { status: 401 });
    }

    if (!hasPermission(profile, 'cash_credits', 'create')) {
        return json({ success: false, message: 'No tienes permisos para crear devoluciones.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { branch_id, credit } = body;

        if (!branch_id || !credit) {
            return json({ success: false, message: 'Faltan parámetros obligatorios (branch_id, credit).' }, { status: 400 });
        }

        const { data: branch, error: bErr } = await supabaseAdmin
            .from('branches')
            .select('*')
            .eq('id', branch_id)
            .single();

        if (bErr || !branch || !branch.agent_url) {
            return json({ success: false, message: 'Sucursal no válida o agente no configurado.' }, { status: 400 });
        }

        const agentClient = new AgentClient({
            slug: branch.id,
            agent_url: branch.agent_url,
            agent_api_key: branch.agent_token
        }, profile, svelteFetch);

        console.log('[API /api/agent/credits] Guardando devolución:', JSON.stringify(credit, null, 2));
        const response = await agentClient.request<any>(`/devoluciones-ventas?sede=${branch_id}`, {
            method: 'POST',
            body: JSON.stringify(credit)
        });
        const resAny = response as any;
        const isSuccess = response && response.success !== false && (!response.results || response.results.some((r: any) => r.success));
        const docNum = response?.data?.doc_num || resAny?.doc_num || '';
        const nroDoc = response?.data?.nro_doc || resAny?.nro_doc || '';

        if (isSuccess && docNum) {
            try {
                await supabaseAdmin.from('audit_log').insert({
                    action: 'CREATE',
                    module: 'cash_credits',
                    record_id: docNum,
                    user_email: profile.email ?? 'system',
                    branch_id: branch_id,
                    metadata: {
                        message: `Devolución ${docNum} creada con éxito (Nota de Crédito: ${nroDoc})`,
                        doc_num: docNum,
                        nro_doc: nroDoc,
                        client_code: credit.co_cli,
                        factura_origen: credit.factura_origen,
                        total_neto: response.data?.total_neto_bs
                    }
                });
            } catch (auditError) {
                console.error('Error al guardar log de auditoría de creación de devolución:', auditError);
            }
        }

        return json(response, { status: isSuccess ? 200 : 400 });
    } catch (err: any) {
        console.error('[API CREDITS POST ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};
