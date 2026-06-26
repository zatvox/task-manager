/**
 * ============================================================================
 * ZV TASK MANAGER · DATA LAYER
 * Todas las queries y mutations a Supabase. Manejo de errores centralizado.
 * ============================================================================
 */
import { supabase } from './supabase-client.js';
import { CONFIG } from './config.js';

function manejarError(contexto, error) {
  if (error) {
    console.error(`[supabase-data] ${contexto}:`, error.message);
    throw new Error(error.message || `Error en ${contexto}`);
  }
}

/* ============================================================================
   EMPRESAS
   ============================================================================ */

export async function obtenerEmpresasDelAgente(agenteId) {
  const { data, error } = await supabase
    .from('agentes_empresas')
    .select('rol, estado, empresa:empresas(*)')
    .eq('agente_id', agenteId)
    .eq('estado', 'activo');
  if (error) {
    // No lanzar excepción: el usuario puede no pertenecer a ninguna empresa aún.
    // Si el error es 403, probablemente faltan GRANTs en Supabase → ejecutar 002_grants.sql
    console.error('[supabase-data] obtenerEmpresasDelAgente:', error.message, '(code:', error.code, ')');
    return [];
  }
  return data?.map((r) => ({ ...r.empresa, rol: r.rol })) ?? [];
}

// Lista TODAS las empresas con estado de membresía del agente actual.
// Requiere que la política RLS de SELECT en empresas sea pública para autenticados
// (migración 003_empresas_visibles.sql).
export async function listarTodasLasEmpresasConMembresia(agenteId) {
  const [{ data: empresas, error }, { data: membresias }] = await Promise.all([
    supabase.from('empresas').select('*').order('nombre'),
    supabase.from('agentes_empresas').select('empresa_id, rol, estado').eq('agente_id', agenteId)
  ]);
  if (error) {
    console.error('[supabase-data] listarTodasLasEmpresasConMembresia:', error.message);
    return [];
  }
  const memMap = Object.fromEntries((membresias ?? []).map((m) => [m.empresa_id, m]));
  return (empresas ?? []).map((e) => ({
    ...e,
    membresia: memMap[e.id] ?? null,
    esMiembro: !!(memMap[e.id]?.estado === 'activo'),
    rol: memMap[e.id]?.rol ?? null
  }));
}

export async function obtenerEmpresa(empresaId) {
  const { data, error } = await supabase.from('empresas').select('*').eq('id', empresaId).single();
  manejarError('obtenerEmpresa', error);
  return data;
}

export async function crearEmpresa({ nombre, descripcion, logo_url, creador_id }) {
  // Generamos el UUID en cliente para poder crear la membresía ANTES del SELECT.
  // Problema: INSERT + .select() ejecuta RETURNING *, que evalúa la política SELECT
  // (es_miembro_empresa) en ese instante — como aún no somos miembros, el RETURNING
  // queda bloqueado y Supabase reporta 403 RLS violation.
  const empresaId = crypto.randomUUID();

  // 1. Insertar sin SELECT (INSERT policy: creador_id = auth.uid() ✓)
  const { error: errEmp } = await supabase
    .from('empresas')
    .insert({ id: empresaId, nombre, descripcion, logo_url, creador_id });
  manejarError('crearEmpresa:insert', errEmp);

  // 2. Vincular creador como admin (policy: not exists → primera membresía, siempre pasa)
  const { error: errMem } = await supabase
    .from('agentes_empresas')
    .insert({ agente_id: creador_id, empresa_id: empresaId, rol: 'admin' });
  manejarError('crearEmpresa:membresia', errMem);

  // 3. Ahora sí somos miembros → SELECT policy pasa
  return await obtenerEmpresa(empresaId);
}

export async function actualizarEmpresa(id, cambios) {
  const { data, error } = await supabase.from('empresas').update(cambios).eq('id', id).select().single();
  manejarError('actualizarEmpresa', error);
  return data;
}

export async function eliminarEmpresa(id) {
  const { error } = await supabase.from('empresas').delete().eq('id', id);
  manejarError('eliminarEmpresa', error);
}

export async function unirsEaEmpresa(empresaId, agenteId) {
  const { data, error } = await supabase
    .from('agentes_empresas')
    .insert({ agente_id: agenteId, empresa_id: empresaId, rol: 'empleado' })
    .select()
    .single();
  manejarError('unirsEaEmpresa', error);
  return data;
}

export async function invitarAgenteAEmpresa({ email, empresa_id, rol = 'empleado' }) {
  const { data: agente, error: errAgente } = await supabase.from('agentes').select('id').eq('email', email).maybeSingle();
  manejarError('invitarAgenteAEmpresa:buscarAgente', errAgente);
  if (!agente) {
    throw new Error('No existe un agente registrado con ese correo. Pídele que se registre primero.');
  }
  const { data, error } = await supabase
    .from('agentes_empresas')
    .insert({ agente_id: agente.id, empresa_id, rol })
    .select()
    .single();
  manejarError('invitarAgenteAEmpresa', error);
  await crearNotificacion({
    agente_id: agente.id,
    tipo: 'invitacion_empresa',
    titulo: 'Nueva invitación de empresa',
    mensaje: 'Has sido agregado a una nueva empresa.',
    empresa_id
  });
  return data;
}

export async function listarAgentesDeEmpresa(empresaId) {
  const { data, error } = await supabase
    .from('agentes_empresas')
    .select('id, rol, estado, fecha_ingreso, agente:agentes(id, nombre, email, foto_url, estado)')
    .eq('empresa_id', empresaId);
  manejarError('listarAgentesDeEmpresa', error);
  return data ?? [];
}

export async function cambiarRolAgenteEmpresa(membresiaId, rol) {
  const { data, error } = await supabase.from('agentes_empresas').update({ rol }).eq('id', membresiaId).select().single();
  manejarError('cambiarRolAgenteEmpresa', error);
  return data;
}

export async function removerAgenteDeEmpresa(membresiaId) {
  const { error } = await supabase.from('agentes_empresas').delete().eq('id', membresiaId);
  manejarError('removerAgenteDeEmpresa', error);
}

/* ============================================================================
   DEPARTAMENTOS
   ============================================================================ */

export async function listarDepartamentos(empresaId) {
  const { data, error } = await supabase
    .from('departamentos')
    .select('*, manager:agentes(id, nombre, foto_url)')
    .eq('empresa_id', empresaId)
    .order('nombre');
  manejarError('listarDepartamentos', error);
  return data ?? [];
}

export async function crearDepartamento({ empresa_id, nombre, descripcion, manager_id }) {
  // UUID client-side: evita que RETURNING * evalúe SELECT RLS antes de que
  // el agente sea miembro (mismo patrón que crearEmpresa).
  const deptId = crypto.randomUUID();
  const { error } = await supabase.from('departamentos').insert({ id: deptId, empresa_id, nombre, descripcion, manager_id });
  manejarError('crearDepartamento', error);
  const { data, error: errSel } = await supabase.from('departamentos').select('*, manager:agentes(id, nombre, foto_url)').eq('id', deptId).single();
  manejarError('crearDepartamento:select', errSel);
  return data;
}

export async function actualizarDepartamento(id, cambios) {
  // Split UPDATE + SELECT para evitar 406 por RETURNING RLS.
  const { error } = await supabase.from('departamentos').update(cambios).eq('id', id);
  manejarError('actualizarDepartamento', error);
  const { data, error: errSel } = await supabase.from('departamentos').select('*, manager:agentes(id, nombre, foto_url)').eq('id', id).single();
  manejarError('actualizarDepartamento:select', errSel);
  return data;
}

export async function eliminarDepartamento(id) {
  const { error } = await supabase.from('departamentos').delete().eq('id', id);
  manejarError('eliminarDepartamento', error);
}

export async function agregarAgenteADepartamento(agente_id, departamento_id) {
  const { error } = await supabase.from('agentes_departamentos').insert({ agente_id, departamento_id });
  manejarError('agregarAgenteADepartamento', error);
}

export async function listarAgentesDeDepartamento(departamentoId) {
  const { data, error } = await supabase
    .from('agentes_departamentos')
    .select('id, agente:agentes(id, nombre, email, foto_url)')
    .eq('departamento_id', departamentoId);
  manejarError('listarAgentesDeDepartamento', error);
  return data ?? [];
}

export async function quitarAgenteDeDepartamento(id) {
  const { error } = await supabase.from('agentes_departamentos').delete().eq('id', id);
  manejarError('quitarAgenteDeDepartamento', error);
}

/* ============================================================================
   PROYECTOS
   ============================================================================ */

export async function listarProyectos(empresaId, filtros = {}) {
  let query = supabase
    .from('proyectos')
    .select('*, departamento:departamentos(nombre), creador:agentes(nombre)')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false });
  if (filtros.estado) query = query.eq('estado', filtros.estado);
  if (filtros.departamento_id) query = query.eq('departamento_id', filtros.departamento_id);
  const { data, error } = await query;
  manejarError('listarProyectos', error);
  return data ?? [];
}

export async function obtenerProyecto(id) {
  const { data, error } = await supabase.from('proyectos').select('*, departamento:departamentos(nombre)').eq('id', id).single();
  manejarError('obtenerProyecto', error);
  return data;
}

export async function crearProyecto(datos) {
  const { data, error } = await supabase.from('proyectos').insert(datos).select().single();
  manejarError('crearProyecto', error);
  await supabase.from('miembros_proyectos').insert({ proyecto_id: data.id, agente_id: datos.creador_id, rol: 'owner' });
  return data;
}

export async function actualizarProyecto(id, cambios) {
  const { error } = await supabase.from('proyectos').update(cambios).eq('id', id);
  manejarError('actualizarProyecto', error);
  const { data, error: errSel } = await supabase.from('proyectos').select('*, departamento:departamentos(nombre)').eq('id', id).single();
  manejarError('actualizarProyecto:select', errSel);
  return data;
}

export async function eliminarProyecto(id) {
  const { error } = await supabase.from('proyectos').delete().eq('id', id);
  manejarError('eliminarProyecto', error);
}

export async function obtenerProgresoProyectos(empresaId) {
  const { data, error } = await supabase.from('vista_progreso_proyectos').select('*').eq('empresa_id', empresaId);
  manejarError('obtenerProgresoProyectos', error);
  return data ?? [];
}

export async function listarMiembrosProyecto(proyectoId) {
  const { data, error } = await supabase
    .from('miembros_proyectos')
    .select('id, rol, added_at, agente:agentes(id, nombre, email, foto_url)')
    .eq('proyecto_id', proyectoId);
  manejarError('listarMiembrosProyecto', error);
  return data ?? [];
}

export async function agregarMiembroProyecto(proyecto_id, agente_id, rol = 'miembro') {
  const { data, error } = await supabase.from('miembros_proyectos').insert({ proyecto_id, agente_id, rol }).select().single();
  manejarError('agregarMiembroProyecto', error);
  return data;
}

export async function quitarMiembroProyecto(id) {
  const { error } = await supabase.from('miembros_proyectos').delete().eq('id', id);
  manejarError('quitarMiembroProyecto', error);
}

export async function agregarDepartamentoAProyecto(proyecto_id, departamento_id) {
  const { data, error } = await supabase.from('departamentos_proyectos').insert({ proyecto_id, departamento_id }).select().single();
  manejarError('agregarDepartamentoAProyecto', error);
  return data;
}

/* ============================================================================
   TAREAS
   ============================================================================ */

export async function obtenerTareas(filtros = {}, pagina = 0, pageSize = CONFIG.PAGE_SIZE_TAREAS) {
  let query = supabase
    .from('tareas')
    .select('*, proyecto:proyectos(nombre, color_etiqueta, empresa_id, empresa:empresas(nombre)), asignados:agentes_tareas(agente:agentes(id, nombre, foto_url))', { count: 'exact' });

  // Filtro empresa: acepta empresa_id (single) o empresa_ids (array)
  const eIds = filtros.empresa_ids?.length ? filtros.empresa_ids : null;
  if (eIds) query = query.in('empresa_id', eIds);
  else if (filtros.empresa_id) query = query.eq('empresa_id', filtros.empresa_id);
  // Sin filtro → RLS muestra solo las empresas del usuario

  // Filtro proyecto: acepta proyecto_id (single) o proyecto_ids (array)
  const pIds = filtros.proyecto_ids?.length ? filtros.proyecto_ids : null;
  if (pIds) query = query.in('proyecto_id', pIds);
  else if (filtros.proyecto_id) query = query.eq('proyecto_id', filtros.proyecto_id);

  // Filtro estado: acepta estado (single) o estados (array)
  const ests = filtros.estados?.length ? filtros.estados : null;
  if (ests) query = query.in('estado', ests);
  else if (filtros.estado) query = query.eq('estado', filtros.estado);

  // Filtro prioridad: acepta prioridad (single) o prioridades (array)
  const prios = filtros.prioridades?.length ? filtros.prioridades : null;
  if (prios) query = query.in('prioridad', prios);
  else if (filtros.prioridad) query = query.eq('prioridad', filtros.prioridad);

  if (filtros.es_cronologica !== undefined) query = query.eq('es_cronologica', filtros.es_cronologica);
  if (filtros.busqueda) query = query.ilike('titulo', `%${filtros.busqueda}%`);
  if (filtros.fecha_desde) query = query.gte('fecha_cierre', filtros.fecha_desde);
  if (filtros.fecha_hasta) query = query.lte('fecha_cierre', filtros.fecha_hasta);

  query = query.order('fecha_cierre', { ascending: true, nullsFirst: false });
  query = query.range(pagina * pageSize, pagina * pageSize + pageSize - 1);

  const { data, error, count } = await query;
  manejarError('obtenerTareas', error);
  return { data: data ?? [], total: count ?? 0 };
}

/** Todos los proyectos accesibles al usuario (sin filtro de empresa, RLS aplica) */
export async function listarTodosLosProyectos() {
  const { data, error } = await supabase
    .from('proyectos')
    .select('id, nombre, empresa_id, empresa:empresas(nombre), color_etiqueta')
    .order('nombre');
  manejarError('listarTodosLosProyectos', error);
  return data ?? [];
}

export async function obtenerTarea(id) {
  const { data, error } = await supabase
    .from('tareas')
    .select(`*,
      proyecto:proyectos(id, nombre, color_etiqueta),
      creador:agentes!tareas_creador_id_fkey(id, nombre, foto_url),
      asignados:agentes_tareas(id, estado_agente, agente:agentes(id, nombre, foto_url, email))
    `)
    .eq('id', id)
    .single();
  manejarError('obtenerTarea', error);
  return data;
}

export async function crearTarea(datos) {
  const { agentes_ids, ...tareaData } = datos;
  const { data, error } = await supabase.from('tareas').insert(tareaData).select().single();
  manejarError('crearTarea', error);
  if (agentes_ids?.length) {
    await asignarAgentesATarea(data.id, agentes_ids);
  }
  if (tareaData.es_cronologica) {
    await crearRecordatorioDesdeTaskCronologica(data);
  }
  return data;
}

export async function actualizarTarea(id, cambios) {
  const { data, error } = await supabase.from('tareas').update(cambios).eq('id', id).select().single();
  manejarError('actualizarTarea', error);
  return data;
}

export async function moverTarea(id, nuevaFechaCierre) {
  return actualizarTarea(id, { fecha_cierre: nuevaFechaCierre });
}

export async function cambiarEstadoTarea(id, estado, agente_id) {
  const cambios = { estado };
  if (estado === 'completado') cambios.completado_por = agente_id;
  return actualizarTarea(id, cambios);
}

export async function eliminarTarea(id) {
  const { error } = await supabase.from('tareas').delete().eq('id', id);
  manejarError('eliminarTarea', error);
}

export async function asignarAgentesATarea(tarea_id, agentesIds = []) {
  const rows = agentesIds.map((agente_id) => ({ tarea_id, agente_id }));
  const { error } = await supabase.from('agentes_tareas').upsert(rows, { onConflict: 'tarea_id,agente_id' });
  manejarError('asignarAgentesATarea', error);
}

export async function desasignarAgenteDeTarea(agentesTareasId) {
  const { error } = await supabase.from('agentes_tareas').delete().eq('id', agentesTareasId);
  manejarError('desasignarAgenteDeTarea', error);
}

export async function cambiarEstadoAgenteEnTarea(agentesTareasId, estado_agente) {
  const { data, error } = await supabase.from('agentes_tareas').update({ estado_agente }).eq('id', agentesTareasId).select().single();
  manejarError('cambiarEstadoAgenteEnTarea', error);
  return data;
}

export async function buscarTareas(query, empresaId) {
  const { data, error } = await supabase
    .from('tareas')
    .select('id, titulo, estado, prioridad, fecha_cierre')
    .eq('empresa_id', empresaId)
    .ilike('titulo', `%${query}%`)
    .limit(20);
  manejarError('buscarTareas', error);
  return data ?? [];
}

export async function obtenerTareasDelAgente(agenteId, filtros = {}) {
  let query = supabase
    .from('agentes_tareas')
    .select('id, estado_agente, tarea:tareas(*, proyecto:proyectos(nombre, color_etiqueta))')
    .eq('agente_id', agenteId);
  if (filtros.estado_agente) query = query.eq('estado_agente', filtros.estado_agente);
  const { data, error } = await query;
  manejarError('obtenerTareasDelAgente', error);
  return data ?? [];
}

/* --- Comentarios --- */

export async function listarComentarios(tareaId) {
  const { data, error } = await supabase
    .from('comentarios_tareas')
    .select('*, agente:agentes(id, nombre, foto_url)')
    .eq('tarea_id', tareaId)
    .order('created_at', { ascending: true });
  manejarError('listarComentarios', error);
  return data ?? [];
}

export async function crearComentario({ tarea_id, agente_id, texto }) {
  const { data, error } = await supabase.from('comentarios_tareas').insert({ tarea_id, agente_id, texto }).select('*, agente:agentes(nombre, foto_url)').single();
  manejarError('crearComentario', error);
  return data;
}

export async function eliminarComentario(id) {
  const { error } = await supabase.from('comentarios_tareas').delete().eq('id', id);
  manejarError('eliminarComentario', error);
}

/* --- Historial --- */

export async function listarHistorialTarea(tareaId, pagina = 0, pageSize = CONFIG.PAGE_SIZE_HISTORIAL) {
  const { data, error, count } = await supabase
    .from('historial_tareas')
    .select('*, agente:agentes(nombre)', { count: 'exact' })
    .eq('tarea_id', tareaId)
    .order('created_at', { ascending: false })
    .range(pagina * pageSize, pagina * pageSize + pageSize - 1);
  manejarError('listarHistorialTarea', error);
  return { data: data ?? [], total: count ?? 0 };
}

export async function actividadRecienteProyecto(proyectoId, limite = 30) {
  const { data, error } = await supabase
    .from('historial_tareas')
    .select('*, agente:agentes(nombre, foto_url), tarea:tareas!inner(titulo, proyecto_id)')
    .eq('tarea.proyecto_id', proyectoId)
    .order('created_at', { ascending: false })
    .limit(limite);
  manejarError('actividadRecienteProyecto', error);
  return data ?? [];
}

/* ============================================================================
   RECORDATORIOS CRONOLÓGICOS
   ============================================================================ */

async function crearRecordatorioDesdeTaskCronologica(tarea) {
  const { data, error } = await supabase
    .from('recordatorios_cronologicos')
    .insert({
      agente_id: tarea.creador_id,
      empresa_id: tarea.empresa_id,
      proyecto_id: tarea.proyecto_id,
      tarea_id: tarea.id,
      titulo: tarea.titulo,
      descripcion: tarea.descripcion,
      frecuencia: tarea.frecuencia,
      dias_semana: tarea.dias_semana,
      dia_mes: tarea.dia_mes
    })
    .select()
    .single();
  manejarError('crearRecordatorioDesdeTaskCronologica', error);
  await supabase.rpc('generar_instancias_recordatorio', {
    p_recordatorio_id: data.id,
    p_dias: CONFIG.DIAS_GENERACION_RECORDATORIOS
  });
  return data;
}

export async function listarRecordatorios(agenteId) {
  const { data, error } = await supabase.from('recordatorios_cronologicos').select('*').eq('agente_id', agenteId).order('created_at', { ascending: false });
  manejarError('listarRecordatorios', error);
  return data ?? [];
}

export async function crearRecordatorio(datos) {
  const { data, error } = await supabase.from('recordatorios_cronologicos').insert(datos).select().single();
  manejarError('crearRecordatorio', error);
  await supabase.rpc('generar_instancias_recordatorio', { p_recordatorio_id: data.id, p_dias: CONFIG.DIAS_GENERACION_RECORDATORIOS });
  return data;
}

export async function pausarRecordatorio(id, estado) {
  const { data, error } = await supabase.from('recordatorios_cronologicos').update({ estado }).eq('id', id).select().single();
  manejarError('pausarRecordatorio', error);
  return data;
}

export async function eliminarRecordatorio(id) {
  const { error } = await supabase.from('recordatorios_cronologicos').delete().eq('id', id);
  manejarError('eliminarRecordatorio', error);
}

export async function obtenerInstanciasDelPeriodo(agenteId, desde, hasta) {
  const { data, error } = await supabase
    .from('instancias_recordatorios')
    .select('*, recordatorio:recordatorios_cronologicos!inner(titulo, descripcion, agente_id, hora_recordatorio, proyecto_id)')
    .eq('recordatorio.agente_id', agenteId)
    .gte('fecha_programada', desde)
    .lte('fecha_programada', hasta);
  manejarError('obtenerInstanciasDelPeriodo', error);
  return data ?? [];
}

export async function completarInstancia(id) {
  const { data, error } = await supabase
    .from('instancias_recordatorios')
    .update({ estado: 'completado', completado_en: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  manejarError('completarInstancia', error);
  return data;
}

/* ============================================================================
   CALENDARIO (combina tareas puntuales + instancias de recordatorios)
   ============================================================================ */

export async function obtenerEventosCalendario({ empresa_id, agente_id, desde, hasta, soloMias = false, proyecto_ids = [] }) {
  let queryTareas = supabase
    .from('tareas')
    .select('id, titulo, descripcion, estado, prioridad, fecha_cierre, fecha_inicio, proyecto_id, proyecto:proyectos(id, nombre, color_etiqueta)')
    .eq('empresa_id', empresa_id)
    .not('fecha_cierre', 'is', null)
    .gte('fecha_cierre', desde)
    .lte('fecha_cierre', hasta);

  // Filtro por proyectos seleccionados
  if (proyecto_ids.length) {
    queryTareas = queryTareas.in('proyecto_id', proyecto_ids);
  }

  if (soloMias && agente_id) {
    const { data: misTareasIds } = await supabase.from('agentes_tareas').select('tarea_id').eq('agente_id', agente_id);
    const ids = (misTareasIds ?? []).map((t) => t.tarea_id);
    queryTareas = queryTareas.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  }

  const { data: tareas, error: errTareas } = await queryTareas;
  manejarError('obtenerEventosCalendario:tareas', errTareas);

  const instancias = agente_id ? await obtenerInstanciasDelPeriodo(agente_id, desde, hasta) : [];

  const eventosTareas = (tareas ?? []).map((t) => ({
    tipo: 'tarea',
    id: t.id,
    titulo: t.titulo,
    fecha: t.fecha_cierre,
    estado: t.estado,
    prioridad: t.prioridad,
    color_proyecto: t.proyecto?.color_etiqueta,
    proyecto_nombre: t.proyecto?.nombre,
    vencida: new Date(t.fecha_cierre) < new Date() && t.estado !== 'completado'
  }));

  const eventosInstancias = (instancias ?? []).map((i) => ({
    tipo: 'recordatorio',
    id: i.id,
    recordatorio_id: i.recordatorio_id,
    titulo: i.recordatorio?.titulo,
    descripcion: i.recordatorio?.descripcion,
    fecha: i.fecha_programada,
    hora: i.recordatorio?.hora_recordatorio,
    estado_instancia: i.estado
  }));

  return [...eventosTareas, ...eventosInstancias];
}

/* ============================================================================
   NOTIFICACIONES
   ============================================================================ */

export async function crearNotificacion(datos) {
  const { data, error } = await supabase.from('notificaciones').insert(datos).select().single();
  manejarError('crearNotificacion', error);
  return data;
}

export async function listarNotificaciones(agenteId, pagina = 0, pageSize = CONFIG.PAGE_SIZE_NOTIFICACIONES) {
  const { data, error, count } = await supabase
    .from('notificaciones')
    .select('*', { count: 'exact' })
    .eq('agente_id', agenteId)
    .order('created_at', { ascending: false })
    .range(pagina * pageSize, pagina * pageSize + pageSize - 1);
  manejarError('listarNotificaciones', error);
  return { data: data ?? [], total: count ?? 0 };
}

export async function contarNotificacionesNoLeidas(agenteId) {
  const { count, error } = await supabase
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('agente_id', agenteId)
    .eq('leida', false);
  manejarError('contarNotificacionesNoLeidas', error);
  return count ?? 0;
}

export async function marcarNotificacionLeida(id) {
  const { error } = await supabase.from('notificaciones').update({ leida: true }).eq('id', id);
  manejarError('marcarNotificacionLeida', error);
}

export async function marcarTodasLeidas(agenteId) {
  const { error } = await supabase.from('notificaciones').update({ leida: true }).eq('agente_id', agenteId).eq('leida', false);
  manejarError('marcarTodasLeidas', error);
}

export function suscribirseANotificaciones(agenteId, callback) {
  return supabase
    .channel(`notificaciones-${agenteId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `agente_id=eq.${agenteId}` }, callback)
    .subscribe();
}

/* ============================================================================
   REPORTES & ANALÍTICA
   ============================================================================ */

export async function dashboardEjecutivo(empresaId) {
  const [{ data: porEstado }, { data: vencidas }, { data: carga }] = await Promise.all([
    supabase.from('tareas').select('estado').eq('empresa_id', empresaId),
    supabase.from('tareas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).lt('fecha_cierre', new Date().toISOString()).neq('estado', 'completado'),
    supabase.from('vista_carga_trabajo').select('*, agente:agentes(nombre)').eq('empresa_id', empresaId)
  ]);

  const resumenEstado = (porEstado ?? []).reduce((acc, t) => {
    acc[t.estado] = (acc[t.estado] || 0) + 1;
    return acc;
  }, {});

  return {
    totalTareas: porEstado?.length ?? 0,
    porEstado: resumenEstado,
    tareasVencidas: vencidas?.count ?? 0,
    cargaPorAgente: carga ?? []
  };
}

export async function reporteProyecto(proyectoId) {
  const { data: progreso, error } = await supabase.from('vista_progreso_proyectos').select('*').eq('proyecto_id', proyectoId).single();
  manejarError('reporteProyecto', error);
  const { data: tareas } = await supabase.from('tareas').select('tiempo_estimado_horas, tiempo_real_horas, estado').eq('proyecto_id', proyectoId);
  const tiempoEstimado = (tareas ?? []).reduce((s, t) => s + (t.tiempo_estimado_horas || 0), 0);
  const tiempoReal = (tareas ?? []).reduce((s, t) => s + (Number(t.tiempo_real_horas) || 0), 0);
  return { ...progreso, tiempoEstimado, tiempoReal };
}

export async function reportePersonal(agenteId, desde, hasta) {
  const { data, error } = await supabase
    .from('agentes_tareas')
    .select('estado_agente, tarea:tareas(titulo, estado, fecha_completado, tiempo_estimado_horas, tiempo_real_horas, fecha_cierre)')
    .eq('agente_id', agenteId);
  manejarError('reportePersonal', error);
  const tareas = (data ?? []).map((r) => r.tarea).filter(Boolean);
  const completadas = tareas.filter((t) => t.estado === 'completado' && (!desde || t.fecha_completado >= desde) && (!hasta || t.fecha_completado <= hasta));
  const pendientes = tareas.filter((t) => t.estado !== 'completado');
  return { completadas, pendientes, totalCompletadas: completadas.length, totalPendientes: pendientes.length };
}

/* ============================================================================
   AGENTES (perfil)
   ============================================================================ */

export async function actualizarPerfilAgente(id, cambios) {
  const { data, error } = await supabase.from('agentes').update(cambios).eq('id', id).select().single();
  manejarError('actualizarPerfilAgente', error);
  return data;
}

export async function subirFotoPerfil(agenteId, file) {
  const ext = file.name.split('.').pop();
  const path = `perfiles/${agenteId}.${ext}`;
  const { error: errUpload } = await supabase.storage.from('avatares').upload(path, file, { upsert: true });
  manejarError('subirFotoPerfil:upload', errUpload);
  const { data } = supabase.storage.from('avatares').getPublicUrl(path);
  await actualizarPerfilAgente(agenteId, { foto_url: data.publicUrl });
  return data.publicUrl;
}
