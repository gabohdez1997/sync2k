-- ============================================================
-- Sync2K / Profit Web — Migración v1.4
-- Agregar permiso reports_cashier_month (Cajero del Mes)
-- ============================================================

-- 1. Actualizar rol Administrador con acceso de lectura (read = true)
UPDATE roles
SET permissions = jsonb_set(
  permissions,
  '{reports_cashier_month}',
  '{"read": true, "create": false, "update": false, "delete": false, "void": false, "others": false}'::jsonb,
  true
)
WHERE name = 'Administrador';

-- 2. Actualizar demás roles con acceso desactivado por defecto (read = false)
UPDATE roles
SET permissions = jsonb_set(
  permissions,
  '{reports_cashier_month}',
  '{"read": false, "create": false, "update": false, "delete": false, "void": false, "others": false}'::jsonb,
  true
)
WHERE name <> 'Administrador';
