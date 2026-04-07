// src/routes/dashboard/branches/+page.server.ts
// Migrado de Firestore + Firebase API → Supabase (tabla branches) + Supabase Auth

import { protectLoad, protectAction } from '$lib/server/permissions';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// ─── Load ──────────────────────────────────────────────────────
export const load: PageServerLoad = protectLoad('sec_branches', async ({ locals }) => {
  const { data: branches, error } = await supabaseAdmin
    .from('branches')
    .select('id, name, agent_url, agent_token, profit_branch_codes, sql_config, profit_server_id, local_dns_alias, active, sort_order, updated_at')
    .order('sort_order')
    .order('name');

  if (error) {
    console.error('[BRANCHES] Error cargando sucursales:', error.message);
    return { branches: [], agentServers: [], loadError: error.message };
  }

  // Intentar conectar al agente de la primera sucursal activa (preview de servers SQL)
  let agentServers: any[] = [];
  let loadError: string | null = null;
  const activeBranch = (branches ?? []).find(b => b.active && b.agent_url);

  if (activeBranch) {
    try {
      const client = new AgentClient(
        {
          slug:          activeBranch.id,
          agent_url:     activeBranch.agent_url!,
          agent_api_key: activeBranch.agent_token
        },
        locals.profile
      );
      const res = await client.getDatabaseConfig();
      const resAny = res as any;
      agentServers = resAny?.data?.servers || resAny?.servers || [];
    } catch (e: any) {
      loadError = `No se pudo conectar al agente: ${e.message}`;
    }
  }

  return {
    branches:     branches ?? [],
    agentServers,
    loadError
  };
});

// ─── Actions ───────────────────────────────────────────────────
export const actions: Actions = {

  saveBranch: protectAction('sec_branches', async ({ request, locals }) => {
    const formData        = await request.formData();
    const branchId        = (formData.get('branchId') as string)?.trim() || null;
    const name            = (formData.get('name') as string)?.trim();
    const agentUrl        = (formData.get('agent_url') as string)?.trim() || null;
    const agentToken      = (formData.get('agent_token') as string)?.trim() || null;
    
    // Parsear el array de códigos JSON
    const profitBranchCodesStr = formData.get('profit_branch_codes') as string;
    let profitBranchCodes = [];
    try {
      if (profitBranchCodesStr) profitBranchCodes = JSON.parse(profitBranchCodesStr);
    } catch(e) { }

    // Parsear configuración SQL local JSON
    const sqlConfigStr = formData.get('sql_config') as string;
    let sqlConfig = {};
    try {
      if (sqlConfigStr) sqlConfig = JSON.parse(sqlConfigStr);
    } catch(e) { }

    const profitServer    = (formData.get('profit_server_id') as string)?.trim() || null;
    const localDns        = (formData.get('local_dns_alias') as string)?.trim() || null;
    const sortOrder       = parseInt(formData.get('sort_order') as string || '0');
    const active          = formData.get('active') !== 'false';

    if (!name) return fail(400, { message: 'El nombre de la sucursal es requerido.' });

    const payload: any = {
      name,
      agent_url:           agentUrl,
      profit_branch_codes: profitBranchCodes,
      sql_config:          sqlConfig,
      profit_server_id:    profitServer,
      local_dns_alias:     localDns,
      sort_order:          sortOrder,
      active,
      updated_at:          new Date().toISOString()
    };

    // Solo actualizar agent_token si se envió uno nuevo
    if (agentToken) payload.agent_token = agentToken;

    let savedId: string;

    if (branchId) {
      const { error } = await supabaseAdmin
        .from('branches')
        .update(payload)
        .eq('id', branchId);
      if (error) return fail(500, { message: error.message });
      savedId = branchId;
    } else {
      const { data, error } = await supabaseAdmin
        .from('branches')
        .insert(payload)
        .select('id')
        .single();
      if (error) return fail(500, { message: error.message });
      savedId = data.id;
    }

    await supabaseAdmin.rpc('log_action', {
      p_user_id:    locals.profile?.id ?? null,
      p_user_email: locals.profile?.email ?? 'system',
      p_action:     branchId ? 'UPDATE' : 'CREATE',
      p_module:     'sec_branches',
      p_record_id:  savedId
    });

    return { success: true, savedId };
  }),

  deleteBranch: protectAction('sec_branches', async ({ request, locals }) => {
    const formData  = await request.formData();
    const branchId  = (formData.get('branchId') as string)?.trim();
    const password  = (formData.get('password') as string)?.trim();

    if (!branchId) return fail(400, { message: 'ID de sucursal requerido.' });
    if (!password) return fail(400, { message: 'La contraseña es requerida para confirmar.' });

    // Verificar contraseña del admin con Supabase Auth
    const email = locals.session?.user?.email;
    if (!email) return fail(401, { message: 'Sesión no válida.' });

    const { error: authErr } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (authErr) return fail(401, { message: 'Contraseña de confirmación incorrecta.' });

    const { error } = await supabaseAdmin
      .from('branches')
      .delete()
      .eq('id', branchId);

    if (error) return fail(500, { message: error.message });

    await supabaseAdmin.rpc('log_action', {
      p_user_id:    locals.profile?.id ?? null,
      p_user_email: locals.profile?.email ?? 'system',
      p_action:     'DELETE',
      p_module:     'sec_branches',
      p_record_id:  branchId
    });

    return { success: true };
  })
};
