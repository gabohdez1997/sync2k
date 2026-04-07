// src/lib/server/firebase-admin.ts
// DEPRECADO — Reemplazado por Supabase
// Este archivo se mantiene temporalmente para no romper imports
// que aún no han sido migrados. Se eliminará en la próxima limpieza.

export const adminAuth = null;
export const adminDb   = null;

export const MasterCollections = {
  USERS:        'usuarios',
  PERMISSIONS:  'permisos',
  CONNECTIONS:  'conexiones',
  BRANCHES:     'sucursales',
  SUBSCRIPTIONS:'suscripciones',
  USER_TENANTS: 'roles_usuarios',
  AUDIT:        'auditoria'
};
