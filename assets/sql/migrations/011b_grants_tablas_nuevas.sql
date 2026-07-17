-- ══════════════════════════════════════════════════════════════
-- MIGRACIÓN 011b: GRANTs para tablas nuevas
-- Supabase requiere GRANT explícito además de RLS policies
-- Ejecutar si hay errores "permission denied" en mobile
-- ══════════════════════════════════════════════════════════════

-- ── comentarios_tarea (migración 010) ────────────────────────
GRANT SELECT, INSERT, DELETE ON TABLE public.comentarios_tarea TO authenticated;
GRANT SELECT ON TABLE public.comentarios_tarea TO anon;

-- ── agente_configuraciones (migración 011) ───────────────────
GRANT SELECT, INSERT, UPDATE ON TABLE public.agente_configuraciones TO authenticated;

-- ── Verificación: lista las policies activas en ambas tablas ─
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('comentarios_tarea', 'agente_configuraciones')
ORDER BY tablename, cmd;
