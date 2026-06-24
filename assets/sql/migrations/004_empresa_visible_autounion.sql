-- ============================================================================
-- ZV TASK MANAGER · MIGRACIÓN 004
-- 1. Agrega columna `visible` a empresas (default: true = pública).
-- 2. Actualiza política SELECT para que empresas ocultas solo las vean
--    sus miembros y el fundador.
-- 3. Permite auto-unirse a cualquier empresa visible.
-- 4. Función helper security definer para verificar primera membresía
--    sin problemas de recursión RLS.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================================

-- ① Columna de visibilidad
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS visible boolean NOT NULL DEFAULT true;

-- ② Función helper: primera membresía (security definer para bypass RLS)
CREATE OR REPLACE FUNCTION es_primera_membresia(p_empresa_id uuid)
RETURNS boolean AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM agentes_empresas WHERE empresa_id = p_empresa_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION es_primera_membresia(uuid) TO authenticated;

-- ③ Política SELECT en empresas
--    Visible para todos los autenticados si empresa.visible = true.
--    Si está oculta, solo la ven miembros activos y el fundador.
DROP POLICY IF EXISTS "empresas_visibles_para_autenticados" ON empresas;
DROP POLICY IF EXISTS "empresas_visibles_para_miembros" ON empresas;

CREATE POLICY "empresas_select" ON empresas
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      visible = true              -- empresa pública: cualquier autenticado la ve
      OR es_miembro_empresa(id)   -- miembro activo: la ve aunque esté oculta
      OR creador_id = auth.uid()  -- fundador: siempre la ve
    )
  );

-- ④ Política INSERT en agentes_empresas: permite auto-unión a empresas visibles
DROP POLICY IF EXISTS "membresias_admin_invita" ON agentes_empresas;

CREATE POLICY "membresias_insert" ON agentes_empresas
  FOR INSERT WITH CHECK (
    -- Admin de la empresa puede invitar a cualquiera
    es_admin_empresa(empresa_id)
    -- Primera membresía: al crear empresa (ningún miembro previo)
    OR es_primera_membresia(empresa_id)
    -- Auto-unirse: el propio agente se añade a empresa visible
    OR (
      agente_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM empresas e
        WHERE e.id = empresa_id AND e.visible = true
      )
    )
  );

-- ⑤ Política UPDATE en empresas: solo el fundador puede cambiar `visible`
--    (ya cubierto por la política existente "empresas_admin_edita" que usa
--     es_admin_empresa, pero el fundador puede no ser admin en agentes_empresas
--     si delegó ese rol; aquí lo garantizamos explícitamente para el campo visible)
DROP POLICY IF EXISTS "empresas_admin_edita" ON empresas;

CREATE POLICY "empresas_admin_edita" ON empresas
  FOR UPDATE USING (
    es_admin_empresa(id) OR creador_id = auth.uid()
  ) WITH CHECK (
    es_admin_empresa(id) OR creador_id = auth.uid()
  );
