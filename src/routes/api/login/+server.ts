import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminAuth, adminDb, MasterCollections } from '$lib/server/firebase-admin';

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const { idToken } = await request.json();

    if (!idToken || !adminAuth) {
      return json({ error: 'Missing token or Admin not initialized' }, { status: 400 });
    }

    // Set session cookie expiration to 5 days
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    
    // Create the session cookie
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    // --- AUTO-REPAIR: Migración de Email a UID en Firestore ---
    if (adminDb && email) {
        const userUidDoc = await adminDb.collection(MasterCollections.USERS).doc(uid).get();
        if (!userUidDoc.exists) {
            const userEmailDoc = await adminDb.collection(MasterCollections.USERS).doc(email).get();
            if (userEmailDoc.exists) {
                console.log(`[AUTO-REPAIR] Migrating profile ${email} -> ${uid}`);
                const data = userEmailDoc.data();
                const batch = adminDb.batch();
                
                // 1. Crear nuevo con UID
                batch.set(adminDb.collection(MasterCollections.USERS).doc(uid), {
                    ...data,
                    uid: uid,
                    updatedAt: new Date().toISOString()
                });

                // 2. Migrar roles de empresa
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

                // 3. Borrar el viejo
                batch.delete(userEmailDoc.ref);
                
                await batch.commit();
            }
        }
    }

    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    // Set cookie
    cookies.set('session', sessionCookie, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: expiresIn / 1000
    });

    return json({ success: true });

  } catch (error: any) {
    console.error('Login API error:', error);
    return json({ error: 'Unauthorized request!' }, { status: 401 });
  }
};
