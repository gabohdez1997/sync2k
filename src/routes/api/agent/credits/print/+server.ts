import { json } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/auth';
import type { RequestHandler } from './$types';
import { sendCreditTicket } from '$lib/server/billing-printer';

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
    const profile = (locals as any).profile;
    if (!profile) return json({ success: false, message: 'No autenticado.' }, { status: 401 });

    if (!hasPermission(profile, 'cash_credits', 'read') && !hasPermission(profile, 'cash_credits', 'create')) {
        return json({ success: false, message: 'No tienes permisos para imprimir tickets de devoluciones.' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { branch_id, doc_num, credit: inputCredit } = body;

        if (!branch_id || (!doc_num && !inputCredit)) {
            return json({ success: false, message: 'Faltan parámetros obligatorios (branch_id, doc_num o credit).' }, { status: 400 });
        }

        const email = locals.session?.user?.email || profile.email;

        const result = await sendCreditTicket({
            branch_id,
            credit: inputCredit || { doc_num },
            user_email: email,
            profile,
            fetchFn: fetch
        });

        return json(result);
    } catch (err: any) {
        console.error('[API CREDITS PRINT ERROR]:', err);
        return json({ success: false, message: 'Error interno: ' + err.message }, { status: 500 });
    }
};

