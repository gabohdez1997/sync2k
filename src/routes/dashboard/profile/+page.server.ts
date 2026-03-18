// src/routes/dashboard/profile/+page.server.ts
import { adminAuth, adminDb, MasterCollections } from '$lib/server/firebase-admin';
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
        if (!session || !adminAuth || !adminDb) {
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
            const uid = session.uid;
            
            // 1. Actualizar en Firebase Auth
            const authUpdate: any = { displayName: fullName };
            if (password) {
                authUpdate.password = password;
            }
            await adminAuth.updateUser(uid, authUpdate);

            // 2. Actualizar en Firestore (BD Master)
            await adminDb.collection(MasterCollections.USERS).doc(uid).update({
                full_name: fullName,
                updatedAt: new Date().toISOString()
            });

            // 3. Auditoría
            await logAction({
                uid: uid,
                user_email: session.email || 'unknown',
                action: 'UPDATE',
                entity: 'perfil',
                entity_id: uid,
                details: { fullName, hasPasswordChange: !!password }
            });

            return { success: true, message: 'Perfil actualizado correctamente' };
        } catch (error: any) {
            console.error('Error updating profile:', error);
            return fail(500, { message: 'Error interno al actualizar el perfil' });
        }
    }
};
