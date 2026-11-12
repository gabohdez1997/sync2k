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

    if (!hasPermission(profile, 'pur_documents', 'read')) {
        return json({ success: false, message: 'No tienes permisos para consultar documentos de compra.' }, { status: 403 });
    }

    const branchId = url.searchParams.get('branch_id');
    const search = url.searchParams.get('search') || '';
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '20';
    const doc_num = url.searchParams.get('doc_num') || '';
    const nro_fact = url.searchParams.get('nro_fact') || '';
    const n_control = url.searchParams.get('n_control') || '';
    const co_prov = url.searchParams.get('co_prov') || '';
    const co_tipo_doc = url.searchParams.get('co_tipo_doc') || '';
    const status = url.searchParams.get('status') || '';
    const fec_d = url.searchParams.get('fec_d') || '';
    const fec_h = url.searchParams.get('fec_h') || '';
    const order_by = url.searchParams.get('order_by') || 'fec_emis';
    const order_dir = url.searchParams.get('order_dir') || 'DESC';

    // Permiso de ver documentos de terceros
    const canSeeOthers = hasPermission(profile, 'pur_documents', 'others');
    let co_us_in = url.searchParams.get('co_us_in') || '';

    if (!canSeeOthers) {
        const userCode = (profile.profit_user || '').trim().toUpperCase();
        if (!userCode) {
            return json({ success: false, message: 'Tu perfil no tiene asociado un código de Usuario de Profit Plus.' }, { status: 403 });
        }
        co_us_in = userCode;
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
            search,
            doc_num,
            nro_fact,
            n_control,
            co_prov,
            co_tipo_doc,
            status,
            co_us_in: co_us_in || '',
            fec_d,
            fec_h,
            order_by,
            order_dir
        });

        const response = await agentClient.request<any>(`/documentos-compra?sede=${branchId}&${queryParams.toString()}`);
        return json(response);
    } catch (err: any) {
        console.error('[API DOCS COMPRA LOAD ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ request, locals, fetch: svelteFetch }) => {
    const profile = (locals as any).profile;
    if (!profile) {
        return json({ success: false, message: 'No autenticado.' }, { status: 401 });
    }

    if (!hasPermission(profile, 'pur_documents', 'create')) {
        return json({ success: false, message: 'No tienes permisos para registrar documentos de compra.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { branch_id, document } = body;

        if (!branch_id || !document) {
            return json({ success: false, message: 'Faltan parámetros obligatorios (branch_id, document).' }, { status: 400 });
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

        const response = await agentClient.request<any>(`/documentos-compra?sede=${branch_id}`, {
            method: 'POST',
            body: JSON.stringify(document)
        });

        if (response && response.success !== false) {
            try {
                const docNum = response.doc_num || response.nro_doc || '';
                await supabaseAdmin.from('audit_log').insert({
                    action: 'CREATE',
                    module: 'pur_documents',
                    record_id: docNum,
                    user_email: profile.email ?? 'system',
                    branch_id: branch_id,
                    metadata: {
                        message: `Documento de Compra ${docNum} (${document.co_tipo_doc} - Fiscal N°: ${document.nro_fact}) registrado con éxito`,
                        doc_num: docNum,
                        co_tipo_doc: document.co_tipo_doc,
                        nro_fact: document.nro_fact,
                        supplier_code: document.co_prov,
                        total_neto: document.total_neto
                    }
                });
            } catch (auditError) {
                console.error('Error al guardar log de auditoría de documento de compra:', auditError);
            }
        }

        return json(response);
    } catch (err: any) {
        console.error('[API DOCS COMPRA SAVE ERROR]:', err);
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};

