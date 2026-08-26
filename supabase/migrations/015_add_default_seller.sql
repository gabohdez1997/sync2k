-- ============================================================
-- Sync2K / Profit Web — Migración v1.5
-- Vendedor por defecto para ficha de clientes en sucursales
-- ============================================================

-- 1. Añadimos la columna default_seller a la tabla branches
ALTER TABLE branches ADD COLUMN IF NOT EXISTS default_seller TEXT DEFAULT '01';

-- 2. Actualizamos la vista profile_complete para que incluya default_seller y allow_decimals_units
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
        'profit_server_id',    b.profit_server_id,
        'local_dns_alias',     b.local_dns_alias,
        'default_warehouse',   b.default_warehouse,
        'allow_decimals_units',b.allow_decimals_units,
        'default_seller',      b.default_seller
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
