-- ==============================================================================
-- 017_global_consecutivos.sql
-- Tabla centralizada para correlativos únicos globales multi-sede (Retenciones IVA / ISLR)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS global_consecutivos (
    tipo VARCHAR(50) PRIMARY KEY,
    prox_n BIGINT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed con los valores actuales consolidados de las sedes (Boca de Río / Paraparal)
INSERT INTO global_consecutivos (tipo, prox_n, updated_at)
VALUES 
    ('C016', 4888, NOW()), -- Retención de IVA compras (IVAN)
    ('C015', 1116, NOW())  -- Retención de ISLR compras (ISLR)
ON CONFLICT (tipo) DO UPDATE 
SET prox_n = GREATEST(global_consecutivos.prox_n, EXCLUDED.prox_n),
    updated_at = NOW();

-- Habilitar Row Level Security
ALTER TABLE global_consecutivos ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso
CREATE POLICY "Allow public read global_consecutivos" ON global_consecutivos
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Allow service_role full access global_consecutivos" ON global_consecutivos
    FOR ALL TO service_role USING (true) WITH CHECK (true);
