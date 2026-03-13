// src/lib/server/auth.ts
// Helpers para leer sesión y perfil del usuario en rutas server-side.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/supabase';

export type Profile = Database['public']['Tables']['profiles']['Row'] & {
  company: Database['public']['Tables']['companies']['Row'] | null;
  roles: Array<{
    id: string;
    name: string;
    permissions: string[]; // array of permission keys
  }>;
  permissions: string[]; // flattened unique list
};

/**
 * Obtiene el perfil completo del usuario autenticado, incluyendo
 * empresa, roles y permisos. Retorna null si no hay sesión.
 */
export async function getUserProfile(
  supabase: SupabaseClient<Database>
): Promise<Profile | null> {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select(
      `
      *,
      company:companies(*),
      user_roles(
        roles(
          id,
          name,
          role_permissions(
            permissions(key)
          )
        )
      )
    `
    )
    .eq('id', user.id)
    .single();

  if (error || !profile) return null;

  // Aplanar roles y permisos
  const roles = (profile.user_roles ?? []).map((ur: any) => {
    const role = ur.roles;
    const permissions: string[] = (role.role_permissions ?? []).map(
      (rp: any) => rp.permissions.key
    );
    return { id: role.id, name: role.name, permissions };
  });

  const permissions = [...new Set(roles.flatMap((r) => r.permissions))];

  return {
    ...profile,
    company: profile.company ?? null,
    roles,
    permissions
  } as Profile;
}

/**
 * Verifica si un perfil tiene un permiso específico.
 */
export function hasPermission(profile: Profile | null, key: string): boolean {
  if (!profile) return false;
  return profile.permissions.includes(key);
}

/**
 * Verifica si un perfil tiene al menos uno de los nombres de rol dados.
 */
export function hasRole(profile: Profile | null, ...roleNames: string[]): boolean {
  if (!profile) return false;
  return profile.roles.some((r) => roleNames.includes(r.name));
}
