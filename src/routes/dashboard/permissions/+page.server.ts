// src/routes/dashboard/permissions/+page.server.ts
// Migrado de Firestore → Supabase (tabla roles)

import { fail } from '@sveltejs/kit';
import { protectLoad, protectAction } from '$lib/server/permissions';
import { supabaseAdmin } from '$lib/server/supabase';
import type { PageServerLoad, Actions } from './$types';

// ─── Load ──────────────────────────────────────────────────────
export const load: PageServerLoad = protectLoad('sec_roles', async () => {
  const { data: roles, error } = await supabaseAdmin
    .from('roles')
    .select('id, name, permissions, branch_ids, warehouse_ids, updated_at')
    .order('name');

  if (error) {
    console.error('[PERMISSIONS] Error cargando roles:', error.message);
    return { roles: [] };
  }

  const { data: branches } = await supabaseAdmin
    .from('branches')
    .select('id, name')
    .eq('active', true)
    .order('name');

  return {
    roles: roles ?? [],
    branches: branches ?? []
  };
});

// ─── Actions ───────────────────────────────────────────────────
export const actions: Actions = {

  saveRole: protectAction('sec_roles', async ({ request, locals }) => {
    const formData     = await request.formData();
    const roleId       = (formData.get('roleId') as string)?.trim() || null;
    const roleName     = (formData.get('roleName') as string)?.trim();
    const rawPerms     = formData.get('permissions') as string;
    const rawBranchIds    = formData.get('branchIds') as string;
    const rawWarehouseIds = formData.get('warehouseIds') as string;

    if (!roleName) return fail(400, { error: 'El nombre del rol es requerido.' });

    let permissions: any;
    let branchIds: string[] = [];
    let warehouseIds: string[] = [];

    try { permissions = JSON.parse(rawPerms); }
    catch { return fail(400, { error: 'Permisos inválidos.' }); }

    try { if (rawBranchIds)    branchIds    = JSON.parse(rawBranchIds); }    catch {}
    try { if (rawWarehouseIds) warehouseIds = JSON.parse(rawWarehouseIds); } catch {}

    const payload = {
      name:          roleName,
      permissions,
      branch_ids:    branchIds,
      warehouse_ids: warehouseIds,
      updated_at:    new Date().toISOString()
    };

    let savedId: string;

    if (roleId) {
      // Actualizar existente
      const { error } = await supabaseAdmin
        .from('roles')
        .update(payload)
        .eq('id', roleId);
      if (error) return fail(500, { error: error.message });
      savedId = roleId;
    } else {
      // Crear nuevo
      const { data, error } = await supabaseAdmin
        .from('roles')
        .insert(payload)
        .select('id')
        .single();
      if (error) return fail(500, { error: error.message });
      savedId = data.id;
    }

    // Auditoría
    await supabaseAdmin.rpc('log_action', {
      p_user_id:    locals.profile?.id ?? null,
      p_user_email: locals.profile?.email ?? 'system',
      p_action:     roleId ? 'UPDATE' : 'CREATE',
      p_module:     'sec_roles',
      p_record_id:  savedId
    });

    return { success: true, savedId, savedName: roleName };
  }),

  deleteRole: protectAction('sec_roles', async ({ request, locals }) => {
    const formData = await request.formData();
    const roleId   = (formData.get('roleId') as string)?.trim();
    if (!roleId) return fail(400, { error: 'ID de rol requerido.' });

    // Desvincular de todos los usuarios primero
    const { error: unlinkErr } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('role_id', roleId);
    if (unlinkErr) console.warn('[DELETE ROLE] Error desvinculando usuarios:', unlinkErr.message);

    const { error } = await supabaseAdmin
      .from('roles')
      .delete()
      .eq('id', roleId);

    if (error) return fail(500, { error: error.message });

    await supabaseAdmin.rpc('log_action', {
      p_user_id:    locals.profile?.id ?? null,
      p_user_email: locals.profile?.email ?? 'system',
      p_action:     'DELETE',
      p_module:     'sec_roles',
      p_record_id:  roleId
    });

    return { success: true, deletedId: roleId };
  })
};
