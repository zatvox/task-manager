-- ============================================================================
-- MIGRACIÓN 007b — Fix recursión infinita en RLS de agentes_recordatorios
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================================
-- Problema: las policies de recordatorios_cronologicos y agentes_recordatorios
-- se consultan mutuamente → infinite recursion.
-- Solución: SECURITY DEFINER functions que bypasean RLS en una sola dirección.

-- 1. Función: ¿auth.uid() es creador de este recordatorio?
--    (consulta recordatorios_cronologicos sin pasar por su propia RLS)
CREATE OR REPLACE FUNCTION es_creador_recordatorio(p_recordatorio_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM recordatorios_cronologicos
    WHERE id = p_recordatorio_id AND agente_id = auth.uid()
  );
$$;

-- 2. Función: ¿auth.uid() está asignado a este recordatorio?
--    (consulta agentes_recordatorios sin pasar por su propia RLS)
CREATE OR REPLACE FUNCTION es_asignado_recordatorio(p_recordatorio_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM agentes_recordatorios
    WHERE recordatorio_id = p_recordatorio_id AND agente_id = auth.uid()
  );
$$;

-- 3. Reemplazar policy de agentes_recordatorios (elimina la recursiva)
DROP POLICY IF EXISTS "ar_select" ON agentes_recordatorios;

CREATE POLICY "ar_select" ON agentes_recordatorios
  FOR SELECT USING (
    agente_id = auth.uid()                          -- soy el asignado
    OR es_creador_recordatorio(recordatorio_id)     -- soy el creador
  );

-- 4. Reemplazar policy de recordatorios_cronologicos (elimina la recursiva)
DROP POLICY IF EXISTS "recordatorios_propios" ON recordatorios_cronologicos;

CREATE POLICY "recordatorios_propios" ON recordatorios_cronologicos
  FOR SELECT USING (
    agente_id = auth.uid()           -- soy el creador
    OR es_asignado_recordatorio(id)  -- estoy asignado
  );
