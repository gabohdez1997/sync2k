import { protectLoad, protectAction } from '$lib/server/permissions';
import { supabaseAdmin } from '$lib/server/supabase';
import { AgentClient } from '$lib/server/agent';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// ─── Load ──────────────────────────────────────────────────────
export const load: PageServerLoad = protectLoad('sec_printers', async ({ locals, fetch }) => {
  const { data: branches, error: bErr } = await supabaseAdmin
    .from('branches')
    .select('id, name, agent_url, agent_token, active')
    .eq('active', true)
    .order('name');

  if (bErr) {
    console.error('[PRINTERS] Error loading branches:', bErr.message);
  }

  // Cargar sublineas desde el primer agente disponible
  let sublines: any[] = [];
  if (branches && branches.length > 0) {
    const firstBranch = branches.find(b => b.agent_url);
    if (firstBranch) {
      const userProfile = (locals as any).profile;
      const agent = new AgentClient({
        slug: firstBranch.id,
        agent_url: firstBranch.agent_url,
        agent_api_key: firstBranch.agent_token
      }, userProfile || undefined, fetch);
      
      try {
        const subRes = await agent.request<any>('/catalogos/sublineas');
        sublines = (subRes as any).data || [];
      } catch (err: any) {
        console.error('[PRINTERS] Error loading sublines:', err.message);
      }
    }
  }

  const { data: printers, error: pErr } = await supabaseAdmin
    .from('printers')
    .select('id, name, ip_address, port, branch_id, is_active, created_at, sublines')
    .order('name');

  if (pErr) {
    console.error('[PRINTERS] Error loading printers:', pErr.message);
  }

  return {
    branches: branches ?? [],
    printers: printers ?? [],
    sublines
  };
});

// ─── Actions ───────────────────────────────────────────────────
export const actions: Actions = {
  savePrinter: protectAction('sec_printers', async ({ request, locals }) => {
    const formData = await request.formData();
    const printerId = (formData.get('printerId') as string)?.trim() || null;
    const name = (formData.get('name') as string)?.trim();
    const ipAddress = (formData.get('ip_address') as string)?.trim();
    const port = parseInt(formData.get('port') as string || '9100');
    const branchId = (formData.get('branch_id') as string)?.trim();
    const isActive = formData.get('is_active') !== 'false';
    
    let sublines: string[] = [];
    try {
      sublines = JSON.parse(formData.get('sublines') as string || '[]');
    } catch (e) {
      console.error('[PRINTERS] Error parsing sublines from form:', e);
    }

    if (!name || !ipAddress || !branchId) {
      return fail(400, { message: 'Todos los campos (Nombre, IP, Sucursal) son obligatorios.' });
    }

    const payload = {
      name,
      ip_address: ipAddress,
      port,
      branch_id: branchId,
      is_active: isActive,
      sublines
    };

    let savedId: string;
    let oldData: any = null;

    if (printerId) {
      // Obtener datos actuales para auditoría
      const { data: current } = await supabaseAdmin.from('printers').select('*').eq('id', printerId).single();
      oldData = current;

      const { error } = await supabaseAdmin
        .from('printers')
        .update(payload)
        .eq('id', printerId);

      if (error) return fail(500, { message: error.message });
      savedId = printerId;
    } else {
      const { data, error } = await supabaseAdmin
        .from('printers')
        .insert(payload)
        .select('id')
        .single();

      if (error) return fail(500, { message: error.message });
      savedId = data.id;
    }

    // Registrar acción en auditoría
    await supabaseAdmin.rpc('log_action', {
      p_user_id: locals.profile?.id ?? null,
      p_user_email: locals.profile?.email ?? 'system',
      p_action: printerId ? 'UPDATE' : 'CREATE',
      p_module: 'sec_printers',
      p_record_id: savedId,
      p_branch_id: branchId,
      p_old_data: oldData ? JSON.stringify(oldData) : null,
      p_new_data: JSON.stringify(payload)
    });

    return { success: true, savedId };
  }),

  togglePrinter: protectAction('sec_printers', async ({ request, locals }) => {
    const formData = await request.formData();
    const printerId = (formData.get('printerId') as string)?.trim();

    if (!printerId) return fail(400, { message: 'ID de impresora requerido.' });

    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('printers')
      .select('*')
      .eq('id', printerId)
      .single();

    if (fetchErr || !current) return fail(404, { message: 'Impresora no encontrada.' });

    const newActiveState = !current.is_active;

    const { error: updateErr } = await supabaseAdmin
      .from('printers')
      .update({ is_active: newActiveState })
      .eq('id', printerId);

    if (updateErr) return fail(500, { message: updateErr.message });

    await supabaseAdmin.rpc('log_action', {
      p_user_id: locals.profile?.id ?? null,
      p_user_email: locals.profile?.email ?? 'system',
      p_action: 'UPDATE',
      p_module: 'sec_printers',
      p_record_id: printerId,
      p_branch_id: current.branch_id,
      p_old_data: JSON.stringify(current),
      p_new_data: JSON.stringify({ ...current, is_active: newActiveState })
    });

    return { success: true };
  }),

  deletePrinter: protectAction('sec_printers', async ({ request, locals }) => {
    const formData = await request.formData();
    const printerId = (formData.get('printerId') as string)?.trim();

    if (!printerId) return fail(400, { message: 'ID de impresora requerido.' });

    // Obtener datos actuales para auditoría
    const { data: current } = await supabaseAdmin.from('printers').select('*').eq('id', printerId).single();
    if (!current) return fail(404, { message: 'Impresora no encontrada.' });

    const { error } = await supabaseAdmin
      .from('printers')
      .delete()
      .eq('id', printerId);

    if (error) return fail(500, { message: error.message });

    await supabaseAdmin.rpc('log_action', {
      p_user_id: locals.profile?.id ?? null,
      p_user_email: locals.profile?.email ?? 'system',
      p_action: 'DELETE',
      p_module: 'sec_printers',
      p_record_id: printerId,
      p_branch_id: current.branch_id
    });

    return { success: true };
  })
};
