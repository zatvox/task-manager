-- ============================================================================
-- MIGRACIÓN 009 — fecha_cierre opcional para tareas cronológicas
-- Las tareas cronológicas se repiten por frecuencia; no tiene un cierre fijo.
-- Las tareas puntuales SÍ requieren fecha_cierre.
-- ============================================================================

-- ── 1. Liberar fecha_cierre en cronológicas (limpiar backfill de migración 008)
UPDATE tareas
SET fecha_cierre = NULL
WHERE es_cronologica = true;

-- ── 2. Agregar CHECK: puntuales deben tener fecha_cierre
--       (cronológicas pueden tener NULL o un valor si el usuario lo desea)
ALTER TABLE tareas
  ADD CONSTRAINT check_fecha_cierre_puntual
  CHECK (es_cronologica = true OR fecha_cierre IS NOT NULL);

-- ── Verificación
SELECT
  'tareas puntuales sin fecha_cierre' AS check_name,
  COUNT(*) AS total
FROM tareas
WHERE es_cronologica = false AND fecha_cierre IS NULL
UNION ALL
SELECT
  'tareas cronologicas con fecha_cierre (informativo)',
  COUNT(*)
FROM tareas
WHERE es_cronologica = true AND fecha_cierre IS NOT NULL;
-- Primera fila debe ser 0; segunda es informativa (idealmente 0 tras esta migración)
