// src/routes/dashboard/audit/+page.server.ts
import { adminDb, MasterCollections } from '$lib/server/firebase-admin';
import { protectLoad } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sec_audit', async ({ locals }) => {
    let logs: any[] = [];
    let tenants: any[] = [];

    if (adminDb) {
        try {
            // 1. Fetch Logs (Limited to 200 for now, ordered by newer first)
            const logsSnap = await adminDb.collection(MasterCollections.AUDIT)
                .orderBy('timestamp', 'desc')
                .limit(200)
                .get();
            
            logs = logsSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // 2. Fetch Tenants for lookup
            const tenantsSnap = await adminDb.collection(MasterCollections.CONNECTIONS).get();
            tenants = tenantsSnap.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name || doc.id
            }));

        } catch (error) {
            console.error('Error loading audit logs:', error);
        }
    }

    return {
        logs,
        tenants
    };
});
