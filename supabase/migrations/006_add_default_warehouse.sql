-- ============================================================
-- Sync2K / Profit Web — Migración v1.2
-- Almacén por defecto para sucursales
-- ============================================================

-- 1. Añadimos la columna default_warehouse a la tabla branches
ALTER TABLE branches ADD COLUMN IF NOT EXISTS default_warehouse TEXT;

-- 2. Actualizamos la vista profile_complete para que el frontend reciba este campo
-- Eliminamos primero para reconstruir
DROP VIEW IF EXISTS profile_complete;

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
  p.theme_config,

  -- Permisos fusionados via función auxiliar
  get_merged_permissions(p.id) AS permissions,

  -- Roles asignados
  COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = p.id
    ),
    '[]'::jsonb
  ) AS roles,

  -- Sucursales autorizadas (incluyendo el nuevo campo default_warehouse)
  COALESCE(
    (
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id',                  b.id,
        'name',                b.name,
        'agent_url',           b.agent_url,
        'agent_token',         b.agent_token,
        'profit_branch_codes', b.profit_branch_codes,
        'profit_server_id',    b.profit_server_id,
        'local_dns_alias',     b.local_dns_alias,
        'default_warehouse',   b.default_warehouse  -- ¡Nuevo campo!
      ))
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      JOIN branches b ON b.id = ANY(r.branch_ids)
      WHERE ur.user_id = p.id AND b.active = true
    ),
    '[]'::jsonb
  ) AS allowed_branches,

  -- Almacenes autorizados
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
