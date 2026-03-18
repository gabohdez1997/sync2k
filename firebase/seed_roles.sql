-- ============================================================
-- SYNC2K – Seed: Roles y Permisos por Defecto para una Empresa
-- ============================================================
-- Ejecuta esto DESPUÉS de crear una empresa para inicializar
-- sus roles base. Reemplaza <COMPANY_ID> con el UUID real.
-- ============================================================

DO $$
DECLARE
  v_company_id    UUID := '<COMPANY_ID>';  -- ← Reemplazar
  v_role_admin    UUID;
  v_role_vendedor UUID;
  v_role_invent   UUID;
  v_perm          UUID;
BEGIN

  -- ── Roles ──────────────────────────────────────────────────
  INSERT INTO public.roles (company_id, name, description)
    VALUES (v_company_id, 'Admin', 'Acceso total al sistema')
    RETURNING id INTO v_role_admin;

  INSERT INTO public.roles (company_id, name, description)
    VALUES (v_company_id, 'Vendedor', 'Puede facturar y consultar stock')
    RETURNING id INTO v_role_vendedor;

  INSERT INTO public.roles (company_id, name, description)
    VALUES (v_company_id, 'Inventarista', 'Gestiona productos e inventario')
    RETURNING id INTO v_role_invent;

  -- ── Admin: todos los permisos ────────────────────────────
  FOR v_perm IN (SELECT id FROM public.permissions) LOOP
    INSERT INTO public.role_permissions (role_id, permission_id)
      VALUES (v_role_admin, v_perm);
  END LOOP;

  -- ── Vendedor: facturar + consultar_stock + ver_reportes ───
  INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_vendedor, id FROM public.permissions
    WHERE key IN ('facturar', 'consultar_stock', 'ver_reportes');

  -- ── Inventarista: consultar_stock + gestionar_productos ───
  INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_invent, id FROM public.permissions
    WHERE key IN ('consultar_stock', 'gestionar_productos');

  RAISE NOTICE 'Roles y permisos creados correctamente para company_id: %', v_company_id;
END;
$$;
