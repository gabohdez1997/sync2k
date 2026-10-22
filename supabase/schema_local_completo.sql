-- ==============================================================================
-- SYNC2K — ESQUEMA CONSOLIDADO COMPLETO PARA INSTALACIÓN EN LIMPIO (LOCAL / ON-PREMISE)
-- Compatible con: PostgreSQL 14+ / Supabase Self-Hosted
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. TABLA: PROFILES (Usuarios del sistema)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT,        -- Hash bcrypt para autenticación local
  profit_user   TEXT,        -- Usuario asociado en Profit Plus (co_us_in)
  profit_pass   TEXT,        -- Contraseña de usuario en Profit Plus
  theme_config  JSONB       DEFAULT NULL,
  active        BOOLEAN     NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 3. TABLA: ROLES (Perfiles de acceso y matriz de permisos)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS roles (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL UNIQUE,
  permissions   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  branch_ids    UUID[]      NOT NULL DEFAULT '{}',   -- Array de UUIDs (vacío = acceso a todas)
  warehouse_ids TEXT[]      NOT NULL DEFAULT '{}',   -- Array de almacenes (vacío = todos)
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 4. TABLA: USER_ROLES (Asignación N:M de roles a usuarios)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS user_roles (
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id     UUID        NOT NULL REFERENCES roles(id)    ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- ==============================================================================
-- 5. TABLA: BRANCHES (Sucursales y configuración de nodos de conexión)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS branches (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  business_name         TEXT,       -- Razón social legal
  rif                   TEXT,       -- RIF / NIT fiscal
  address               TEXT,       -- Dirección física
  phone                 TEXT,       -- Teléfono de contacto
  logo_url              TEXT,
  latitude              DOUBLE PRECISION,
  longitude             DOUBLE PRECISION,
  agent_url             TEXT,       -- URL HTTP del agente local (ej: http://localhost:3001)
  agent_token           TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  profit_branch_codes   JSONB       DEFAULT '[]'::jsonb, -- [{"code": "001", "is_default": true}]
  profit_server_id      TEXT,       -- ID en config/servers.json del agente (ej: 'G1')
  local_dns_alias       TEXT,
  default_warehouse     TEXT,       -- Código de almacén por defecto (ej: '01')
  default_seller        TEXT        DEFAULT '01',
  allow_decimals_units  TEXT[]      DEFAULT '{}',
  sql_config            JSONB       DEFAULT '{}'::jsonb,
  active                BOOLEAN     NOT NULL DEFAULT true,
  sort_order            INTEGER     NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 6. TABLA: PRINTERS (Impresoras térmicas, matriciales y fiscales por sucursal)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS printers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  ip_address  TEXT        NOT NULL,
  port        INTEGER     NOT NULL DEFAULT 9100,
  branch_id   UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  sublines    TEXT[]      NOT NULL DEFAULT '{}',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 7. TABLA: AUDIT_LOG (Bitácora de auditoría)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  user_email  TEXT,
  action      TEXT        NOT NULL, -- CREATE | UPDATE | DELETE | VOID | etc.
  module      TEXT        NOT NULL,
  record_id   TEXT,
  old_data    JSONB,
  new_data    JSONB,
  metadata    JSONB,
  branch_id   UUID        REFERENCES branches(id) ON DELETE SET NULL,
  source      TEXT        NOT NULL DEFAULT 'local',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 8. TABLA: SYSTEM_SETTINGS (Personalización y Branding del sistema)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS system_settings (
  id              BIGSERIAL   PRIMARY KEY,
  app_name        TEXT        NOT NULL DEFAULT 'Sync2K',
  app_title       TEXT        NOT NULL DEFAULT 'Sync2K | Gestión Inteligente',
  app_logo_url    TEXT        NOT NULL DEFAULT '/logo.png',
  app_logo_width  INTEGER     NOT NULL DEFAULT 200,
  primary_color   TEXT        NOT NULL DEFAULT '#3b82f6',
  footer_text     TEXT        NOT NULL DEFAULT '© 2026 Sync2K. Todos los Derechos Reservados.',
  pwa_enabled     BOOLEAN     NOT NULL DEFAULT true,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 9. TABLA: GLOBAL_CONSECUTIVOS (Correlativos únicos globales para retenciones)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS global_consecutivos (
  tipo        VARCHAR(50) PRIMARY KEY,
  prox_n      BIGINT      NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 10. TABLAS AUXILIARES OFFLINE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS local_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  branch_id   UUID        REFERENCES branches(id),
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_log (
  id              BIGSERIAL   PRIMARY KEY,
  direction       TEXT        NOT NULL,
  status          TEXT        NOT NULL,
  tables_synced   TEXT[],
  records_synced  INTEGER     DEFAULT 0,
  error_msg       TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

-- ==============================================================================
-- 11. ÍNDICES DE RENDIMIENTO
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_email       ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_active      ON profiles(active);
CREATE INDEX IF NOT EXISTS idx_roles_name           ON roles(name);
CREATE INDEX IF NOT EXISTS idx_user_roles_user      ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role      ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_branches_active      ON branches(active);
CREATE INDEX IF NOT EXISTS idx_printers_branch      ON printers(branch_id);
CREATE INDEX IF NOT EXISTS idx_audit_created        ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_module_date    ON audit_log(module, created_at DESC);

-- ==============================================================================
-- 12. FUNCIONES Y PROCEDIMIENTOS ALMACENADOS
-- ==============================================================================

-- Actualización automática de updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_roles_updated ON roles;
CREATE TRIGGER trg_roles_updated
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_branches_updated ON branches;
CREATE TRIGGER trg_branches_updated
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Función para fusionar permisos CRUD + void + others por usuario
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
        'void',   bool_or(COALESCE((value->>'void')::boolean,   false)),
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

-- Función helper para registrar auditoría
CREATE OR REPLACE FUNCTION log_action(
  p_user_id    UUID,
  p_user_email TEXT,
  p_action     TEXT,
  p_module     TEXT,
  p_record_id  TEXT    DEFAULT NULL,
  p_old_data   JSONB   DEFAULT NULL,
  p_new_data   JSONB   DEFAULT NULL,
  p_branch_id  UUID    DEFAULT NULL,
  p_source     TEXT    DEFAULT 'local'
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

-- ==============================================================================
-- 13. VISTA CONSOLIDADA: PROFILE_COMPLETE (Requerida por SvelteKit)
-- ==============================================================================
DROP VIEW IF EXISTS profile_complete;

CREATE OR REPLACE VIEW profile_complete AS
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

  -- Permisos fusionados vía OR lógico
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

  -- Sucursales autorizadas
  COALESCE(
    (
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id',                   b.id,
        'name',                 b.name,
        'business_name',        b.business_name,
        'rif',                  b.rif,
        'address',              b.address,
        'phone',                b.phone,
        'logo_url',             b.logo_url,
        'agent_url',            b.agent_url,
        'agent_token',          b.agent_token,
        'profit_branch_codes',  b.profit_branch_codes,
        'sql_config',           b.sql_config,
        'profit_server_id',     b.profit_server_id,
        'local_dns_alias',      b.local_dns_alias,
        'default_warehouse',    b.default_warehouse,
        'default_seller',       b.default_seller,
        'allow_decimals_units', b.allow_decimals_units
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

-- ==============================================================================
-- 14. SEED: DATOS INICIALES POR DEFECTO
-- ==============================================================================

-- 14.1 Configuración de Branding
INSERT INTO system_settings (id, app_name, app_title, app_logo_url, app_logo_width, primary_color, footer_text, pwa_enabled)
VALUES (1, 'Sync2K', 'Sync2K | Gestión Inteligente', '/logo.png', 200, '#3b82f6', '© 2026 Sync2K. Todos los Derechos Reservados.', true)
ON CONFLICT (id) DO NOTHING;

-- 14.2 Correlativos Globales iniciales
INSERT INTO global_consecutivos (tipo, prox_n, updated_at)
VALUES 
    ('C016', 1, NOW()), -- Retenciones IVA (IVAN)
    ('C015', 1, NOW())  -- Retenciones ISLR (ISLR)
ON CONFLICT (tipo) DO NOTHING;

-- 14.3 Rol Administrador con matriz de permisos completa
INSERT INTO roles (id, name, permissions, branch_ids, warehouse_ids)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Administrador',
  '{
    "dashboard":                   {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": false},
    "sales_customers":             {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": true},
    "sales_quotes":                {"read": true, "create": true,  "update": true,  "delete": true,  "void": true,  "others": true},
    "sales_orders":                {"read": true, "create": true,  "update": true,  "delete": true,  "void": true,  "others": true},
    "sales_price_checker":         {"read": true, "create": false, "update": false, "delete": false, "void": false, "others": false},
    "cash_billing":                {"read": true, "create": true,  "update": false, "delete": true,  "void": true,  "others": true},
    "cash_payments":               {"read": true, "create": true,  "update": true,  "delete": true,  "void": true,  "others": true},
    "cash_credits":                {"read": true, "create": true,  "update": true,  "delete": true,  "void": true,  "others": true},
    "cash_exchange":               {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": true},
    "sec_articles":                {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": true},
    "sec_article_images":          {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": false},
    "sec_users":                   {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": true},
    "sec_roles":                   {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": true},
    "sec_branches":                {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": true},
    "sec_printers":                {"read": true, "create": true,  "update": true,  "delete": true,  "void": true,  "others": true},
    "sec_settings":                {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": true},
    "sec_audit":                   {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": true},
    "inv_receipts":                {"read": true, "create": true,  "update": true,  "delete": true,  "void": true,  "others": true},
    "inv_dispatches":              {"read": true, "create": true,  "update": true,  "delete": true,  "void": true,  "others": true},
    "inv_transfers":               {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": true},
    "pur_suppliers":               {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": false},
    "pur_categories":              {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": true},
    "pur_lines":                   {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": true},
    "pur_sublines":                {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": true},
    "pur_articles":                {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": true},
    "pur_orders":                  {"read": true, "create": true,  "update": true,  "delete": true,  "void": true,  "others": true},
    "pur_invoices":                {"read": true, "create": true,  "update": false, "delete": true,  "void": true,  "others": true},
    "pur_payments":                {"read": true, "create": true,  "update": true,  "delete": true,  "void": true,  "others": true},
    "reports_receivables":         {"read": true, "create": true,  "update": true,  "delete": true,  "void": true,  "others": true},
    "reports_payables":            {"read": true, "create": false, "update": true,  "delete": false, "void": false, "others": true},
    "reports_collections_summary": {"read": true, "create": true,  "update": true,  "delete": true,  "void": false, "others": false},
    "reports_cashier_month":       {"read": true, "create": false, "update": false, "delete": false, "void": false, "others": false},
    "reports_sales_analysis":      {"read": true, "create": false, "update": false, "delete": false, "void": false, "others": false},
    "reports_vendor_performance":  {"read": true, "create": false, "update": false, "delete": false, "void": false, "others": false},
    "reports_article_sales":       {"read": true, "create": false, "update": false, "delete": false, "void": false, "others": false},
    "reports_article_stock":       {"read": true, "create": false, "update": false, "delete": false, "void": false, "others": false},
    "reports_article_prices":      {"read": true, "create": false, "update": false, "delete": false, "void": false, "others": false},
    "reports_exchange_diff":       {"read": true, "create": false, "update": false, "delete": false, "void": false, "others": false},
    "reports_detailed_account":    {"read": true, "create": false, "update": false, "delete": false, "void": false, "others": true},
    "rep_analisis_compras":        {"read": true, "create": false, "update": false, "delete": false, "void": false, "others": false}
  }'::jsonb,
  ARRAY[]::UUID[],
  ARRAY[]::TEXT[]
)
ON CONFLICT (id) DO UPDATE 
SET permissions = EXCLUDED.permissions;

-- 14.4 Sucursal Inicial de Ejemplo
INSERT INTO branches (
  id, name, business_name, rif, agent_url, agent_token,
  profit_branch_codes, profit_server_id, default_warehouse, active
)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'Sede Principal',
  'Empresa Principal C.A.',
  'J-00000000-0',
  'http://localhost:3001',
  'token_seguro_agente_123',
  '[{"code": "001", "is_default": true}]'::jsonb,
  'G1',
  '01',
  true
)
ON CONFLICT (id) DO NOTHING;

-- 14.5 Usuario Administrador Inicial
-- Email: admin@sync2k.local
-- Contraseña por defecto: Admin1234*
-- Hash bcrypt para 'Admin1234*': $2b$10$Hc0Q0Tek4PhhNk.apypLzObUPxx4Uqph5y5gL99NAfuSjIoUNBONS
INSERT INTO profiles (
  id, full_name, email, password_hash, profit_user, active
)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'Administrador del Sistema',
  'admin@sync2k.local',
  '$2b$10$Hc0Q0Tek4PhhNk.apypLzObUPxx4Uqph5y5gL99NAfuSjIoUNBONS',
  'PROFIT',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Asignar rol Administrador al usuario creado
INSERT INTO user_roles (user_id, role_id)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001'
)
ON CONFLICT (user_id, role_id) DO NOTHING;
