-- ============================================================
-- Sync2K / Profit Web — Migración v1.6
-- Permisos para módulo de Despachos de Almacén (inv_dispatches)
-- ============================================================

-- 1. Actualizar roles con el permiso inv_dispatches
DO $$
DECLARE
    role_rec RECORD;
    current_perms JSONB;
BEGIN
    FOR role_rec IN SELECT id, name, permissions FROM roles LOOP
        current_perms := role_rec.permissions;

        -- Si es superadmin o admin, dar permisos completos
        IF role_rec.name IN ('superadmin', 'admin', 'Almacen', 'Inventario', 'Almacén') THEN
            current_perms := jsonb_set(
                COALESCE(current_perms, '{}'::jsonb),
                '{inv_dispatches}',
                '{"read": true, "create": true, "update": true, "delete": true, "void": true}'::jsonb,
                true
            );
        ELSE
            -- Otros roles: al menos asegurar la clave
            IF NOT (current_perms ? 'inv_dispatches') THEN
                current_perms := jsonb_set(
                    COALESCE(current_perms, '{}'::jsonb),
                    '{inv_dispatches}',
                    '{"read": false, "create": false, "update": false, "delete": false, "void": false}'::jsonb,
                    true
                );
            END IF;
        END IF;

        UPDATE roles SET permissions = current_perms WHERE id = role_rec.id;
    END LOOP;
END $$;
