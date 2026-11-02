-- ============================================================
-- Sync2K / Profit Web — Migración v1.8
-- Crear tabla de integraciones y agregar permisos para Módulo de Integraciones
-- ============================================================

-- 1. Crear tabla api_integrations
CREATE TABLE IF NOT EXISTS public.api_integrations (
    id VARCHAR(64) PRIMARY KEY,
    provider VARCHAR(64) NOT NULL,
    category VARCHAR(32) NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    environment VARCHAR(20) DEFAULT 'sandbox',
    base_url TEXT,
    credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
    options JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT false,
    last_tested_at TIMESTAMPTZ,
    last_test_status VARCHAR(20),
    last_test_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Agregar permiso sec_integrations a Administrador y Root (acceso total)
UPDATE roles
SET permissions = jsonb_set(
  permissions,
  '{sec_integrations}',
  '{"read": true, "create": true, "update": true, "delete": true, "void": false, "others": true}'::jsonb,
  true
)
WHERE name IN ('Administrador', 'Root');

-- 3. Agregar permiso desactivado por defecto a los demás roles
UPDATE roles
SET permissions = jsonb_set(
  permissions,
  '{sec_integrations}',
  '{"read": false, "create": false, "update": false, "delete": false, "void": false, "others": false}'::jsonb,
  true
)
WHERE name NOT IN ('Administrador', 'Root');

