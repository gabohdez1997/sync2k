-- 005_fix_theming_and_settings.sql

-- 1. Add theme_config to profiles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'theme_config') THEN
        ALTER TABLE profiles ADD COLUMN theme_config JSONB DEFAULT NULL;
    END IF;
END $$;

-- 2. Add app_logo_width to system_settings
CREATE TABLE IF NOT EXISTS system_settings (
  id              BIGSERIAL   PRIMARY KEY,
  app_name        TEXT        NOT NULL DEFAULT 'GalpeApp',
  app_title       TEXT        NOT NULL DEFAULT 'GalpeApp | Gestión Inteligente',
  app_logo_url    TEXT        NOT NULL DEFAULT '/logo.png',
  app_logo_width  INTEGER     NOT NULL DEFAULT 200,
  primary_color   TEXT        NOT NULL DEFAULT '#3b82f6',
  footer_text     TEXT        NOT NULL DEFAULT '© 2026 GalpeApp. Todos los Derechos Reservados.',
  pwa_enabled     BOOLEAN     NOT NULL DEFAULT true,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure default row exists
INSERT INTO system_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_settings' AND column_name = 'app_logo_width') THEN
        ALTER TABLE system_settings ADD COLUMN app_logo_width INTEGER DEFAULT 200;
    END IF;
END $$;

-- 3. Recreate profile_complete View
DROP VIEW IF EXISTS profile_complete;

CREATE VIEW profile_complete AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.active,
  p.profit_user,
  p.profit_pass,
  p.theme_config,
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
        'id',                  b.id,
        'name',                b.name,
        'agent_url',           b.agent_url,
        'agent_token',         b.agent_token,
        'profit_branch_codes', b.profit_branch_codes,
        'sql_config',          b.sql_config,
        'profit_server_id',    b.profit_server_id,
        'local_dns_alias',     b.local_dns_alias
      ))
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      JOIN branches b ON (
        (r.branch_ids IS NULL OR cardinality(r.branch_ids) = 0)
        OR b.id = ANY(r.branch_ids)
      )
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
