// src/routes/dashboard/branches/+page.server.ts
// Migrado de Firestore + Firebase API → Supabase (tabla branches) + Supabase Auth

import { protectLoad, protectAction } from '$lib/server/permissions';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// ─── Load ──────────────────────────────────────────────────────
export const load: PageServerLoad = protectLoad('sec_branches', async ({ locals, fetch }) => {
  // Intentamos obtener todos los campos, incluyendo 'default_warehouse' y 'allow_decimals_units'
  let { data: branches, error } = await supabaseAdmin
    .from('branches')
    .select('id, name, business_name, agent_url, agent_token, profit_branch_codes, sql_config, profit_server_id, local_dns_alias, active, sort_order, updated_at, rif, address, latitude, longitude, logo_url, phone, default_warehouse, allow_decimals_units')
    .order('sort_order')
    .order('name');

  // Si falla específicamente por la columna default_warehouse (migración no aplicada)
  if (error && error.message.includes('default_warehouse')) {
    console.warn('[BRANCHES] La columna default_warehouse no existe. Reintentando sin ella...');
    const fallback = await supabaseAdmin
      .from('branches')
      .select('id, name, business_name, agent_url, agent_token, profit_branch_codes, sql_config, profit_server_id, local_dns_alias, active, sort_order, updated_at, rif, address, latitude, longitude, logo_url, phone, allow_decimals_units')
      .order('sort_order')
      .order('name');
    
    branches = fallback.data;
    error = fallback.error;
  }

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
        locals.profile || undefined,
        fetch
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
    const business_name   = (formData.get('business_name') as string)?.trim() || null;
    const agentUrl        = (formData.get('agent_url') as string)?.trim() || null;
    const agentToken      = (formData.get('agent_token') as string)?.trim() || null;
    const logoFile        = formData.get('logo_file') as File;
    const existingLogoUrl = formData.get('logo_url') as string;
    
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

    // Nuevos campos Legales y Ubicación
    const rif             = (formData.get('rif') as string)?.trim() || null;
    const address         = (formData.get('address') as string)?.trim() || null;
    const phone           = (formData.get('phone') as string)?.trim() || null;
    let logoUrl           = (formData.get('logo_url') as string)?.trim() || null;
    const latitude        = formData.get('latitude') ? parseFloat(formData.get('latitude') as string) : null;
    const longitude       = formData.get('longitude') ? parseFloat(formData.get('longitude') as string) : null;
    const defaultWarehouse = (formData.get('default_warehouse') as string)?.trim() || null;
    const allowDecimalsUnits = (formData.get('allow_decimals_units') as string)?.trim() || 'MTS, MTS2, KG';

    // ─── Proceso de Subida de Logo ─────────────────────────────
    if (logoFile && logoFile.size > 0 && logoFile.name) {
      const fileName = `${branchId || 'new'}_${Date.now()}_${logoFile.name.replace(/\s+/g, '_')}`;
      const filePath = `logos/${fileName}`;

      const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
        .from('brand-assets')
        .upload(filePath, logoFile, { upsert: true });

      if (uploadErr) {
        console.error('[STORAGE] Error subiendo logo:', uploadErr.message);
      } else {
        const { data: publicData } = supabaseAdmin.storage
          .from('brand-assets')
          .getPublicUrl(filePath);
        
        logoUrl = publicData.publicUrl;
      }
    }

    if (!name) return fail(400, { message: 'El nombre de la sucursal es requerido.' });

    const payload: any = {
      name,
      business_name,
      agent_url:           agentUrl,
      profit_branch_codes: profitBranchCodes,
      sql_config:          sqlConfig,
      profit_server_id:    profitServer,
      local_dns_alias:     localDns,
      sort_order:          sortOrder,
      active,
      rif,
      address,
      phone,
      logo_url:            logoUrl,
      latitude,
      longitude,
      default_warehouse:   defaultWarehouse,
      allow_decimals_units: allowDecimalsUnits,
      updated_at:          new Date().toISOString()
    };

    // Solo actualizar agent_token si se envió uno nuevo
    if (agentToken) payload.agent_token = agentToken;

    let savedId: string;
    let oldData: any = null;

    if (branchId) {
      // Obtener datos actuales para la auditoría (Estado Anterior)
      const { data: current } = await supabaseAdmin.from('branches').select('*').eq('id', branchId).single();
      oldData = current;

      let { error } = await supabaseAdmin
        .from('branches')
        .update(payload)
        .eq('id', branchId);

      // Reintento sin default_warehouse si falla por columna inexistente
      if (error && error.message.includes('default_warehouse')) {
        console.warn('[BRANCHES] Reintentando actualización sin default_warehouse...');
        const { default_warehouse, ...safePayload } = payload;
        const retry = await supabaseAdmin
          .from('branches')
          .update(safePayload)
          .eq('id', branchId);
        error = retry.error;
      }

      if (error) return fail(500, { message: error.message });
      savedId = branchId;
    } else {
      let { data, error } = await supabaseAdmin
        .from('branches')
        .insert(payload)
        .select('id')
        .single();

      // Reintento sin default_warehouse si falla por columna inexistente
      if (error && error.message.includes('default_warehouse')) {
        console.warn('[BRANCHES] Reintentando inserción sin default_warehouse...');
        const { default_warehouse, ...safePayload } = payload;
        const retry = await supabaseAdmin
          .from('branches')
          .insert(safePayload)
          .select('id')
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) return fail(500, { message: error.message });
      savedId = data.id;
    }

    await supabaseAdmin.rpc('log_action', {
      p_user_id:    locals.profile?.id ?? null,
      p_user_email: locals.profile?.email ?? 'system',
      p_action:     branchId ? 'UPDATE' : 'CREATE',
      p_module:     'sec_branches',
      p_record_id:  savedId,
      p_branch_id:  savedId,
      p_old_data:   oldData ? JSON.stringify(oldData) : null,
      p_new_data:   JSON.stringify(payload)
    });

    return { success: true, savedId };
  }),

  testConnection: protectAction('sec_branches', async ({ request, locals, fetch }) => {
    const formData = await request.formData();
    const branchId = (formData.get('branchId') as string)?.trim();

    if (!branchId) return fail(400, { message: 'ID de sucursal requerido.' });

    // Buscar los datos de la sucursal de la base de datos
    const { data: branch, error: dbErr } = await supabaseAdmin
      .from('branches')
      .select('id, name, agent_url, agent_token')
      .eq('id', branchId)
      .single();

    if (dbErr || !branch) {
      return fail(404, { message: `Sucursal no encontrada: ${dbErr?.message || ''}` });
    }

    if (!branch.agent_url) {
      return fail(400, { message: 'La sucursal no tiene configurada una URL de agente.' });
    }

    try {
      const client = new AgentClient(
        {
          slug:          branch.id,
          agent_url:     branch.agent_url,
          agent_api_key: branch.agent_token
        },
        locals.profile || undefined,
        fetch
      );

      const res = await client.testConnection(branch.id);
      
      if (!res.success) {
        return fail(500, { message: res.message || 'Error al conectar con la base de datos SQL del agente.' });
      }

      return { success: true, message: res.message || 'Conexión exitosa.' };
    } catch (e: any) {
      return fail(500, { message: `Error de red o conexión al Agente local: ${e.message}` });
    }
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
      p_record_id:  branchId,
      p_branch_id:  branchId
    });

    return { success: true };
  })
};
