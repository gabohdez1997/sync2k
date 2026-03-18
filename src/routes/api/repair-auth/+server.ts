// src/routes/api/repair-auth/+server.ts
import { json } from '@sveltejs/kit';
import { adminAuth, adminDb, MasterCollections } from '$lib/server/firebase-admin';

/**
 * ESTA ES UNA RUTA DE EMERGENCIA TEMPORAL. 
 * ELIMÍNALA DESPUÉS DE LOGRAR ENTRAR.
 */
export const GET = async () => {
    if (!adminAuth || !adminDb) {
        return json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const email = "gabohdez1997@gmail.com";
    const newPassword = "Sync2k_2024_Admin!";

    try {
        console.log(`[EMERGENCY] Repairing user ${email}...`);
        
        // 1. Resetear password en Auth (o crear si no existe)
        let uid: string;
        try {
            const user = await adminAuth.getUserByEmail(email);
            uid = user.uid;
            await adminAuth.updateUser(uid, { password: newPassword });
        } catch (authErr: any) {
            if (authErr.code === 'auth/user-not-found') {
                const newUser = await adminAuth.createUser({
                    email,
                    password: newPassword,
                    displayName: "Gabo Hdez",
                    emailVerified: true
                });
                uid = newUser.uid;
            } else {
                throw authErr;
            }
        }

        // 2. Asegurarse de que el perfil en Firestore use el UID correcto
        // (Esto es por si el autorepair del login no alcanzara a dispararse)
        const userEmailDoc = await adminDb.collection(MasterCollections.USERS).doc(email).get();
        if (userEmailDoc.exists) {
            const data = userEmailDoc.data();
            const batch = adminDb.batch();
            
            // Mover a UID
            batch.set(adminDb.collection(MasterCollections.USERS).doc(uid), {
                ...data,
                uid: uid,
                is_active: true,
                updatedAt: new Date().toISOString()
            });

            // Mover roles por empresa
            const trSnap = await adminDb.collection(MasterCollections.USER_TENANTS).where('uid', '==', email).get();
            trSnap.docs.forEach(d => {
                const trData = d.data();
                if (adminDb) {
                    batch.set(adminDb.collection(MasterCollections.USER_TENANTS).doc(`${uid}_${trData.tenant_slug}`), {
                        ...trData,
                        uid: uid
                    });
                    batch.delete(d.ref);
                }
            });

            // Borrar el viejo (email-indexed)
            batch.delete(userEmailDoc.ref);
            await batch.commit();
        }

        return json({ 
            success: true, 
            message: `Usuario ${email} reparado.`,
            new_creds: {
                user: email,
                pass: newPassword
            },
            instruction: "PRUEBA INICIAR SESIÓN AHORA. LUEGO BORRA ESTE ARCHIVO (+server.ts)."
        });

    } catch (error: any) {
        console.error('[EMERGENCY] Error:', error);
        return json({ error: error.message }, { status: 500 });
    }
};
