-- ============================================================
-- Sync2K / Profit Web — Schema v1.0
-- Compatible con: Supabase Cloud (PG 15+) y PostgreSQL local (PG 14+)
-- Sin multi-tenant: cada deployment es una instancia independiente
-- ============================================================

-- Extensiones (disponibles en ambos entornos)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. PROFILES — Usuarios del sistema
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,

  -- Contraseña hasheada (bcrypt) — para auth en modo OFFLINE (local)
  -- En Supabase Cloud: se sincroniza desde auth.users via trigger o script
  -- En PostgreSQL local: se sincroniza desde Cloud via sync-daemon
  password_hash TEXT,

  -- Credenciales de Profit Plus para auditoría en SQL Server
  profit_user   TEXT,    -- co_us_in / co_us_mo en Profit
  profit_pass   TEXT,    -- contraseña SQL de Profit (puede encriptarse)

  active        BOOLEAN     NOT NULL DEFAULT true,

  -- Control de sincronización entre Cloud ↔ local
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. ROLES — Perfiles de acceso con permisos CRUD por módulo
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,  -- 'Administrador', 'Cajero', etc.

  -- Permisos por módulo — formato heredado de Firestore (compatible con el frontend actual):
  -- {
  --   "dashboard":       { "read": true,  "create": false, "update": false, "delete": false },
  --   "sales_customers": { "read": true,  "create": true,  "update": true,  "delete": false },
  --   "sec_users":       { "read": true,  "create": true,  "update": true,  "delete": true  }
  -- }
  permissions JSONB       NOT NULL DEFAULT '{}',

  -- Sucursales autorizadas: array de UUIDs de la tabla branches
  -- [] = sin restricción (acceso a todas)
  branch_ids  UUID[]      NOT NULL DEFAULT '{}',

  -- Almacenes autorizados: array de co_alma de Profit Plus
  -- [] = sin restricción (acceso a todos)
  warehouse_ids TEXT[]    NOT NULL DEFAULT '{}',

  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. USER_ROLES — Asignación de roles a usuarios (N:M)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
  user_id     UUID        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  role_id     UUID        NOT NULL REFERENCES roles(id)     ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- ============================================================
-- 4. BRANCHES — Sucursales + configuración del agente
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,

  -- URL del agente (Tailscale Funnel, nginx proxy, etc.)
  -- Ejemplos:
  --   https://vm-galpe.tail1234.ts.net      (Tailscale Funnel — actual)
  --   https://agents.empresa.com/galpe      (VPS nginx — futuro)
  --   http://localhost:3000                 (desarrollo local)
  agent_url           TEXT,

  -- Token de autenticación del profit-agente (header x-api-key)
  agent_token         TEXT        NOT NULL DEFAULT gen_random_uuid()::text,

  -- Configuración Profit Plus
  profit_branch_code  TEXT,       -- co_sucu en Profit (ej: '001', 'G01')
  profit_server_id    TEXT,       -- id en config/servers.json del agente (ej: 'G1')

  -- Alias DNS local (ej: 'profit.galpe.local') — informativo
  local_dns_alias     TEXT,

  active              BOOLEAN     NOT NULL DEFAULT true,
  sort_order          INTEGER     NOT NULL DEFAULT 0,

  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. AUDIT_LOG — Bitácora de acciones del sistema
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL   PRIMARY KEY,

  -- Quién realizó la acción
  user_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  user_email  TEXT,        -- copia desnormalizada

  -- Qué hizo
  action      TEXT        NOT NULL,  -- 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'VIEW'
  module      TEXT        NOT NULL,  -- 'clientes' | 'usuarios' | 'roles' | 'auth' | ...
  record_id   TEXT,                  -- ID del registro afectado (flexible)

  -- Detalle del cambio (opcional)
  old_data    JSONB,
  new_data    JSONB,
  metadata    JSONB,       -- { ip, user_agent, branch_id, ... }

  -- Desde qué sucursal
  branch_id   UUID        REFERENCES branches(id) ON DELETE SET NULL,

  -- Modo de operación
  source      TEXT        NOT NULL DEFAULT 'cloud',   -- 'cloud' | 'local'

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. LOCAL_SESSIONS — Solo para PostgreSQL local (modo offline)
--    En Supabase Cloud se crea igual pero no se usa
-- ============================================================
CREATE TABLE IF NOT EXISTS local_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL,           -- SHA256 del JWT local
  expires_at  TIMESTAMPTZ NOT NULL,
  branch_id   UUID        REFERENCES branches(id),
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. SYNC_LOG — Registro de sincronizaciones (solo local)
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_log (
  id              BIGSERIAL   PRIMARY KEY,
  direction       TEXT        NOT NULL,   -- 'cloud_to_local' | 'local_to_cloud'
  status          TEXT        NOT NULL,   -- 'success' | 'error' | 'partial'
  tables_synced   TEXT[],
  records_synced  INTEGER     DEFAULT 0,
  error_msg       TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

-- ============================================================
-- ÍNDICES DE PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_email      ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_active     ON profiles(active);
CREATE INDEX IF NOT EXISTS idx_profiles_updated    ON profiles(updated_at);
CREATE INDEX IF NOT EXISTS idx_roles_name          ON roles(name);
CREATE INDEX IF NOT EXISTS idx_user_roles_user     ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role     ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_branches_active     ON branches(active);
CREATE INDEX IF NOT EXISTS idx_audit_user_date     ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_module_date   ON audit_log(module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created       ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_sessions_exp  ON local_sessions(expires_at);

-- ============================================================
-- VISTA: profile_complete
-- Reemplaza getUserProfile() de Firestore.
-- Retorna perfil + permisos fusionados + roles + sucursales + almacenes
-- ============================================================
-- Vista: profile_complete
-- Primero creamos una función auxiliar para los permisos fusionados
-- (evita anidar funciones de agregación)
CREATE OR REPLACE FUNCTION get_merged_permissions(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
-- Fusiona los permisos de TODOS los roles del usuario usando OR lógico.
-- Separamos en dos niveles para evitar el error "aggregate calls cannot be nested":
--   INNER: bool_or() agrupa por key → produce 1 fila por módulo con su JSONB de CRUD
--   OUTER: jsonb_object_agg() convierte esas filas en un único objeto JSONB
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
    GROUP BY key          -- ← bool_or opera aquí (nivel inner)
  ) aggregated;           -- jsonb_object_agg opera aquí (nivel outer, sin nesting)

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

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

  -- Permisos fusionados via función auxiliar (OR lógico entre todos los roles)
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

  -- Sucursales autorizadas (union de branch_ids de todos los roles)
  COALESCE(
    (
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id',                  b.id,
        'name',                b.name,
        'agent_url',           b.agent_url,
        'agent_token',         b.agent_token,
        'profit_branch_code',  b.profit_branch_code,
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

-- ============================================================
-- FUNCIÓN: log_action — Helper para registrar auditoría
-- Uso: SELECT log_action('uuid', 'user@email.com', 'CREATE', 'clientes', 'CLI001', null, '{...}', 'uuid-branch', 'cloud');
-- ============================================================
CREATE OR REPLACE FUNCTION log_action(
  p_user_id    UUID,
  p_user_email TEXT,
  p_action     TEXT,
  p_module     TEXT,
  p_record_id  TEXT    DEFAULT NULL,
  p_old_data   JSONB   DEFAULT NULL,
  p_new_data   JSONB   DEFAULT NULL,
  p_branch_id  UUID    DEFAULT NULL,
  p_source     TEXT    DEFAULT 'cloud'
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO audit_log (
    user_id, user_email, action, module,
    record_id, old_data, new_data, branch_id, source
  )
  VALUES (
    p_user_id, p_user_email, p_action, p_module,
    p_record_id, p_old_data, p_new_data, p_branch_id, p_source
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ============================================================
-- FUNCIÓN: update_updated_at — Trigger helper
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers para mantener updated_at automático
CREATE OR REPLACE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_roles_updated
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_branches_updated
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED: Datos iniciales
-- ============================================================

-- Sucursal inicial (Galpe)
INSERT INTO branches (name, profit_branch_code, profit_server_id, local_dns_alias)
VALUES ('Sede Galpe', '001', 'G1', 'profit.galpe.local')
ON CONFLICT DO NOTHING;

-- Rol Administrador con acceso total
INSERT INTO roles (name, permissions, branch_ids, warehouse_ids)
SELECT
  'Administrador',
  '{
    "dashboard":       {"read": true,  "create": false, "update": false, "delete": false},
    "sales_customers": {"read": true,  "create": true,  "update": true,  "delete": true},
    "sales_quotes":    {"read": true,  "create": true,  "update": true,  "delete": true},
    "sales_orders":    {"read": true,  "create": true,  "update": true,  "delete": true},
    "cash_billing":    {"read": true,  "create": true,  "update": true,  "delete": true},
    "cash_payments":   {"read": true,  "create": true,  "update": true,  "delete": true},
    "cash_credits":    {"read": true,  "create": true,  "update": true,  "delete": true},
    "sec_articles":    {"read": true,  "create": true,  "update": true,  "delete": true},
    "inv_shipping":    {"read": true,  "create": true,  "update": true,  "delete": true},
    "inv_void":        {"read": true,  "create": true,  "update": true,  "delete": false},
    "pur_articles":    {"read": true,  "create": true,  "update": true,  "delete": true},
    "pur_quotes":      {"read": true,  "create": true,  "update": true,  "delete": true},
    "pur_orders":      {"read": true,  "create": true,  "update": true,  "delete": true},
    "pur_invoices":    {"read": true,  "create": true,  "update": true,  "delete": true},
    "pur_payments":    {"read": true,  "create": true,  "update": true,  "delete": true},
    "pur_returns":     {"read": true,  "create": true,  "update": true,  "delete": true},
    "sec_users":       {"read": true,  "create": true,  "update": true,  "delete": true},
    "sec_roles":       {"read": true,  "create": true,  "update": true,  "delete": true},
    "sec_branches":    {"read": true,  "create": true,  "update": true,  "delete": true},
    "sec_audit":       {"read": true,  "create": false, "update": false, "delete": false}
  }'::jsonb,
  ARRAY[]::UUID[],     -- [] = acceso a todas las sucursales
  ARRAY[]::TEXT[]      -- [] = acceso a todos los almacenes
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Administrador');

-- Rol Cajero (ejemplo)
INSERT INTO roles (name, permissions, branch_ids, warehouse_ids)
SELECT
  'Cajero',
  '{
    "dashboard":       {"read": true,  "create": false, "update": false, "delete": false},
    "sales_customers": {"read": true,  "create": true,  "update": true,  "delete": false},
    "sales_quotes":    {"read": true,  "create": true,  "update": false, "delete": false},
    "sales_orders":    {"read": true,  "create": true,  "update": false, "delete": false},
    "cash_billing":    {"read": true,  "create": true,  "update": false, "delete": false},
    "cash_payments":   {"read": true,  "create": true,  "update": false, "delete": false},
    "cash_credits":    {"read": true,  "create": false, "update": false, "delete": false}
  }'::jsonb,
  ARRAY[]::UUID[],
  ARRAY[]::TEXT[]
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Cajero');

-- Rol Almacén (ejemplo)
INSERT INTO roles (name, permissions, branch_ids, warehouse_ids)
SELECT
  'Almacén',
  '{
    "dashboard":       {"read": true,  "create": false, "update": false, "delete": false},
    "sec_articles":    {"read": true,  "create": true,  "update": true,  "delete": false},
    "inv_shipping":    {"read": true,  "create": true,  "update": false, "delete": false},
    "inv_void":        {"read": false, "create": false, "update": false, "delete": false},
    "pur_articles":    {"read": true,  "create": false, "update": false, "delete": false}
  }'::jsonb,
  ARRAY[]::UUID[],
  ARRAY[]::TEXT[]
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Almacén');
