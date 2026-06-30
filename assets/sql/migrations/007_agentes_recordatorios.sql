-- ============================================================================
-- MIGRACIÓN 007 — Asignación de agentes a recordatorios (muchos a muchos)
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================================

-- 1. Tabla de asignaciones
CREATE TABLE IF NOT EXISTS agentes_recordatorios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recordatorio_id uuid NOT NULL REFERENCES recordatorios_cronologicos(id) ON DELETE CASCADE,
  agente_id       uuid NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (recordatorio_id, agente_id)
);

CREATE INDEX IF NOT EXISTS idx_agentes_recordatorios_rec    ON agentes_recordatorios(recordatorio_id);
CREATE INDEX IF NOT EXISTS idx_agentes_recordatorios_agente ON agentes_recordatorios(agente_id);

-- 2. RLS en la nueva tabla
ALTER TABLE agentes_recordatorios ENABLE ROW LEVEL SECURITY;

-- Ver: agente asignado O miembro de la empresa del recordatorio
CREATE POLICY "ar_select" ON agentes_recordatorios
  FOR SELECT USING (
    agente_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM recordatorios_cronologicos r
      JOIN agentes_empresas ae ON ae.empresa_id = r.empresa_id AND ae.agente_id = auth.uid()
      WHERE r.id = recordatorio_id
    )
  );

-- Insertar / eliminar: solo el creador del recordatorio
CREATE POLICY "ar_insert" ON agentes_recordatorios
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM recordatorios_cronologicos r
      WHERE r.id = recordatorio_id AND r.agente_id = auth.uid()
    )
  );

CREATE POLICY "ar_delete" ON agentes_recordatorios
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM recordatorios_cronologicos r
      WHERE r.id = recordatorio_id AND r.agente_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, DELETE ON agentes_recordatorios TO authenticated;

-- 3. Ampliar SELECT de recordatorios: también ve los que te asignaron
DROP POLICY IF EXISTS "recordatorios_propios" ON recordatorios_cronologicos;

CREATE POLICY "recordatorios_propios" ON recordatorios_cronologicos
  FOR SELECT USING (
    agente_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM agentes_recordatorios ar
      WHERE ar.recordatorio_id = id AND ar.agente_id = auth.uid()
    )
  );
