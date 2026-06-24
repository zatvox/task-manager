-- ============================================================================
-- ZV TASK MANAGER · MIGRACIÓN 003
-- Permite que TODOS los usuarios autenticados vean la lista de empresas.
-- Antes: solo los miembros veían las empresas → nuevos usuarios no podían
-- descubrir ni solicitar unirse a ninguna empresa.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================================

-- Reemplazar política restrictiva por una que permita descubrir empresas
DROP POLICY IF EXISTS "empresas_visibles_para_miembros" ON empresas;

CREATE POLICY "empresas_visibles_para_autenticados" ON empresas
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Las demás políticas (INSERT/UPDATE/DELETE) permanecen sin cambios.
-- Un usuario puede VER todas las empresas, pero solo puede EDITAR/ELIMINAR
-- las que administra (es_admin_empresa) y crear si es auth.uid() IS NOT NULL.
