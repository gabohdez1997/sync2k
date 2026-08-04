-- =====================================================================
-- CONFIGURACIÓN SUPABASE PARA MÓDULO DE IMÁGENES DE ARTÍCULOS
-- Ejecutar en el SQL Editor de Supabase (Producción)
-- =====================================================================

-- 1. CREAR EL BUCKET "articulos" (SI NO EXISTE)
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('articulos', 'articulos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. POLÍTICAS DE SEGURIDAD PARA EL BUCKET (RLS)
-- =====================================================================
-- Permitir SELECT a todos (público)
CREATE POLICY "Public Access for articulos"
ON storage.objects FOR SELECT
USING (bucket_id = 'articulos');

-- Permitir INSERT a usuarios (incluyendo anónimos del cliente Svelte)
CREATE POLICY "Users can upload images to articulos"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'articulos');

-- Permitir UPDATE a usuarios
CREATE POLICY "Users can update images in articulos"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'articulos');

-- Permitir DELETE a usuarios
CREATE POLICY "Users can delete images from articulos"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'articulos');

-- 3. ACTUALIZAR ROLES CON EL NUEVO PERMISO (sec_article_images)
-- =====================================================================
-- Asegurarnos de que el rol Admin (u otros roles existentes) tenga el permiso
-- Si los permisos ya existen como JSONB en la columna 'permissions' de la tabla 'roles':

UPDATE roles
SET permissions = jsonb_set(
  COALESCE(permissions, '{}'::jsonb), 
  '{sec_article_images}', 
  '{"read": true, "create": true, "update": true, "delete": true, "void": false, "others": false}'::jsonb, 
  true
)
WHERE name = 'Admin'; -- Puedes replicar este bloque para otros roles si es necesario
