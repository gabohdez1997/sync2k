-- ============================================================
-- SYNC2K – Esquema de Base de Datos Supabase
-- ============================================================

-- ─── Extensiones ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── COMPANIES ──────────────────────────────────────────────
-- Cada empresa es un tenant aislado dentro del SaaS.
CREATE TABLE public.companies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,           -- ej: "acme-corp"
  plan        TEXT NOT NULL DEFAULT 'free',   -- free | pro | enterprise
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PROFILES ───────────────────────────────────────────────
-- Extiende auth.users de Supabase (1-to-1). 
-- Se crea automáticamente al registrar un usuario (ver trigger más abajo).
CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id   UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  full_name    TEXT,
  avatar_url   TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ROLES ──────────────────────────────────────────────────
-- Roles definidos por empresa (no globales).
CREATE TABLE public.roles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,                 -- 'Admin' | 'Vendedor' | 'Inventarista'
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

-- ─── PERMISSIONS ────────────────────────────────────────────
-- Catálogo global de permisos disponibles en el sistema.
CREATE TABLE public.permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         TEXT UNIQUE NOT NULL,           -- 'facturar' | 'consultar_stock' | 'gestionar_usuarios'
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertar permisos base del sistema
INSERT INTO public.permissions (key, description) VALUES
  ('facturar',            'Crear y gestionar facturas'),
  ('consultar_stock',     'Ver inventario y niveles de stock'),
  ('gestionar_usuarios',  'Crear, editar y eliminar usuarios'),
  ('gestionar_productos', 'Crear, editar y eliminar productos'),
  ('ver_reportes',        'Acceder al módulo de reportes y analytics'),
  ('gestionar_empresa',   'Editar configuración de la empresa');

-- ─── ROLE_PERMISSIONS ───────────────────────────────────────
-- Qué permisos tiene cada rol (definido por empresa).
CREATE TABLE public.role_permissions (
  role_id        UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id  UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ─── USER_ROLES ─────────────────────────────────────────────
-- Un usuario puede tener múltiples roles dentro de su empresa.
CREATE TABLE public.user_roles (
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

-- ============================================================
-- TRIGGER: Crear perfil automáticamente al registrar usuario
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- FUNCIÓN: Obtener todos los permisos de un usuario
-- (Usada por RLS y por el backend para verificar acceso)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID)
RETURNS TABLE (permission_key TEXT)
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT pm.key
  FROM public.user_roles ur
  JOIN public.role_permissions rp ON rp.role_id = ur.role_id
  JOIN public.permissions pm      ON pm.id = rp.permission_id
  WHERE ur.user_id = p_user_id;
$$;

-- ============================================================
-- FUNCIÓN: Verificar si el usuario actual tiene un permiso
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_has_permission(permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.get_user_permissions(auth.uid()) gup
    WHERE gup.permission_key = user_has_permission.permission_key
  );
$$;

-- ============================================================
-- FUNCIÓN: Obtener company_id del usuario actual
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- ─── companies ──────────────────────────────────────────────
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven solo su empresa"
  ON public.companies FOR SELECT
  USING (id = public.get_user_company_id());

CREATE POLICY "Solo admin puede editar la empresa"
  ON public.companies FOR UPDATE
  USING (id = public.get_user_company_id() AND public.user_has_permission('gestionar_empresa'));

-- ─── profiles ───────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver perfiles de misma empresa"
  ON public.profiles FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Usuario edita su propio perfil"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Admin gestiona usuarios de su empresa"
  ON public.profiles FOR ALL
  USING (
    company_id = public.get_user_company_id()
    AND public.user_has_permission('gestionar_usuarios')
  );

-- ─── roles ──────────────────────────────────────────────────
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver roles de la empresa"
  ON public.roles FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "Admin gestiona roles"
  ON public.roles FOR ALL
  USING (
    company_id = public.get_user_company_id()
    AND public.user_has_permission('gestionar_usuarios')
  );

-- ─── user_roles ─────────────────────────────────────────────
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver asignaciones de roles de la empresa"
  ON public.user_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.company_id = public.get_user_company_id()
    )
  );

CREATE POLICY "Admin asigna roles"
  ON public.user_roles FOR ALL
  USING (public.user_has_permission('gestionar_usuarios'));

-- ─── role_permissions ───────────────────────────────────────
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver permisos de roles de la empresa"
  ON public.role_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_permissions.role_id
        AND r.company_id = public.get_user_company_id()
    )
  );

CREATE POLICY "Admin gestiona permisos de roles"
  ON public.role_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_permissions.role_id
        AND r.company_id = public.get_user_company_id()
    )
    AND public.user_has_permission('gestionar_usuarios')
  );

-- ─── permissions (catálogo global, solo lectura) ──────────────
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos los usuarios autenticados ven permisos"
  ON public.permissions FOR SELECT
  TO authenticated
  USING (TRUE);

-- ============================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_roles_company_id     ON public.roles(company_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id   ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id   ON public.user_roles(role_id);
