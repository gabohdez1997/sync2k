-- ============================================================
-- Sync2K / Profit Web — Migración v1.6
-- Agregar columna sublines (TEXT[]) a la tabla printers
-- ============================================================

ALTER TABLE printers ADD COLUMN IF NOT EXISTS sublines TEXT[] DEFAULT '{}';
