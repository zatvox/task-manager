-- ============================================================================
-- MIGRACIÓN 008 — Fusión Tareas + Recordatorios
-- Ejecutar DESPUÉS de revisar el diagnóstico de conflictivos.
-- Pasos:
--   0. Eliminar duplicado "REPORTE DE LORENA" (el más reciente, confirmado por usuario)
--   1. mensajes_orientacion table
--   2. Backfill fecha_inicio / fecha_cierre en tareas
--   3. Crear recordatorio_cronologico para tareas cronológicas huérfanas
--   4. Copiar agentes tareas → agentes_recordatorios
--   5. Crear tarea espejo para recordatorios sin tarea_id
--   6. Borrar instancias pendientes → regenerar todas
--   7. ALTER tarea_id SET NOT NULL
-- ============================================================================

-- ── 0. Eliminar duplicado confirmado (REPORTE DE LORENA — el más reciente) ───
-- ID confirmado por diagnóstico: 253f0ab0-5c44-4526-9c6c-0ed13709f1e8
DELETE FROM agentes_recordatorios    WHERE recordatorio_id = '253f0ab0-5c44-4526-9c6c-0ed13709f1e8';
DELETE FROM instancias_recordatorios WHERE recordatorio_id = '253f0ab0-5c44-4526-9c6c-0ed13709f1e8';
DELETE FROM recordatorios_cronologicos WHERE id            = '253f0ab0-5c44-4526-9c6c-0ed13709f1e8';

-- ── 1. Tabla mensajes_orientacion ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mensajes_orientacion (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo     text        NOT NULL,   -- 'tareas','recordatorios','calendario'
  campo      text        NOT NULL,   -- 'fecha_cierre','fecha_inicio','frecuencia'
  plataforma text        DEFAULT 'ambos', -- 'web','mobile','ambos'
  mensaje    text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE mensajes_orientacion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orientacion_read" ON mensajes_orientacion;
CREATE POLICY "orientacion_read" ON mensajes_orientacion
  FOR SELECT USING (true);

GRANT SELECT ON mensajes_orientacion TO authenticated;

INSERT INTO mensajes_orientacion (modulo, campo, plataforma, mensaje) VALUES
  ('tareas','fecha_cierre','ambos',
   'Fecha en que la tarea debe estar completada. Aparece en el calendario como evento del día. Campo requerido.'),
  ('tareas','fecha_inicio','ambos',
   'Calculada automáticamente según la frecuencia. Para frecuencia Única o Anual, tú la eliges. Para las demás se calcula a partir de hoy.'),
  ('tareas','frecuencia','ambos',
   'Única: ocurre una sola vez. Diaria: cada día. Semanal: los días que elijas. Quincenal: dos días fijos al mes. Mensual: un día fijo al mes. Anual: el mismo día cada año.'),
  ('tareas','es_cronologica','ambos',
   'Una tarea cronológica se repite según la frecuencia elegida y genera instancias automáticas en el calendario.')
ON CONFLICT DO NOTHING;

-- ── 2. Backfill tareas.fecha_inicio (usar created_at cuando NULL) ─────────────
UPDATE tareas
SET fecha_inicio = created_at::date
WHERE fecha_inicio IS NULL;

-- ── 3. Backfill tareas.fecha_cierre (usar fecha_inicio + margen cuando NULL) ──
UPDATE tareas
SET fecha_cierre = CASE
    WHEN es_cronologica THEN fecha_inicio + interval '90 days'
    ELSE fecha_inicio + interval '7 days'
  END
WHERE fecha_cierre IS NULL;

-- ── 4. Crear recordatorio_cronologico para tareas cronológicas sin recordatorio
INSERT INTO recordatorios_cronologicos (
  tarea_id, titulo, descripcion,
  empresa_id, proyecto_id,
  frecuencia, dias_semana, dia_mes, dia_mes_2, fecha_inicio,
  agente_id, estado, created_at
)
SELECT
  t.id,
  t.titulo,
  t.descripcion,
  t.empresa_id,
  t.proyecto_id,
  -- cast text → enum (los valores coinciden)
  t.frecuencia::frecuencia_recordatorio,
  t.dias_semana,
  t.dia_mes,
  t.dia_mes_2,
  t.fecha_inicio,
  t.creador_id,
  'activo',
  t.created_at
FROM tareas t
WHERE t.es_cronologica = true
  AND NOT EXISTS (
    SELECT 1 FROM recordatorios_cronologicos rc WHERE rc.tarea_id = t.id
  );

-- ── 5. Copiar agentes de tareas cronológicas → agentes_recordatorios ──────────
INSERT INTO agentes_recordatorios (recordatorio_id, agente_id)
SELECT rc.id, at2.agente_id
FROM recordatorios_cronologicos rc
JOIN agentes_tareas at2 ON at2.tarea_id = rc.tarea_id
WHERE NOT EXISTS (
  SELECT 1 FROM agentes_recordatorios ar
  WHERE ar.recordatorio_id = rc.id AND ar.agente_id = at2.agente_id
);

-- ── 6. Crear tarea espejo para cada recordatorio sin tarea_id ─────────────────
DO $$
DECLARE
  rec            RECORD;
  nueva_tarea_id uuid;
BEGIN
  FOR rec IN
    SELECT * FROM recordatorios_cronologicos WHERE tarea_id IS NULL
  LOOP
    -- Crear tarea espejo
    INSERT INTO tareas (
      titulo, descripcion,
      empresa_id, proyecto_id,
      es_cronologica, frecuencia,
      dias_semana, dia_mes, dia_mes_2, fecha_inicio,
      fecha_cierre, creador_id, estado, created_at
    ) VALUES (
      rec.titulo,
      rec.descripcion,
      rec.empresa_id,
      rec.proyecto_id,
      true,
      rec.frecuencia,
      rec.dias_semana,
      rec.dia_mes,
      rec.dia_mes_2,
      COALESCE(rec.fecha_inicio, rec.created_at::date),
      COALESCE(rec.created_at::date + interval '90 days', now()::date + interval '90 days'),
      rec.agente_id,
      -- Mapear estado recordatorio → estado tarea
      CASE rec.estado
        WHEN 'activo'   THEN 'en_progreso'::estado_tarea
        WHEN 'pausado'  THEN 'archivado'::estado_tarea
        WHEN 'inactivo' THEN 'archivado'::estado_tarea
        ELSE 'nuevo'::estado_tarea
      END,
      rec.created_at
    )
    RETURNING id INTO nueva_tarea_id;

    -- Vincular recordatorio a la nueva tarea
    UPDATE recordatorios_cronologicos
    SET tarea_id = nueva_tarea_id
    WHERE id = rec.id;

    -- Copiar agentes del recordatorio → agentes_tareas de la nueva tarea
    INSERT INTO agentes_tareas (tarea_id, agente_id)
    SELECT nueva_tarea_id, ar.agente_id
    FROM agentes_recordatorios ar
    WHERE ar.recordatorio_id = rec.id
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ── 7. Borrar instancias PENDIENTES (>= hoy, no completadas) → regenerar ──────
DELETE FROM instancias_recordatorios
WHERE fecha_programada >= CURRENT_DATE
  AND completado_en IS NULL;  -- columna real: completado_en (timestamp), no completada (bool)

-- Regenerar 90 días para todos los recordatorios activos
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id FROM recordatorios_cronologicos WHERE estado = 'activo'
  LOOP
    PERFORM generar_instancias_recordatorio(rec.id, 90);
  END LOOP;
END $$;

-- ── 8. Enforce tarea_id NOT NULL ahora que todos tienen uno ───────────────────
ALTER TABLE recordatorios_cronologicos
  ALTER COLUMN tarea_id SET NOT NULL;

-- ── Verificación final ────────────────────────────────────────────────────────
SELECT
  'recordatorios sin tarea_id' AS check_name,
  COUNT(*) AS total
FROM recordatorios_cronologicos
WHERE tarea_id IS NULL
UNION ALL
SELECT
  'tareas cronologicas sin recordatorio',
  COUNT(*)
FROM tareas t
WHERE t.es_cronologica = true
  AND NOT EXISTS (SELECT 1 FROM recordatorios_cronologicos rc WHERE rc.tarea_id = t.id)
UNION ALL
SELECT
  'tareas con fecha_inicio NULL',
  COUNT(*)
FROM tareas WHERE fecha_inicio IS NULL
UNION ALL
SELECT
  'tareas con fecha_cierre NULL',
  COUNT(*)
FROM tareas WHERE fecha_cierre IS NULL;
-- Todos deben ser 0
