import { json } from '@sveltejs/kit';
import { AgentClient } from '$lib/server/agent';
import { hasPermission } from '$lib/server/auth';
import type { RequestHandler } from './$types';
import { sendCancellationNotificationTicket } from '$lib/server/billing-printer';

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
    const profile = (locals as any).profile;
    if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

    if (!hasPermission(profile, 'cash_billing', 'read')) {
        return json({ success: false, message: 'No tienes permisos de facturación.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { branch_id, doc_num, invoice: inputInvoice, action_type, motivo } = body;

        if (!branch_id || (!doc_num && !inputInvoice)) {
            return json({ success: false, message: 'Faltan parámetros obligatorios (branch_id, doc_num o invoice).' }, { status: 400 });
        }

        let invoice = inputInvoice;
        const branch = profile.allowed_branches?.find((b: any) => b.id === branch_id);
        const agentClient = branch ? new AgentClient(branch, profile, fetch) : undefined;

        // Si no se pasaron los renglones, buscar el detalle completo de la factura con el agente
        if (!invoice?.renglones && doc_num && agentClient) {
            try {
                const getRes = await agentClient.request<any>(`/facturas/${doc_num}?sede=${branch_id}`);
                invoice = Array.isArray(getRes?.data) ? getRes.data[0] : getRes?.data;
            } catch (err: any) {
                console.warn('[PRINT CANCEL] No se pudo obtener detalle previo de la factura:', err.message);
            }
        }

        if (!invoice) {
            invoice = { doc_num };
        }

        const email = locals.session?.user?.email || profile.email;

        const result = await sendCancellationNotificationTicket({
            branch_id,
            invoice,
            action_type: action_type || 'ANULACION',
            user_email: email,
            motivo,
            profile,
            agentClient,
            fetchFn: fetch
        });

        return json(result);
    } catch (err: any) {
        console.error('[API BILLING PRINT CANCEL ERROR]:', err);
        return json({ success: false, message: 'Error interno: ' + err.message }, { status: 500 });
    }
};
