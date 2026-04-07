-- Corrección: función auxiliar con GROUP BY dentro del subquery
-- PostgreSQL 18 requiere que bool_or esté en el nivel correcto de agrupación

DROP FUNCTION IF EXISTS get_merged_permissions(UUID);

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
        'delete', bool_or(COALESCE((value->>'delete')::boolean, false))
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

DROP VIEW IF EXISTS profile_complete;

CREATE VIEW profile_complete AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.active,
  p.profit_user,
  p.profit_pass,
  p.updated_at,
  p.synced_at,

  -- Permisos fusionados (OR lógico entre todos los roles del usuario)
  get_merged_permissions(p.id) AS permissions,

  -- Lista de roles asignados
  COALESCE(
    (
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = p.id
    ),
    '[]'::jsonb
  ) AS roles,

  -- Sucursales autorizadas (union de branch_ids de todos los roles)
  -- Si branch_ids = [] en el rol significa acceso a TODAS las sucursales
  COALESCE(
    (
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id',                 b.id,
        'name',               b.name,
        'agent_url',          b.agent_url,
        'agent_token',        b.agent_token,
        'profit_branch_code', b.profit_branch_code,
        'profit_server_id',   b.profit_server_id,
        'local_dns_alias',    b.local_dns_alias
      ))
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      JOIN branches b ON b.id = ANY(r.branch_ids)
      WHERE ur.user_id = p.id AND b.active = true
    ),
    '[]'::jsonb
  ) AS allowed_branches,

  -- Almacenes autorizados (union de warehouse_ids de todos los roles)
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

-- Verificación rápida
SELECT 'profile_complete view OK' AS status;
SELECT name, permissions->>'dashboard' AS dashboard_perm FROM roles;
