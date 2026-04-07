-- ============================================================
-- Sync2K / Profit Web — Migración v1.2
-- Añadiendo parametrización de SQL Server local en Branches
-- ============================================================

-- 1. Añadimos la columna vectorial de JSONB para configuración SQL
ALTER TABLE branches ADD COLUMN IF NOT EXISTS sql_config JSONB DEFAULT '{}'::jsonb;

-- 2. Borramos la vista profile_complete
DROP VIEW IF EXISTS profile_complete;

-- 3. Reconstruimos la Vista agregando `sql_config`
CREATE OR REPLACE VIEW profile_complete AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.active,
  p.profit_user,
  p.profit_pass,
  p.updated_at,
  p.synced_at,

  get_merged_permissions(p.id) AS permissions,

  COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = p.id
    ),
    '[]'::jsonb
  ) AS roles,

  COALESCE(
    (
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id',                  b.id,
        'name',                b.name,
        'agent_url',           b.agent_url,
        'agent_token',         b.agent_token,
        'profit_branch_codes', b.profit_branch_codes,
        'sql_config',          b.sql_config,  -- Nuevo campo
        'profit_server_id',    b.profit_server_id,
        'local_dns_alias',     b.local_dns_alias
      ))
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      JOIN branches b ON b.id = ANY(r.branch_ids)
      WHERE ur.user_id = p.id AND b.active = true
    ),
    '[]'::jsonb
  ) AS allowed_branches,

  COALESCE(
    (
      SELECT array_agg(DISTINCT wid ORDER BY wid)
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      CROSS JOIN LATERAL unnest(r.warehouse_ids) AS wid
      WHERE ur.user_id = p.id
    ),
    '{}'::text[]
  ) AS allowed_warehouses

FROM profiles p;
