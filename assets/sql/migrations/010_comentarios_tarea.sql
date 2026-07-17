-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 010: Tabla comentarios_tarea (v2 - sin auth_id)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS comentarios_tarea (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tarea_id    UUID        NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  agente_id   UUID        REFERENCES agentes(id) ON DELETE SET NULL,
  contenido   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_tarea_tarea  ON comentarios_tarea(tarea_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_tarea_agente ON comentarios_tarea(agente_id);

ALTER TABLE comentarios_tarea ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer
CREATE POLICY "comentarios_select" ON comentarios_tarea
  FOR SELECT USING (auth.role() = 'authenticated');

-- El agente puede insertar comentarios donde agente_id = su propio auth uid
-- (asume que agentes.id === auth.uid())
CREATE POLICY "comentarios_insert" ON comentarios_tarea
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND agente_id::text = auth.uid()::text
  );

-- Solo el autor puede borrar su comentario
CREATE POLICY "comentarios_delete" ON comentarios_tarea
  FOR DELETE USING (
    agente_id::text = auth.uid()::text
  );

-- Verificación
SELECT 'OK: comentarios_tarea creada' AS resultado,
       COUNT(*) AS total FROM comentarios_tarea;
