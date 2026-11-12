import { json } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, locals, fetch: svelteFetch }) => {
    const profile = (locals as any).profile;
    if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

    if (!hasPermission(profile, 'pur_documents', 'read')) {
        return json({ success: false, message: 'No tienes permisos para consultar documentos de compra.' }, { status: 403 });
    }

    const { co_tipo_doc, nro_doc } = params;
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

        const response = await agentClient.request<any>(`/documentos-compra/${co_tipo_doc.trim()}/${nro_doc.trim()}?sede=${branchId}`);
        return json(response);
    } catch (err: any) {
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};

export const DELETE: RequestHandler = async ({ params, url, locals, fetch: svelteFetch }) => {
    const profile = (locals as any).profile;
    if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

    if (!hasPermission(profile, 'pur_documents', 'delete')) {
        return json({ success: false, message: 'No tienes permisos para eliminar documentos de compra.' }, { status: 403 });
    }

    const { co_tipo_doc, nro_doc } = params;
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

        const response = await agentClient.request<any>(`/documentos-compra/${co_tipo_doc.trim()}/${nro_doc.trim()}?sede=${branchId}`, {
            method: 'DELETE'
        });

        if (response && response.success !== false) {
            try {
                await supabaseAdmin.from('audit_log').insert({
                    action: 'DELETE',
                    module: 'pur_documents',
                    record_id: nro_doc,
                    user_email: profile.email ?? 'system',
                    branch_id: branchId,
                    metadata: {
                        message: `Documento de compra ${co_tipo_doc} ${nro_doc} eliminado con éxito`,
                        co_tipo_doc,
                        nro_doc
                    }
                });
            } catch (auditErr) {
                console.error('[AUDIT ERROR] Error logging doc compra delete:', auditErr);
            }
        }

        return json(response);
    } catch (err: any) {
        return json({ success: false, message: 'Error de servidor: ' + err.message }, { status: 500 });
    }
};

