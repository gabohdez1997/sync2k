-- ============================================================
-- Sync2K / Profit Web — Migración v1.5
-- Crear tabla de impresoras y agregar permisos para facturación e impresoras
-- ============================================================

-- 1. Crear tabla de impresoras
CREATE TABLE IF NOT EXISTS printers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 9100,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Agregar permisos a Administrador (read/create/update/delete = true)
UPDATE roles
SET permissions = jsonb_set(
  jsonb_set(
    permissions,
    '{cash_billing}',
    '{"read": true, "create": true, "update": true, "delete": true, "void": true, "others": false}'::jsonb,
    true
  ),
  '{sec_printers}',
  '{"read": true, "create": true, "update": true, "delete": true, "void": false, "others": false}'::jsonb,
  true
)
WHERE name = 'Administrador';

-- 3. Agregar permisos desactivados por defecto a los demás roles
UPDATE roles
SET permissions = jsonb_set(
  jsonb_set(
    permissions,
    '{cash_billing}',
    '{"read": false, "create": false, "update": false, "delete": false, "void": false, "others": false}'::jsonb,
    true
  ),
  '{sec_printers}',
  '{"read": false, "create": false, "update": false, "delete": false, "void": false, "others": false}'::jsonb,
  true
)
WHERE name <> 'Administrador';
