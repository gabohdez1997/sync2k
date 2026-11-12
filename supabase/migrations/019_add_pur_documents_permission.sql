-- ============================================================
-- Sync2K / Profit Web — Migración v1.9
-- Permisos para Módulo de Documentos de Compra (pur_documents)
-- ============================================================

-- 1. Agregar permiso pur_documents a roles administradores y compras (acceso total)
UPDATE roles
SET permissions = jsonb_set(
  COALESCE(permissions, '{}'::jsonb),
  '{pur_documents}',
  '{"read": true, "create": true, "update": false, "delete": true, "void": true, "others": true}'::jsonb,
  true
)
WHERE name ILIKE '%admin%' OR name ILIKE '%root%' OR name ILIKE '%compra%';

-- 2. Asegurar que los demás roles tengan la clave pur_documents desactivada si no existe
UPDATE roles
SET permissions = jsonb_set(
  COALESCE(permissions, '{}'::jsonb),
  '{pur_documents}',
  '{"read": false, "create": false, "update": false, "delete": false, "void": false, "others": false}'::jsonb,
  true
)
WHERE NOT (name ILIKE '%admin%' OR name ILIKE '%root%' OR name ILIKE '%compra%')
  AND NOT (COALESCE(permissions, '{}'::jsonb) ? 'pur_documents');

