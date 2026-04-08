// src/routes/dashboard/profile/+page.server.ts
import { supabaseAdmin } from '$lib/server/supabase';
import { logAction } from '$lib/server/audit';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.session) {
        throw redirect(303, '/');
    }
    return {
        profile: locals.profile
    };
};

export const actions: Actions = {
    updateProfile: async ({ request, locals }) => {
        const session = locals.session;
        if (!session) {
            return fail(401, { message: 'No autorizado' });
        }

        const formData = await request.formData();
        const fullName = formData.get('full_name') as string;
        const password = formData.get('password') as string;
        const confirmPassword = formData.get('confirm_password') as string;

        if (!fullName) {
            return fail(400, { message: 'El nombre completo es obligatorio' });
        }

        if (password && password !== confirmPassword) {
            return fail(400, { message: 'Las contraseñas no coinciden' });
        }

        try {
            const userId = session.user.id;
            
            // 1. Actualizar en Supabase Auth (si hay password)
            if (password) {
                const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
                    password: password
                });
                if (authError) throw authError;
            }

            // 2. Actualizar en la tabla 'profiles' (BD Supabase)
            const { error: profileError } = await supabaseAdmin
                .from('profiles')
                .update({
                    full_name: fullName,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);

            if (profileError) throw profileError;

            // 3. Auditoría
            await logAction({
                uid: userId,
                user_email: session.user.email || 'unknown',
                action: 'UPDATE',
                entity: 'perfil',
                entity_id: userId,
                details: { fullName, hasPasswordChange: !!password }
            });

            return { success: true, message: 'Perfil actualizado correctamente' };
        } catch (error: any) {
            console.error('Error updating profile:', error);
            return fail(500, { message: 'Error interno al actualizar el perfil: ' + error.message });
        }
    }
};
