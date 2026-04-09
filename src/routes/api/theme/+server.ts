import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals }) => {
    const session = locals.session;
    if (!session) {
        return json({ error: 'No autorizado' }, { status: 401 });
    }

    try {
        const { theme_config } = await request.json();
        const userId = session.user.id;

        // Intentar actualizar Supabase
        const { error } = await supabaseAdmin
            .from('profiles')
            .update({ theme_config })
            .eq('id', userId);

        if (error) {
            console.warn('[API/THEME] Error en Supabase:', error.message);
            // Even if Supabase fails (e.g. offline), we proceed to try local.
        }

        // Actualización en la BD local para asegurar sincronía si algo falla,
        // o si estamos en modo offline/fallback.
        try {
            const { queryLocalDb } = await import('$lib/server/local-db');
            await queryLocalDb('UPDATE profiles SET theme_config = $1::jsonb WHERE id = $2', [JSON.stringify(theme_config), userId]);
        } catch (e: any) {
             console.warn('[API/THEME] Error actualizando BD local:', e.message);
        }

        return json({ success: true });
    } catch (err: any) {
        return json({ error: err.message }, { status: 500 });
    }
};
