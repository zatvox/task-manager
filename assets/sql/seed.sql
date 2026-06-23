-- ============================================================================
-- ZV TASK MANAGER · SEED DE DATOS DEMO
-- Solo para entorno de pruebas. NO ejecutar en producción.
-- ⚠️ Requiere que existan usuarios reales en auth.users (créalos primero
--    desde Supabase Auth o con el formulario de registro del sistema),
--    luego reemplaza los UUID de ejemplo (00000000-...) por los reales.
-- ============================================================================

-- 1) Sustituye estos UUIDs por los id de auth.users que vayas a usar como demo.
--    Ejemplo de cómo obtenerlos: select id, email from auth.users;

-- Empresa demo
insert into empresas (id, nombre, logo_url, descripcion, creador_id)
values (
  '11111111-1111-1111-1111-111111111111',
  'Jhiro Perú S.A.C.',
  'assets/images/logo.png',
  'Empresa demo para pruebas del sistema ZV Task Manager',
  null -- reemplaza por un agente_id real una vez tengas usuarios
)
on conflict (id) do nothing;

-- Departamentos demo
insert into departamentos (id, empresa_id, nombre, descripcion)
values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Operaciones', 'Gestión de procesos diarios'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Desarrollo', 'Equipo de tecnología y sistemas'),
  ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', 'Administración', 'Finanzas y recursos humanos')
on conflict (id) do nothing;

-- Proyectos demo
insert into proyectos (id, empresa_id, departamento_id, nombre, descripcion, fecha_inicio, estado, color_etiqueta)
values
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Lanzamiento ZV Task Manager', 'Implementación del sistema de gestión de tareas', now(), 'activo', '#00d4ff'),
  ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', 'Auditoría Operativa Q3', 'Revisión de procesos del tercer trimestre', now(), 'activo', '#ffaa00')
on conflict (id) do nothing;

-- Tareas puntuales demo
insert into tareas (id, proyecto_id, empresa_id, titulo, descripcion, estado, prioridad, fecha_inicio, fecha_cierre, es_cronologica)
values
  ('44444444-4444-4444-4444-444444444441', '33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Diseñar esquema de base de datos', 'Modelar tablas multiempresa con RLS', 'completado', 'alta', now() - interval '5 days', now() - interval '1 days', false),
  ('44444444-4444-4444-4444-444444444442', '33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Construir módulo de calendario', 'Vista mensual/semanal/diaria con drag & drop', 'en_progreso', 'critica', now() - interval '2 days', now() + interval '3 days', false),
  ('44444444-4444-4444-4444-444444444443', '33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Pruebas de RLS multiempresa', 'Validar políticas con distintos roles', 'nuevo', 'normal', now(), now() + interval '7 days', false),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'Revisión de gastos operativos', 'Auditoría de gastos del trimestre', 'en_revision', 'alta', now() - interval '1 days', now() + interval '1 days', false)
on conflict (id) do nothing;

-- Tarea cronológica demo (recordatorio diario)
insert into tareas (id, proyecto_id, empresa_id, titulo, descripcion, estado, prioridad, fecha_inicio, es_cronologica, frecuencia)
values (
  '44444444-4444-4444-4444-444444444445', '33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111',
  'Reporte diario de avance', 'Actualizar estado de tareas del día', 'nuevo', 'normal', now(), true, 'diaria'
)
on conflict (id) do nothing;

-- ============================================================================
-- NOTA: Para vincular agentes reales, ejecuta después de crear usuarios:
--
-- insert into agentes_empresas (agente_id, empresa_id, rol)
-- values ('<uuid-del-usuario>', '11111111-1111-1111-1111-111111111111', 'admin');
--
-- insert into agentes_departamentos (agente_id, departamento_id)
-- values ('<uuid-del-usuario>', '22222222-2222-2222-2222-222222222222');
--
-- insert into miembros_proyectos (proyecto_id, agente_id, rol)
-- values ('33333333-3333-3333-3333-333333333331', '<uuid-del-usuario>', 'owner');
--
-- insert into agentes_tareas (tarea_id, agente_id)
-- values ('44444444-4444-4444-4444-444444444442', '<uuid-del-usuario>');
-- ============================================================================
