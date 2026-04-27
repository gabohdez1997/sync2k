// src/routes/dashboard/users/+page.server.ts
// Migrado de Firestore → Supabase (tablas profiles + user_roles)

import { fail } from '@sveltejs/kit';
import { protectLoad, protectAction } from '$lib/server/permissions';
import { supabaseAdmin } from '$lib/server/supabase';
import bcrypt from 'bcryptjs';
import type { PageServerLoad, Actions } from './$types';

// ─── Load ──────────────────────────────────────────────────────
export const load: PageServerLoad = protectLoad('sec_users', async () => {
  const [
    { data: users },
    { data: roles },
    { data: branches }
  ] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select(`id, full_name, email, active, profit_user, updated_at,
               user_roles(role_id, roles(id, name))`)
      .order('full_name'),

    supabaseAdmin
      .from('roles')
      .select('id, name')
      .order('name'),

    supabaseAdmin
      .from('branches')
      .select('id, name')
      .eq('active', true)
      .order('name')
  ]);

  const usersMapped = (users ?? []).map((u: any) => ({
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    is_active: u.active,
    profit_user: u.profit_user,
    globalRoles: u.user_roles?.map((ur: any) => ur.role_id) || [],
    tenantRoles: [], // Deprecated
    updated_at: u.updated_at
  }));

  return {
    users:          usersMapped,
    availableRoles: roles ?? [],
    branches:       branches ?? []
  };
});

// ─── Actions ───────────────────────────────────────────────────
export const actions: Actions = {

  saveUser: protectAction('sec_users', async ({ request, locals }) => {
    const formData   = await request.formData();
    const userId     = (formData.get('userId') as string)?.trim() || null;
    const fullName   = (formData.get('full_name') as string)?.trim();
    const email      = (formData.get('email') as string)?.trim().toLowerCase();
    const password   = (formData.get('password') as string)?.trim() || null;
    const profitUser = (formData.get('profit_user') as string)?.trim() || null;
    const profitPass = (formData.get('profit_pass') as string)?.trim() || null;
    const isActive   = formData.get('is_active') !== 'false';
    const roleIds    = formData.getAll('roles') as string[];

    if (!fullName || !email) return fail(400, { message: 'Nombre y email son requeridos.' });

    try {
      let finalUid = userId;

      if (userId) {
        // ── Actualizar usuario existente ───────────────────────
        
        // 1. Obtener datos actuales para comparar y auditar
        const { data: current, error: currentErr } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        
        if (currentErr) return fail(500, { message: `Error al obtener usuario: ${currentErr.message}` });

        const updateData: any = {
          full_name:   fullName,
          email:       email, // Incluir email en el perfil
          profit_user: profitUser,
          active:      isActive,
          updated_at:  new Date().toISOString()
        };

        // Solo actualizar profit_pass si se proporcionó uno nuevo
        if (profitPass) {
          updateData.profit_pass = profitPass;
        }

        // Manejo de cambio de contraseña Web o Email en Auth
        const authUpdates: any = {};
        if (password) {
          authUpdates.password = password;
          updateData.password_hash = await bcrypt.hash(password, 12);
        }
        if (email !== current.email) {
          authUpdates.email = email;
        }

        if (Object.keys(authUpdates).length > 0) {
          const { error: authUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdates);
          if (authUpdateErr) return fail(500, { message: `Error al actualizar Auth: ${authUpdateErr.message}` });
        }

        // Actualizar perfil
        const { error: updateErr } = await supabaseAdmin
          .from('profiles')
          .update(updateData)
          .eq('id', userId);
        
        if (updateErr) return fail(500, { message: `Error al actualizar perfil: ${updateErr.message}` });

        // Auditoría
        await supabaseAdmin.rpc('log_action', {
          p_user_id:    locals.profile?.id ?? null,
          p_user_email: locals.profile?.email ?? 'system',
          p_action:     'UPDATE',
          p_module:     'sec_users',
          p_record_id:  userId,
          p_old_data:   JSON.stringify(current),
          p_new_data:   JSON.stringify(updateData)
        });

      } else {
        // ── Crear usuario nuevo ────────────────────────────────
        if (!password) return fail(400, { message: 'La contraseña es requerida para usuarios nuevos.' });

        // Crear en Supabase Auth
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName }
        });
        if (authErr) return fail(500, { message: `Auth error: ${authErr.message}` });

        finalUid = authData.user.id;
        const passwordHash = await bcrypt.hash(password, 12);

        const { error: profileErr } = await supabaseAdmin
          .from('profiles')
          .insert({
            id:            finalUid,
            full_name:     fullName,
            email:         email,
            password_hash: passwordHash,
            profit_user:   profitUser,
            profit_pass:   profitPass,
            active:        isActive
          });
        if (profileErr) return fail(500, { message: profileErr.message });
      }

      // ── Sincronizar roles ──────────────────────────────────────
      if (finalUid && roleIds.length >= 0) {
        // Borrar roles actuales y reinsertar
        await supabaseAdmin.from('user_roles').delete().eq('user_id', finalUid);
        if (roleIds.length > 0) {
          await supabaseAdmin.from('user_roles').insert(
            roleIds.map(role_id => ({ user_id: finalUid!, role_id }))
          );
        }
      }

      if (!userId) {
        await supabaseAdmin.rpc('log_action', {
          p_user_id:    locals.profile?.id ?? null,
          p_user_email: locals.profile?.email ?? 'system',
          p_action:     'CREATE',
          p_module:     'sec_users',
          p_record_id:  finalUid,
          p_new_data:   JSON.stringify({ fullName, email, profitUser, isActive, roleIds })
        });
      }

      return { success: true };
    } catch (err: any) {
      console.error('[SAVE USER] Error:', err);
      return fail(500, { message: err.message });
    }
  }),

  toggleStatus: protectAction('sec_users', async ({ request, locals }) => {
    const formData     = await request.formData();
    const userId       = formData.get('userId') as string;
    const currentActive = formData.get('active') === 'true';

    if (!userId) return fail(400, { message: 'ID de usuario requerido.' });

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ active: !currentActive, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) return fail(500, { message: error.message });

    await supabaseAdmin.rpc('log_action', {
      p_user_id:    locals.profile?.id ?? null,
      p_user_email: locals.profile?.email ?? 'system',
      p_action:     'TOGGLE_STATUS',
      p_module:     'sec_users',
      p_record_id:  userId,
      p_new_data:   JSON.stringify({ active: !currentActive })
    });

    return { success: true };
  }),

  deleteUser: protectAction('sec_users', async ({ request, locals }) => {
    const formData = await request.formData();
    const userId   = formData.get('userId') as string;

    if (!userId) return fail(400, { message: 'ID de usuario requerido.' });

    // Eliminar de Supabase Auth (en cascada elimina user_roles)
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authErr) console.warn('[DELETE USER] Auth error:', authErr.message);

    // Eliminar perfil (ON DELETE CASCADE limpia user_roles)
    const { error } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);
    if (error) return fail(500, { message: error.message });

    await supabaseAdmin.rpc('log_action', {
      p_user_id:    locals.profile?.id ?? null,
      p_user_email: locals.profile?.email ?? 'system',
      p_action:     'DELETE',
      p_module:     'sec_users',
      p_record_id:  userId
    });

    return { success: true };
  })
};
