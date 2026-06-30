-- ============================================================================
-- MIGRACIÓN 006 — Frecuencia quincenal para recordatorios
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================================

-- 1. Agregar 'quincenal' al ENUM (idempotente en PG14+)
ALTER TYPE frecuencia_recordatorio ADD VALUE IF NOT EXISTS 'quincenal';

-- 2. Comentario: la generación de instancias quincenales se maneja en el
--    frontend (supabase-data.js → generarInstanciasQuincenal) insertando
--    directamente en instancias_recordatorios para los próximos 90 días.
--    Los días del mes se almacenan en el campo dias_semana[] del recordatorio
--    (ej. ['15','30']). Esto evita modificar generar_instancias_recordatorio.

-- 3. (Opcional) Si quieres soporte nativo en la función RPC, actualiza
--    generar_instancias_recordatorio agregando el CASE 'quincenal' que lea
--    dias_semana[1]::int y dias_semana[2]::int como los dos días del mes.
