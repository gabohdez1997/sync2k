import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals, fetch: svelteFetch }) => {
    const profile = (locals as any).profile;
    if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

    if (!hasPermission(profile, 'cash_credits', 'read')) {
        return json({ success: false, message: 'No tienes permisos para consultar devoluciones.' }, { status: 403 });
    }

    const doc_num = params.doc_num;
    const branchId = url.searchParams.get('branch_id');

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

        const response = await agentClient.request<any>(`/devoluciones-ventas/${doc_num.trim()}?sede=${branchId}`);
        return json(response);
    } catch (err: any) {
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};

export const DELETE: RequestHandler = async ({ params, url, locals, fetch: svelteFetch }) => {
    const profile = (locals as any).profile;
    if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

    if (!hasPermission(profile, 'cash_credits', 'delete')) {
        return json({ success: false, message: 'No tienes permisos para eliminar devoluciones.' }, { status: 403 });
    }

    const doc_num = params.doc_num;
    const branchId = url.searchParams.get('branch_id');

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

        const response = await agentClient.request<any>(
            `/devoluciones-ventas/${encodeURIComponent(doc_num.trim())}?sede=${encodeURIComponent(branchId)}`,
            { method: 'DELETE' }
        );

        if (response && response.success !== false) {
            try {
                await supabaseAdmin.from('audit_log').insert({
                    action: 'DELETE',
                    module: 'cash_credits',
                    record_id: doc_num.trim(),
                    user_email: profile.email ?? 'system',
                    branch_id: branchId,
                    metadata: {
                        message: `Devolución ${doc_num.trim()} eliminada permanentemente`,
                        doc_num: doc_num.trim(),
                        deleted_docs: response?.data?.deleted_docs || []
                    }
                });
            } catch (auditError) {
                console.error('Error al guardar log de auditoría de eliminación de devolución:', auditError);
            }
        }

        return json(response);
    } catch (err: any) {
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};
