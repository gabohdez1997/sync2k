// src/routes/dashboard/audit/+page.server.ts
// Migrado de Firestore → Supabase (tabla audit_log)

import { protectLoad } from '$lib/server/permissions';
import { supabaseAdmin } from '$lib/server/supabase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = protectLoad('sec_audit', async ({ url }) => {
  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '200'), 500);
  const module = url.searchParams.get('module') || null;

  let query = supabaseAdmin
    .from('audit_log')
    .select(`
      id, action, module, record_id,
      user_email, source, created_at,
      old_data, new_data, metadata,
      branch_id, branches(name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (module) query = query.eq('module', module);

  const { data: logs, error } = await query;

  if (error) {
    console.error('[AUDIT] Error cargando logs:', error.message);
    return { logs: [] };
  }

  return { logs: logs ?? [] };
});
