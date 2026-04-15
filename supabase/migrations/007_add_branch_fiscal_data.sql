-- Migration: 007_add_branch_fiscal_data.sql
-- Añade el campo Razón Social y asegura campos fiscales en sucursales.

ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS rif           TEXT,
ADD COLUMN IF NOT EXISTS address       TEXT,
ADD COLUMN IF NOT EXISTS phone         TEXT,
ADD COLUMN IF NOT EXISTS logo_url      TEXT,
ADD COLUMN IF NOT EXISTS latitude      DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude     DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS default_warehouse TEXT;

-- Comentario informativo
COMMENT ON COLUMN branches.business_name IS 'Nombre legal/fiscal de la sucursal o empresa';
COMMENT ON COLUMN branches.rif IS 'Identificación fiscal (RIF/NIT)';
