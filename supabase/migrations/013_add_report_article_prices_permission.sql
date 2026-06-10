-- ============================================================
-- Sync2K / Profit Web — Migración v1.6
-- Agregar permiso reports_article_prices (Artículos con Precios)
-- ============================================================

-- 1. Actualizar rol Administrador con acceso de lectura (read = true)
UPDATE roles
SET permissions = jsonb_set(
  permissions,
  '{reports_article_prices}',
  '{"read": true, "create": false, "update": false, "delete": false, "void": false, "others": false}'::jsonb,
  true
)
WHERE name = 'Administrador';

-- 2. Actualizar demás roles con acceso desactivado por defecto (read = false)
UPDATE roles
SET permissions = jsonb_set(
  permissions,
  '{reports_article_prices}',
  '{"read": false, "create": false, "update": false, "delete": false, "void": false, "others": false}'::jsonb,
  true
)
WHERE name <> 'Administrador';
