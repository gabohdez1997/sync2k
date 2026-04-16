-- Agregar columna para unidades de medida que permiten decimales
ALTER TABLE branches ADD COLUMN IF NOT EXISTS allow_decimals_units text DEFAULT 'MTS, MTS2, KG';
