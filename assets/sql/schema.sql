-- ============================================================================
-- ZV TASK MANAGER · SCHEMA SQL
-- Sistema Gestor de Pendientes y Actividades · Estructura Multiempresa
-- Motor: PostgreSQL (Supabase)
-- ============================================================================
-- Orden de ejecución: este archivo crea tipos, tablas, índices y triggers.
-- Ejecutar después: rls-policies.sql
-- Ejecutar opcionalmente para pruebas: seed.sql
-- ============================================================================

-- Extensiones necesarias
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ============================================================================
-- 1. TIPOS ENUMERADOS
-- ============================================================================

create type estado_agente as enum ('activo', 'inactivo', 'suspendido');
create type rol_empresa as enum ('admin', 'manager', 'empleado');
create type estado_membresia as enum ('activo', 'inactivo');
create type estado_proyecto as enum ('activo', 'pausado', 'completado', 'archivado');
create type rol_proyecto as enum ('owner', 'manager', 'miembro');
create type estado_tarea as enum ('nuevo', 'en_progreso', 'en_revision', 'completado', 'archivado');
create type prioridad_tarea as enum ('baja', 'normal', 'alta', 'critica');
create type frecuencia_recordatorio as enum ('diaria', 'semanal', 'mensual');
create type estado_agente_tarea as enum ('pendiente', 'en_progreso', 'completado', 'rechazada');
create type estado_recordatorio as enum ('activo', 'pausado', 'inactivo');
create type estado_instancia as enum ('pendiente', 'completado', 'omitido');
create type tipo_notificacion as enum (
  'tarea_asignada', 'tarea_comentada', 'vencimiento', 'completada',
  'recordatorio_hoy', 'mencion', 'invitacion_empresa', 'cambio_estado'
);

-- ============================================================================
-- 2. FUNCIÓN GENÉRICA: updated_at automático
-- ============================================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- 3. MÓDULO: AGENTES (extiende auth.users de Supabase)
-- ============================================================================

create table agentes (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  nombre text not null,
  telefono text,
  foto_url text,
  estado estado_agente not null default 'activo',
  tema text not null default 'dark', -- 'dark' | 'light'
  preferencias_notificaciones jsonb not null default '{"email": true, "push": true, "toast": true}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_agentes_updated_at before update on agentes
  for each row execute function set_updated_at();

create index idx_agentes_email on agentes(email);
create index idx_agentes_estado on agentes(estado);

-- Crea automáticamente el registro de "agentes" cuando se registra un usuario en auth.users
create or replace function handle_new_auth_user()
returns trigger as $$
begin
  insert into public.agentes (id, email, nombre)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ============================================================================
-- 4. MÓDULO: EMPRESAS
-- ============================================================================

create table empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  logo_url text,
  descripcion text,
  creador_id uuid references agentes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_empresas_updated_at before update on empresas
  for each row execute function set_updated_at();

create table agentes_empresas (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references agentes(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  rol rol_empresa not null default 'empleado',
  estado estado_membresia not null default 'activo',
  fecha_ingreso timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (agente_id, empresa_id)
);

create index idx_agentes_empresas_agente on agentes_empresas(agente_id);
create index idx_agentes_empresas_empresa on agentes_empresas(empresa_id);

-- ============================================================================
-- 5. MÓDULO: DEPARTAMENTOS
-- ============================================================================

create table departamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre text not null,
  descripcion text,
  manager_id uuid references agentes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_departamentos_updated_at before update on departamentos
  for each row execute function set_updated_at();

create table agentes_departamentos (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references agentes(id) on delete cascade,
  departamento_id uuid not null references departamentos(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (agente_id, departamento_id)
);

create index idx_agentes_departamentos_agente on agentes_departamentos(agente_id);
create index idx_agentes_departamentos_depto on agentes_departamentos(departamento_id);
create index idx_departamentos_empresa on departamentos(empresa_id);

-- ============================================================================
-- 6. MÓDULO: PROYECTOS
-- ============================================================================

create table proyectos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  departamento_id uuid references departamentos(id) on delete set null,
  nombre text not null,
  descripcion text,
  creador_id uuid references agentes(id) on delete set null,
  fecha_inicio timestamptz not null default now(),
  fecha_finalizacion timestamptz,
  estado estado_proyecto not null default 'activo',
  color_etiqueta text not null default '#00d4ff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_proyectos_updated_at before update on proyectos
  for each row execute function set_updated_at();

create table miembros_proyectos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  agente_id uuid not null references agentes(id) on delete cascade,
  rol rol_proyecto not null default 'miembro',
  added_at timestamptz not null default now(),
  unique (proyecto_id, agente_id)
);

create table departamentos_proyectos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  departamento_id uuid not null references departamentos(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (proyecto_id, departamento_id)
);

create index idx_proyectos_empresa on proyectos(empresa_id);
create index idx_proyectos_departamento on proyectos(departamento_id);
create index idx_miembros_proyectos_proyecto on miembros_proyectos(proyecto_id);
create index idx_miembros_proyectos_agente on miembros_proyectos(agente_id);

-- ============================================================================
-- 7. MÓDULO: TAREAS & RECORDATORIOS
-- ============================================================================

create table tareas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid references proyectos(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  creador_id uuid references agentes(id) on delete set null,
  titulo text not null,
  descripcion text,
  estado estado_tarea not null default 'nuevo',
  prioridad prioridad_tarea not null default 'normal',
  etiquetas text[] not null default '{}',
  fecha_inicio timestamptz not null default now(),
  fecha_cierre timestamptz,
  fecha_completado timestamptz,
  completado_por uuid references agentes(id) on delete set null,
  es_cronologica boolean not null default false,
  frecuencia frecuencia_recordatorio,
  dias_semana text[],
  dia_mes integer check (dia_mes is null or (dia_mes >= 1 and dia_mes <= 31)),
  tiempo_estimado_horas integer,
  tiempo_real_horas numeric(8,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_cronologica_frecuencia check (
    (es_cronologica = false) or (es_cronologica = true and frecuencia is not null)
  )
);

create trigger trg_tareas_updated_at before update on tareas
  for each row execute function set_updated_at();

create table agentes_tareas (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references tareas(id) on delete cascade,
  agente_id uuid not null references agentes(id) on delete cascade,
  estado_agente estado_agente_tarea not null default 'pendiente',
  added_at timestamptz not null default now(),
  unique (tarea_id, agente_id)
);

create table comentarios_tareas (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references tareas(id) on delete cascade,
  agente_id uuid not null references agentes(id) on delete cascade,
  texto text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_comentarios_tareas_updated_at before update on comentarios_tareas
  for each row execute function set_updated_at();

create table historial_tareas (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references tareas(id) on delete cascade,
  agente_id uuid references agentes(id) on delete set null,
  campo_modificado text not null,
  valor_antiguo text,
  valor_nuevo text,
  created_at timestamptz not null default now()
);

create index idx_tareas_empresa_estado_fecha on tareas(empresa_id, estado, fecha_cierre);
create index idx_tareas_proyecto on tareas(proyecto_id);
create index idx_tareas_titulo_trgm on tareas using gin (titulo gin_trgm_ops);
create index idx_agentes_tareas_agente_estado on agentes_tareas(agente_id, estado_agente);
create index idx_agentes_tareas_tarea on agentes_tareas(tarea_id);
create index idx_comentarios_tareas_tarea on comentarios_tareas(tarea_id);
create index idx_historial_tareas_tarea_fecha on historial_tareas(tarea_id, created_at);

-- Auditoría automática de cambios relevantes en tareas
create or replace function registrar_historial_tarea()
returns trigger as $$
begin
  if old.estado is distinct from new.estado then
    insert into historial_tareas (tarea_id, agente_id, campo_modificado, valor_antiguo, valor_nuevo)
    values (new.id, new.completado_por, 'estado', old.estado::text, new.estado::text);
  end if;
  if old.prioridad is distinct from new.prioridad then
    insert into historial_tareas (tarea_id, campo_modificado, valor_antiguo, valor_nuevo)
    values (new.id, 'prioridad', old.prioridad::text, new.prioridad::text);
  end if;
  if old.fecha_cierre is distinct from new.fecha_cierre then
    insert into historial_tareas (tarea_id, campo_modificado, valor_antiguo, valor_nuevo)
    values (new.id, 'fecha_cierre', old.fecha_cierre::text, new.fecha_cierre::text);
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_tareas_historial
  after update on tareas
  for each row execute function registrar_historial_tarea();

-- Completar tarea => set fecha_completado automáticamente
create or replace function marcar_fecha_completado()
returns trigger as $$
begin
  if new.estado = 'completado' and old.estado is distinct from 'completado' then
    new.fecha_completado = now();
  elsif new.estado is distinct from 'completado' then
    new.fecha_completado = null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_tareas_fecha_completado
  before update on tareas
  for each row execute function marcar_fecha_completado();

-- ============================================================================
-- 8. MÓDULO: RECORDATORIOS CRONOLÓGICOS
-- ============================================================================

create table recordatorios_cronologicos (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references agentes(id) on delete cascade,
  empresa_id uuid references empresas(id) on delete cascade,
  proyecto_id uuid references proyectos(id) on delete set null,
  tarea_id uuid references tareas(id) on delete cascade,
  titulo text not null,
  descripcion text,
  frecuencia frecuencia_recordatorio not null,
  dias_semana text[],
  dia_mes integer check (dia_mes is null or (dia_mes >= 1 and dia_mes <= 31)),
  hora_recordatorio time,
  estado estado_recordatorio not null default 'activo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_recordatorios_updated_at before update on recordatorios_cronologicos
  for each row execute function set_updated_at();

create table instancias_recordatorios (
  id uuid primary key default gen_random_uuid(),
  recordatorio_id uuid not null references recordatorios_cronologicos(id) on delete cascade,
  fecha_programada timestamptz not null,
  estado estado_instancia not null default 'pendiente',
  completado_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_instancias_updated_at before update on instancias_recordatorios
  for each row execute function set_updated_at();

create index idx_instancias_fecha_estado on instancias_recordatorios(fecha_programada, estado);
create index idx_instancias_recordatorio on instancias_recordatorios(recordatorio_id);
create index idx_recordatorios_agente on recordatorios_cronologicos(agente_id);

-- Generador de instancias para los próximos N días (se invoca por cron o manualmente)
create or replace function generar_instancias_recordatorio(p_recordatorio_id uuid, p_dias integer default 90)
returns integer as $$
declare
  r record;
  d date;
  fin date;
  contador integer := 0;
  nombre_dia text;
  dias_es text[] := array['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
begin
  select * into r from recordatorios_cronologicos where id = p_recordatorio_id;
  if r.id is null or r.estado <> 'activo' then
    return 0;
  end if;

  d := current_date;
  fin := current_date + p_dias;

  while d <= fin loop
    if r.frecuencia = 'diaria' then
      insert into instancias_recordatorios (recordatorio_id, fecha_programada)
      values (p_recordatorio_id, d + coalesce(r.hora_recordatorio, '09:00'::time))
      on conflict do nothing;
      contador := contador + 1;
    elsif r.frecuencia = 'semanal' then
      nombre_dia := dias_es[extract(dow from d)::int + 1];
      if r.dias_semana is not null and nombre_dia = any(r.dias_semana) then
        insert into instancias_recordatorios (recordatorio_id, fecha_programada)
        values (p_recordatorio_id, d + coalesce(r.hora_recordatorio, '09:00'::time))
        on conflict do nothing;
        contador := contador + 1;
      end if;
    elsif r.frecuencia = 'mensual' then
      if r.dia_mes is not null and extract(day from d)::int = r.dia_mes then
        insert into instancias_recordatorios (recordatorio_id, fecha_programada)
        values (p_recordatorio_id, d + coalesce(r.hora_recordatorio, '09:00'::time))
        on conflict do nothing;
        contador := contador + 1;
      end if;
    end if;
    d := d + 1;
  end loop;

  return contador;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- 9. MÓDULO: NOTIFICACIONES
-- ============================================================================

create table notificaciones (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid not null references agentes(id) on delete cascade,
  tipo tipo_notificacion not null,
  titulo text not null,
  mensaje text not null,
  tarea_id uuid references tareas(id) on delete set null,
  recordatorio_id uuid references recordatorios_cronologicos(id) on delete set null,
  empresa_id uuid references empresas(id) on delete set null,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notificaciones_agente_leida on notificaciones(agente_id, leida);
create index idx_notificaciones_agente_fecha on notificaciones(agente_id, created_at desc);

-- Notifica automáticamente a los agentes asignados cuando se crea agentes_tareas
create or replace function notificar_tarea_asignada()
returns trigger as $$
declare
  v_titulo text;
begin
  select titulo into v_titulo from tareas where id = new.tarea_id;
  insert into notificaciones (agente_id, tipo, titulo, mensaje, tarea_id)
  values (new.agente_id, 'tarea_asignada', 'Nueva tarea asignada', 'Se te asignó la tarea: ' || coalesce(v_titulo, ''), new.tarea_id);
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_notificar_tarea_asignada
  after insert on agentes_tareas
  for each row execute function notificar_tarea_asignada();

-- Notifica a los asignados cuando se comenta una tarea
create or replace function notificar_comentario_tarea()
returns trigger as $$
declare
  v_titulo text;
  v_agente record;
begin
  select titulo into v_titulo from tareas where id = new.tarea_id;
  for v_agente in
    select distinct agente_id from agentes_tareas where tarea_id = new.tarea_id and agente_id <> new.agente_id
  loop
    insert into notificaciones (agente_id, tipo, titulo, mensaje, tarea_id)
    values (v_agente.agente_id, 'tarea_comentada', 'Nuevo comentario', 'Comentario nuevo en: ' || coalesce(v_titulo, ''), new.tarea_id);
  end loop;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_notificar_comentario_tarea
  after insert on comentarios_tareas
  for each row execute function notificar_comentario_tarea();

-- Notifica cuando una tarea cambia a completado
create or replace function notificar_tarea_completada()
returns trigger as $$
declare
  v_agente record;
begin
  if new.estado = 'completado' and old.estado is distinct from 'completado' then
    for v_agente in
      select distinct agente_id from agentes_tareas where tarea_id = new.id
    loop
      insert into notificaciones (agente_id, tipo, titulo, mensaje, tarea_id)
      values (v_agente.agente_id, 'completada', 'Tarea completada', 'La tarea "' || new.titulo || '" fue marcada como completada', new.id);
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_notificar_tarea_completada
  after update on tareas
  for each row execute function notificar_tarea_completada();

-- ============================================================================
-- 10. VISTA: progreso de proyectos (% tareas completadas)
-- ============================================================================

create or replace view vista_progreso_proyectos as
select
  p.id as proyecto_id,
  p.nombre,
  p.empresa_id,
  count(t.id) as total_tareas,
  count(t.id) filter (where t.estado = 'completado') as tareas_completadas,
  case when count(t.id) = 0 then 0
       else round((count(t.id) filter (where t.estado = 'completado')::numeric / count(t.id)) * 100, 1)
  end as porcentaje_progreso
from proyectos p
left join tareas t on t.proyecto_id = p.id
group by p.id, p.nombre, p.empresa_id;

-- ============================================================================
-- 11. VISTA: carga de trabajo por agente
-- ============================================================================

create or replace view vista_carga_trabajo as
select
  at.agente_id,
  t.empresa_id,
  count(*) as total_asignadas,
  count(*) filter (where at.estado_agente = 'pendiente') as pendientes,
  count(*) filter (where at.estado_agente = 'en_progreso') as en_progreso,
  count(*) filter (where at.estado_agente = 'completado') as completadas,
  count(*) filter (where t.fecha_cierre < now() and t.estado <> 'completado') as vencidas
from agentes_tareas at
join tareas t on t.id = at.tarea_id
group by at.agente_id, t.empresa_id;

