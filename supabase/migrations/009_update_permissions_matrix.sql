-- ============================================================
-- Sync2K / Profit Web — Migración v1.3
-- Refactorización de permiso ANULAR en get_merged_permissions
-- ============================================================

-- 1. Actualizamos la función get_merged_permissions para que agregue el campo 'void'
CREATE OR REPLACE FUNCTION get_merged_permissions(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT COALESCE(jsonb_object_agg(key, perms), '{}')
  INTO result
  FROM (
    SELECT
      key,
      jsonb_build_object(
        'read',   bool_or(COALESCE((value->>'read')::boolean,   false)),
        'create', bool_or(COALESCE((value->>'create')::boolean, false)),
        'update', bool_or(COALESCE((value->>'update')::boolean, false)),
        'delete', bool_or(COALESCE((value->>'delete')::boolean, false)),
        'void',   bool_or(COALESCE((value->>'void')::boolean,   false)), -- ¡Nuevo campo void para la anulación!
        'others', bool_or(COALESCE((value->>'others')::boolean, false))
      ) AS perms
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    CROSS JOIN LATERAL jsonb_each(r.permissions)
    WHERE ur.user_id = p_user_id
    GROUP BY key
  ) aggregated;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

-- 2. Recreamos la vista profile_complete para asegurarnos de que cargue la función actualizada
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
        'default_warehouse',   b.default_warehouse
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
