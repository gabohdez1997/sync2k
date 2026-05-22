import { getSupabaseAdmin } from './supabase';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'TOGGLE_STATUS'
  | 'LOGIN'
  | 'LOGOUT'
  | 'VIEW';

export interface AuditLog {
  uid: string | null;
  user_email: string;
  action: AuditAction;
  module: string;        // antes: 'entity'
  record_id?: string;    // antes: 'entity_id'
  old_data?: any;
  new_data?: any;
  branch_id?: string;
  source?: 'cloud' | 'local';
}

export async function logAction(log: AuditLog) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.rpc('log_action', {
      p_user_id:    log.uid,
      p_user_email: log.user_email,
      p_action:     log.action,
      p_module:     log.module,
      p_record_id:  log.record_id   ?? null,
      p_old_data:   log.old_data    ? JSON.stringify(log.old_data)    : null,
      p_new_data:   log.new_data    ? JSON.stringify(log.new_data)    : null,
      p_branch_id:  log.branch_id   ?? null,
      p_source:     log.source      ?? 'cloud'
    });

    if (error) {
      console.error('[AUDIT] Error registrando acción (RPC):', error);
    } else {
      console.log('[AUDIT] Acción registrada con éxito, ID:', data);
    }
  } catch (err) {
    console.error('[AUDIT] Error registrando acción (Excepción):', err);
  }
}
