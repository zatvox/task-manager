-- ============================================================================
-- ZV TASK MANAGER · GRANTS
-- Permisos para el rol "authenticated" de Supabase sobre todas las tablas.
-- Ejecutar en el SQL Editor de Supabase si aparece "permission denied for table X".
-- Supabase no otorga GRANTs automáticamente cuando las tablas se crean via SQL.
-- ============================================================================

-- Uso del schema público
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Permiso completo sobre todas las tablas del sistema
GRANT SELECT, INSERT, UPDATE, DELETE ON
  agentes,
  empresas,
  agentes_empresas,
  departamentos,
  agentes_departamentos,
  proyectos,
  miembros_proyectos,
  departamentos_proyectos,
  tareas,
  agentes_tareas,
  comentarios_tareas,
  historial_tareas,
  recordatorios_cronologicos,
  instancias_recordatorios,
  notificaciones
TO authenticated;

-- Vistas (solo lectura)
GRANT SELECT ON vista_progreso_proyectos, vista_carga_trabajo TO authenticated;

-- Funciones auxiliares de RLS y generación de instancias
GRANT EXECUTE ON FUNCTION
  es_admin_empresa(uuid),
  es_manager_o_admin_empresa(uuid),
  es_miembro_empresa(uuid),
  es_miembro_proyecto(uuid),
  generar_instancias_recordatorio(uuid, integer)
TO authenticated;

-- Acceso a secuencias (necesario para INSERT con default gen_random_uuid en algunos setups)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
