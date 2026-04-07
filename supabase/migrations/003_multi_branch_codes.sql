-- ============================================================
-- Sync2K / Profit Web — Migración v1.1
-- Soporte para múltiples códigos de sucursal por nodo/agente
-- ============================================================

-- 1. Añadimos la columna vectorial de JSONB
ALTER TABLE branches ADD COLUMN IF NOT EXISTS profit_branch_codes JSONB DEFAULT '[]'::jsonb;

-- 2. Migramos los datos heredados string simple -> JSONB list
UPDATE branches 
SET profit_branch_codes = jsonb_build_array(
  jsonb_build_object('code', profit_branch_code, 'is_default', true)
) 
WHERE profit_branch_code IS NOT NULL AND profit_branch_code != '';

-- 3. Borramos la vista profile_complete (ya que es dependiente de branches)
DROP VIEW IF EXISTS profile_complete;

-- 4. Eliminamos la columna vieja (no requerida)
ALTER TABLE branches DROP COLUMN IF EXISTS profit_branch_code;

-- 5. Reconstruimos la Vista reemplazando `profit_branch_code` por `profit_branch_codes`
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
        'profit_branch_codes', b.profit_branch_codes,  -- ¡Nueva columna JSONB!
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

-- 6. Actualizamos el SEED original por si acaso alguien corre el 001_init de base.
-- (Este paso solo tiene sentido en el archivo de init, pero aquí lo dejamos limpio)
