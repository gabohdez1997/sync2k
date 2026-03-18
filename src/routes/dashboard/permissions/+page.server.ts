// src/routes/dashboard/permissions/+page.server.ts
import { adminDb, MasterCollections } from '$lib/server/firebase-admin';
import { logAction } from '$lib/server/audit';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

// Helper para evitar bloqueos infinitos
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
	const timeout = new Promise<never>((_, reject) => {
		setTimeout(() => reject(new Error(`Timeout: ${label} excedió los ${ms}ms`)), ms);
	});
	return Promise.race([promise, timeout]);
};

// ─── Load ────────────────────────────────────────────────────────────────────

export const load: PageServerLoad = async ({ locals }) => {
  if (!adminDb) {
    return { roles: [] };
  }

  try {
    const snapshot = await withTimeout(
      adminDb.collection(MasterCollections.PERMISSIONS).get(),
      5000,
      'Load Roles'
    );
    const roles = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name ?? doc.id,
        permissions: data.permissions ?? {},
        updatedAt: data.updatedAt 
          ? (typeof data.updatedAt === 'string' ? data.updatedAt : (data.updatedAt.toDate?.()?.toISOString() || data.updatedAt.toString()))
          : null
      };
    });

    return { roles };
  } catch (err) {
    console.error('Error loading roles:', err);
    return { roles: [] };
  }
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export const actions: Actions = {

  /**
   * Crea o actualiza un rol en Firestore.
   */
  saveRole: async ({ request, locals }) => {
    if (!adminDb) return fail(500, { error: 'Firebase no disponible' });

    const formData = await request.formData();
    const roleId    = (formData.get('roleId') as string)?.trim() || null;
    const roleName  = (formData.get('roleName') as string)?.trim();
    const rawPerms  = formData.get('permissions') as string;

    if (!roleName) return fail(400, { error: 'El nombre del rol es requerido.' });

    let permissions: any;
    try {
      permissions = JSON.parse(rawPerms);
    } catch {
      return fail(400, { error: 'Permisos inválidos.' });
    }

    const docId = roleId || roleName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    console.time(`[SAVE ROLE] ${docId}`);
    try {
      await withTimeout(
        adminDb.collection(MasterCollections.PERMISSIONS).doc(docId).set({
          name: roleName,
          permissions,
          updatedAt: new Date().toISOString()
        }, { merge: true }),
        5000,
        'Save Role Firestore'
      );
      
      // Auditoría
      await logAction({
        uid: (locals as any).uid || 'system',
        user_email: (locals as any).user?.email || 'system',
        action: roleId ? 'UPDATE' : 'CREATE',
        entity: 'permisos',
        entity_id: docId,
        details: { roleName, permissions }
      });

      console.timeEnd(`[SAVE ROLE] ${docId}`);
      return { success: true, savedId: docId, savedName: roleName };
    } catch (err: any) {
      console.timeEnd(`[SAVE ROLE] ${docId}`);
      console.error(`[SAVE ROLE] Error:`, err);
      return fail(500, { error: `Error: ${err.message}` });
    }
  },

  /**
   * Elimina un rol de Firestore.
   */
  deleteRole: async ({ request, locals }) => {
    if (!adminDb) return fail(500, { error: 'Firebase no disponible' });

    const formData = await request.formData();
    const roleId = (formData.get('roleId') as string)?.trim();

    if (!roleId) return fail(400, { error: 'ID de rol requerido.' });

    console.time(`[DELETE ROLE] ${roleId}`);
    try {
      // 1. Eliminar el documento del rol
      await withTimeout(
        adminDb.collection(MasterCollections.PERMISSIONS).doc(roleId).delete(),
        5000,
        'Delete Role Definition'
      );

      const batch = adminDb.batch();
      let totalCleaned = 0;

      // 2. Limpiar referencias en USUARIOS GLOBALES
      const usersWithRole = await withTimeout(
        adminDb.collection(MasterCollections.USERS).where('roles', 'array-contains', roleId).get(),
        5000,
        'Fetch Global Users Cleanup'
      );

      if (!usersWithRole.empty) {
        usersWithRole.docs.forEach(userDoc => {
          const currentRoles = userDoc.data().roles || [];
          const newRoles = currentRoles.filter((r: string) => r !== roleId);
          batch.update(userDoc.ref, { roles: newRoles, updatedAt: new Date().toISOString() });
          totalCleaned++;
        });
      }

      // 3. Limpiar referencias en ROLES POR EMPRESA
      const tenantRolesWithId = await withTimeout(
        adminDb.collection(MasterCollections.USER_TENANTS).where('roles', 'array-contains', roleId).get(),
        5000,
        'Fetch Tenant Roles Cleanup'
      );

      if (!tenantRolesWithId.empty) {
        tenantRolesWithId.docs.forEach(doc => {
          const currentRoles = doc.data().roles || [];
          const newRoles = currentRoles.filter((r: string) => r !== roleId);
          batch.update(doc.ref, { roles: newRoles, updatedAt: new Date().toISOString() });
          totalCleaned++;
        });
      }

      if (totalCleaned > 0) {
        await withTimeout(batch.commit(), 10000, 'Commit Cleanup Batch');
      }

      // Auditoría
      await logAction({
        uid: (locals as any).uid || 'system',
        user_email: (locals as any).user?.email || 'system',
        action: 'DELETE',
        entity: 'permisos',
        entity_id: roleId
      });

      console.timeEnd(`[DELETE ROLE] ${roleId}`);
      return { success: true, deletedId: roleId };
    } catch (err: any) {
      console.timeEnd(`[DELETE ROLE] ${roleId}`);
      console.error(`[DELETE ROLE] Error:`, err);
      return fail(500, { error: `Error: ${err.message}` });
    }
  }
};
