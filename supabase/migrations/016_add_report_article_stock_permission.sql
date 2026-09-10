-- ============================================================
-- Sync2K / Profit Web — Migración
-- Agregar permiso reports_article_stock (Stock de Artículos)
-- ============================================================

-- 1. Actualizar rol Administrador con acceso de lectura (read = true)
UPDATE roles
SET permissions = jsonb_set(
  permissions,
  '{reports_article_stock}',
  '{"read": true, "create": false, "update": false, "delete": false, "void": false, "others": false}'::jsonb,
  true
)
WHERE name = 'Administrador';

-- 2. Actualizar demás roles con acceso desactivado por defecto (read = false)
UPDATE roles
SET permissions = jsonb_set(
  permissions,
  '{reports_article_stock}',
  '{"read": false, "create": false, "update": false, "delete": false, "void": false, "others": false}'::jsonb,
  true
)
WHERE name <> 'Administrador';
