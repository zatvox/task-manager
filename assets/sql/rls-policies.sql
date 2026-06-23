-- ============================================================================
-- ZV TASK MANAGER · RLS POLICIES
-- Row-Level Security para estructura multiempresa
-- Ejecutar después de schema.sql
-- ============================================================================

-- ============================================================================
-- FUNCIONES AUXILIARES (security definer, evitan recursión de RLS)
-- ============================================================================

create or replace function es_admin_empresa(p_empresa_id uuid)
returns boolean as $$
  select exists (
    select 1 from agentes_empresas
    where agente_id = auth.uid() and empresa_id = p_empresa_id and rol = 'admin' and estado = 'activo'
  );
$$ language sql security definer stable;

create or replace function es_manager_o_admin_empresa(p_empresa_id uuid)
returns boolean as $$
  select exists (
    select 1 from agentes_empresas
    where agente_id = auth.uid() and empresa_id = p_empresa_id and rol in ('admin','manager') and estado = 'activo'
  );
$$ language sql security definer stable;

create or replace function es_miembro_empresa(p_empresa_id uuid)
returns boolean as $$
  select exists (
    select 1 from agentes_empresas
    where agente_id = auth.uid() and empresa_id = p_empresa_id and estado = 'activo'
  );
$$ language sql security definer stable;

create or replace function es_miembro_proyecto(p_proyecto_id uuid)
returns boolean as $$
  select exists (
    select 1 from miembros_proyectos where agente_id = auth.uid() and proyecto_id = p_proyecto_id
  ) or exists (
    select 1 from departamentos_proyectos dp
    join agentes_departamentos ad on ad.departamento_id = dp.departamento_id
    where dp.proyecto_id = p_proyecto_id and ad.agente_id = auth.uid()
  );
$$ language sql security definer stable;

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

alter table agentes enable row level security;
alter table empresas enable row level security;
alter table agentes_empresas enable row level security;
alter table departamentos enable row level security;
alter table agentes_departamentos enable row level security;
alter table proyectos enable row level security;
alter table miembros_proyectos enable row level security;
alter table departamentos_proyectos enable row level security;
alter table tareas enable row level security;
alter table agentes_tareas enable row level security;
alter table comentarios_tareas enable row level security;
alter table historial_tareas enable row level security;
alter table recordatorios_cronologicos enable row level security;
alter table instancias_recordatorios enable row level security;
alter table notificaciones enable row level security;

-- ============================================================================
-- AGENTES
-- ============================================================================

create policy "agentes_ven_su_perfil_y_companeros" on agentes
  for select using (
    id = auth.uid()
    or exists (
      select 1 from agentes_empresas ae1
      join agentes_empresas ae2 on ae1.empresa_id = ae2.empresa_id
      where ae1.agente_id = auth.uid() and ae2.agente_id = agentes.id
    )
  );

create policy "agentes_editan_su_perfil" on agentes
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "agentes_insertan_su_perfil" on agentes
  for insert with check (id = auth.uid());

-- ============================================================================
-- EMPRESAS
-- ============================================================================

create policy "empresas_visibles_para_miembros" on empresas
  for select using (es_miembro_empresa(id));

create policy "empresas_cualquiera_autenticado_crea" on empresas
  for insert with check (auth.uid() is not null and creador_id = auth.uid());

create policy "empresas_admin_edita" on empresas
  for update using (es_admin_empresa(id)) with check (es_admin_empresa(id));

create policy "empresas_admin_elimina" on empresas
  for delete using (es_admin_empresa(id));

-- ============================================================================
-- AGENTES_EMPRESAS (membresías)
-- ============================================================================

create policy "membresias_visibles_para_miembros_empresa" on agentes_empresas
  for select using (es_miembro_empresa(empresa_id) or agente_id = auth.uid());

create policy "membresias_admin_invita" on agentes_empresas
  for insert with check (
    es_admin_empresa(empresa_id)
    or not exists (select 1 from agentes_empresas where empresa_id = agentes_empresas.empresa_id)
  );

create policy "membresias_admin_edita" on agentes_empresas
  for update using (es_admin_empresa(empresa_id)) with check (es_admin_empresa(empresa_id));

create policy "membresias_admin_elimina" on agentes_empresas
  for delete using (es_admin_empresa(empresa_id) or agente_id = auth.uid());

-- ============================================================================
-- DEPARTAMENTOS
-- ============================================================================

create policy "departamentos_visibles_miembros_empresa" on departamentos
  for select using (es_miembro_empresa(empresa_id));

create policy "departamentos_admin_manager_crea" on departamentos
  for insert with check (es_manager_o_admin_empresa(empresa_id));

create policy "departamentos_admin_manager_edita" on departamentos
  for update using (es_manager_o_admin_empresa(empresa_id)) with check (es_manager_o_admin_empresa(empresa_id));

create policy "departamentos_admin_elimina" on departamentos
  for delete using (es_admin_empresa(empresa_id));

-- ============================================================================
-- AGENTES_DEPARTAMENTOS
-- ============================================================================

create policy "agentes_departamentos_visibles_miembros" on agentes_departamentos
  for select using (
    exists (select 1 from departamentos d where d.id = departamento_id and es_miembro_empresa(d.empresa_id))
  );

create policy "agentes_departamentos_admin_manager_gestiona" on agentes_departamentos
  for insert with check (
    exists (select 1 from departamentos d where d.id = departamento_id and es_manager_o_admin_empresa(d.empresa_id))
  );

create policy "agentes_departamentos_admin_manager_elimina" on agentes_departamentos
  for delete using (
    exists (select 1 from departamentos d where d.id = departamento_id and es_manager_o_admin_empresa(d.empresa_id))
  );

-- ============================================================================
-- PROYECTOS
-- ============================================================================

create policy "proyectos_visibles_miembros_empresa" on proyectos
  for select using (es_miembro_empresa(empresa_id));

create policy "proyectos_miembros_empresa_crea" on proyectos
  for insert with check (es_miembro_empresa(empresa_id) and creador_id = auth.uid());

create policy "proyectos_creador_manager_admin_edita" on proyectos
  for update using (
    creador_id = auth.uid() or es_manager_o_admin_empresa(empresa_id) or es_miembro_proyecto(id)
  ) with check (
    creador_id = auth.uid() or es_manager_o_admin_empresa(empresa_id) or es_miembro_proyecto(id)
  );

create policy "proyectos_creador_admin_elimina" on proyectos
  for delete using (creador_id = auth.uid() or es_admin_empresa(empresa_id));

-- ============================================================================
-- MIEMBROS_PROYECTOS
-- ============================================================================

create policy "miembros_proyectos_visibles" on miembros_proyectos
  for select using (
    exists (select 1 from proyectos p where p.id = proyecto_id and es_miembro_empresa(p.empresa_id))
  );

create policy "miembros_proyectos_gestion" on miembros_proyectos
  for insert with check (
    exists (
      select 1 from proyectos p where p.id = proyecto_id
      and (p.creador_id = auth.uid() or es_manager_o_admin_empresa(p.empresa_id))
    )
  );

create policy "miembros_proyectos_elimina" on miembros_proyectos
  for delete using (
    agente_id = auth.uid()
    or exists (
      select 1 from proyectos p where p.id = proyecto_id
      and (p.creador_id = auth.uid() or es_manager_o_admin_empresa(p.empresa_id))
    )
  );

-- ============================================================================
-- DEPARTAMENTOS_PROYECTOS
-- ============================================================================

create policy "departamentos_proyectos_visibles" on departamentos_proyectos
  for select using (
    exists (select 1 from proyectos p where p.id = proyecto_id and es_miembro_empresa(p.empresa_id))
  );

create policy "departamentos_proyectos_gestion" on departamentos_proyectos
  for insert with check (
    exists (
      select 1 from proyectos p where p.id = proyecto_id and es_manager_o_admin_empresa(p.empresa_id)
    )
  );

create policy "departamentos_proyectos_elimina" on departamentos_proyectos
  for delete using (
    exists (
      select 1 from proyectos p where p.id = proyecto_id and es_manager_o_admin_empresa(p.empresa_id)
    )
  );

-- ============================================================================
-- TAREAS
-- ============================================================================

create policy "tareas_visibles_miembros_empresa" on tareas
  for select using (es_miembro_empresa(empresa_id));

create policy "tareas_miembros_empresa_crea" on tareas
  for insert with check (es_miembro_empresa(empresa_id) and creador_id = auth.uid());

create policy "tareas_creador_asignado_manager_edita" on tareas
  for update using (
    creador_id = auth.uid()
    or es_manager_o_admin_empresa(empresa_id)
    or exists (select 1 from agentes_tareas at where at.tarea_id = tareas.id and at.agente_id = auth.uid())
  ) with check (
    creador_id = auth.uid()
    or es_manager_o_admin_empresa(empresa_id)
    or exists (select 1 from agentes_tareas at where at.tarea_id = tareas.id and at.agente_id = auth.uid())
  );

create policy "tareas_creador_admin_elimina" on tareas
  for delete using (creador_id = auth.uid() or es_admin_empresa(empresa_id));

-- ============================================================================
-- AGENTES_TAREAS
-- ============================================================================

create policy "agentes_tareas_visibles_miembros_empresa" on agentes_tareas
  for select using (
    exists (select 1 from tareas t where t.id = tarea_id and es_miembro_empresa(t.empresa_id))
  );

create policy "agentes_tareas_creador_manager_asigna" on agentes_tareas
  for insert with check (
    exists (
      select 1 from tareas t where t.id = tarea_id
      and (t.creador_id = auth.uid() or es_manager_o_admin_empresa(t.empresa_id))
    )
  );

create policy "agentes_tareas_propio_estado_edita" on agentes_tareas
  for update using (
    agente_id = auth.uid()
    or exists (select 1 from tareas t where t.id = tarea_id and (t.creador_id = auth.uid() or es_manager_o_admin_empresa(t.empresa_id)))
  ) with check (
    agente_id = auth.uid()
    or exists (select 1 from tareas t where t.id = tarea_id and (t.creador_id = auth.uid() or es_manager_o_admin_empresa(t.empresa_id)))
  );

create policy "agentes_tareas_creador_manager_elimina" on agentes_tareas
  for delete using (
    exists (
      select 1 from tareas t where t.id = tarea_id
      and (t.creador_id = auth.uid() or es_manager_o_admin_empresa(t.empresa_id))
    )
  );

-- ============================================================================
-- COMENTARIOS_TAREAS
-- ============================================================================

create policy "comentarios_visibles_miembros_empresa" on comentarios_tareas
  for select using (
    exists (select 1 from tareas t where t.id = tarea_id and es_miembro_empresa(t.empresa_id))
  );

create policy "comentarios_asignados_crean" on comentarios_tareas
  for insert with check (
    agente_id = auth.uid() and
    exists (select 1 from tareas t where t.id = tarea_id and es_miembro_empresa(t.empresa_id))
  );

create policy "comentarios_autor_edita" on comentarios_tareas
  for update using (agente_id = auth.uid()) with check (agente_id = auth.uid());

create policy "comentarios_autor_elimina" on comentarios_tareas
  for delete using (agente_id = auth.uid());

-- ============================================================================
-- HISTORIAL_TAREAS (solo lectura para miembros, escritura solo vía triggers)
-- ============================================================================

create policy "historial_visible_miembros_empresa" on historial_tareas
  for select using (
    exists (select 1 from tareas t where t.id = tarea_id and es_miembro_empresa(t.empresa_id))
  );

create policy "historial_insercion_sistema" on historial_tareas
  for insert with check (true);

-- ============================================================================
-- RECORDATORIOS_CRONOLOGICOS
-- ============================================================================

create policy "recordatorios_propios" on recordatorios_cronologicos
  for select using (agente_id = auth.uid());

create policy "recordatorios_crea_propios" on recordatorios_cronologicos
  for insert with check (agente_id = auth.uid());

create policy "recordatorios_edita_propios" on recordatorios_cronologicos
  for update using (agente_id = auth.uid()) with check (agente_id = auth.uid());

create policy "recordatorios_elimina_propios" on recordatorios_cronologicos
  for delete using (agente_id = auth.uid());

-- ============================================================================
-- INSTANCIAS_RECORDATORIOS
-- ============================================================================

create policy "instancias_propias" on instancias_recordatorios
  for select using (
    exists (select 1 from recordatorios_cronologicos r where r.id = recordatorio_id and r.agente_id = auth.uid())
  );

create policy "instancias_sistema_inserta" on instancias_recordatorios
  for insert with check (
    exists (select 1 from recordatorios_cronologicos r where r.id = recordatorio_id and r.agente_id = auth.uid())
  );

create policy "instancias_propias_edita" on instancias_recordatorios
  for update using (
    exists (select 1 from recordatorios_cronologicos r where r.id = recordatorio_id and r.agente_id = auth.uid())
  ) with check (
    exists (select 1 from recordatorios_cronologicos r where r.id = recordatorio_id and r.agente_id = auth.uid())
  );

create policy "instancias_propias_elimina" on instancias_recordatorios
  for delete using (
    exists (select 1 from recordatorios_cronologicos r where r.id = recordatorio_id and r.agente_id = auth.uid())
  );

-- ============================================================================
-- NOTIFICACIONES
-- ============================================================================

create policy "notificaciones_propias" on notificaciones
  for select using (agente_id = auth.uid());

create policy "notificaciones_sistema_inserta" on notificaciones
  for insert with check (true);

create policy "notificaciones_propias_edita" on notificaciones
  for update using (agente_id = auth.uid()) with check (agente_id = auth.uid());

create policy "notificaciones_propias_elimina" on notificaciones
  for delete using (agente_id = auth.uid());

