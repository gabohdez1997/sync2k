// src/lib/server/audit.ts
import { adminDb, MasterCollections } from './firebase-admin';

export type AuditAction = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DELETE' 
  | 'TOGGLE_STATUS' 
  | 'LOGIN' 
  | 'LOGOUT';

export interface AuditLog {
  timestamp: string;
  uid: string;
  user_email: string;
  action: AuditAction;
  entity: string;
  entity_id: string;
  tenant_id?: string;
  details?: any;
  ip?: string;
  user_agent?: string;
}

export async function logAction(log: Omit<AuditLog, 'timestamp'>) {
  if (!adminDb) return;

  try {
    const fullLog: AuditLog = {
      ...log,
      timestamp: new Date().toISOString()
    };

    await adminDb.collection(MasterCollections.AUDIT).add(fullLog);
  } catch (error) {
    console.error('Error recording audit log:', error);
  }
}
