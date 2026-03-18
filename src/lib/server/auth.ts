// src/lib/server/auth.ts
import { adminDb, MasterCollections } from './firebase-admin';

export type CRUD = {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
};

export type Profile = {
  uid: string;
  full_name: string | null;
  email: string | null;
  permissions: Record<string, CRUD>;
  roles: Array<{ id: string; name: string }>;
  active: boolean;
  company?: { 
    id: string; 
    name: string; 
    slug: string;
    agent_url?: string;
    agent_api_key?: string;
  } | null;
};

export function hasPermission(profile: Profile, optionId: string, action: keyof CRUD = 'read'): boolean {
  return profile.permissions[optionId]?.[action] ?? false;
}

/**
 * Obtiene el perfil del usuario, sus roles y permisos desde la BD_Master de Firestore.
 * Combina los permisos de múltiples roles en un solo objeto CRUD estructurado.
 */
export async function getUserProfile(uid: string, tenantId?: string | null): Promise<Profile | null> {
  if (!adminDb) return null;

  try {
    const userDoc = await adminDb.collection(MasterCollections.USERS).doc(uid).get();
    
    if (!userDoc.exists) {
      console.warn(`[AUTH] User document NOT FOUND for UID: ${uid}`);
      return null;
    }

    const userData = userDoc.data();
    
    // Determinar qué roles usar: globales o específicos del tenant
    let roleIds: string[] = userData?.roles || [];

    if (tenantId) {
      // Intentar buscar roles específicos para este usuario en esta empresa
      const docId = `${uid}_${tenantId}`;
      const userTenantDoc = await adminDb.collection(MasterCollections.USER_TENANTS).doc(docId).get();
      if (userTenantDoc.exists) {
        const tenantRoles = userTenantDoc.data()?.roles || [];
        if (tenantRoles.length > 0) {
          console.log(`[AUTH] Found tenant roles for ${uid} in ${tenantId}: ${JSON.stringify(tenantRoles)}`);
          roleIds = tenantRoles;
        }
      }
    }

    console.log(`[AUTH] Final roles for ${uid} (tenant: ${tenantId}): ${JSON.stringify(roleIds)}`);
    const rolesInfo = [];
    const mergedPermissions: Record<string, CRUD> = {};

    // Buscar cada rol en la colección de permisos para expandir
    for (const roleId of roleIds) {
        const roleDoc = await adminDb.collection(MasterCollections.PERMISSIONS).doc(roleId).get();
        if (roleDoc.exists) {
            const roleData = roleDoc.data();
            console.log(`[AUTH] Merging role: ${roleId}. Perms: ${Object.keys(roleData?.permissions || {}).length} nodes`);
            rolesInfo.push({ id: roleId, name: roleData?.name || roleId });
            
            // Permisos estructurados esperados: { "sales": { read: true, create: false, ... }, ... }
            const rolePerms = roleData?.permissions || {};
            
            for (const [optionId, crud] of Object.entries(rolePerms)) {
              if (!mergedPermissions[optionId]) {
                mergedPermissions[optionId] = { read: false, create: false, update: false, delete: false };
              }
              const typedCrud = crud as Partial<CRUD>;
              mergedPermissions[optionId].read = mergedPermissions[optionId].read || !!typedCrud.read;
              mergedPermissions[optionId].create = mergedPermissions[optionId].create || !!typedCrud.create;
              mergedPermissions[optionId].update = mergedPermissions[optionId].update || !!typedCrud.update;
              mergedPermissions[optionId].delete = mergedPermissions[optionId].delete || !!typedCrud.delete;
            }
        } else {
            console.warn(`[AUTH] Role document NOT FOUND: ${roleId}`);
        }
    }

    // Cargar información de la empresa (basado en tenantId o en el perfil)
    let companyInfo = userData?.company || null;

    if (tenantId) {
      // Si hay un tenantId, cargamos la configuración completa de esa empresa
      const tenantSnap = await adminDb.collection(MasterCollections.CONNECTIONS)
          .where('slug', '==', tenantId)
          .limit(1)
          .get();
      
      if (!tenantSnap.empty) {
          const tenantData = tenantSnap.docs[0].data();
          companyInfo = {
              id: tenantSnap.docs[0].id,
              name: tenantData.name,
              slug: tenantData.slug,
              agent_url: tenantData.agent_url,
              agent_api_key: tenantData.agent_api_key
          };
      }
    }

    const profile = {
      uid,
      full_name: userData?.full_name || null,
      email: userData?.email || null,
      active: userData?.is_active ?? true, 
      roles: rolesInfo,
      permissions: mergedPermissions,
      company: companyInfo
    };
    
    console.log(`[AUTH] Profile generated for ${uid}. Total perm keys: ${Object.keys(mergedPermissions).length}`);
    return profile;

  } catch (error: any) {
    console.error(`[AUTH] Error fetching user profile for ${uid}:`, error.message);
    return null;
  }
}
