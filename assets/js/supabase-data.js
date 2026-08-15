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
    .select('*, manager:agentes(id, nombre, foto_url), empresa:empresas(nombre)')
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

export async function listarProyectosIdsPorAgente(agenteIds) {
  const { data, error } = await supabase
    .from('miembros_proyectos')
    .select('proyecto_id')
    .in('agente_id', agenteIds);
  manejarError('listarProyectosIdsPorAgente', error);
  return (data ?? []).map((m) => m.proyecto_id);
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

  // Filtro agente asignado: pre-busca tarea_ids en agentes_tareas
  const agIds = filtros.agente_ids?.length ? filtros.agente_ids : null;
  if (agIds) {
    const { data: asig } = await supabase.from('agentes_tareas').select('tarea_id').in('agente_id', agIds);
    const tarIds = (asig ?? []).map((a) => a.tarea_id);
    query = query.in('id', tarIds.length ? tarIds : ['00000000-0000-0000-0000-000000000000']);
  }

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
    .select('*, empresa:empresas(nombre), departamento:departamentos(nombre), creador:agentes(nombre)')
    .order('created_at', { ascending: false });
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
  if (agentes_ids?.length) await asignarAgentesATarea(data.id, agentes_ids);
  // Generar instancias si es cronológica (vía RPC SECURITY DEFINER)
  if (data.es_cronologica) await sincronizarRecordatorioPorTarea(data);
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
   RECORDATORIOS / TAREAS CRONOLÓGICAS
   Migración 009: recordatorios_cronologicos eliminada.
   Toda la lógica vive en tareas + instancias_recordatorios.
   ============================================================================ */

export async function listarRecordatorios(agenteId, filtros = {}) {
  // Tras la migración 008, TODAS las tareas (puntuales y cronológicas) viven en la
  // tabla tareas. Esta función devuelve ambas, normalizadas con tipo='puntual'|'cronologica'.
  const agIds = filtros.agente_ids?.length ? filtros.agente_ids : null;
  const NULL_ID = '00000000-0000-0000-0000-000000000000';

  let q = supabase
    .from('tareas')
    .select('*, empresa:empresas(nombre), proyecto:proyectos(nombre, color_etiqueta), asignados:agentes_tareas(agente:agentes(id, nombre, foto_url))')
    .order('created_at', { ascending: false });

  if (filtros.empresa_ids?.length) q = q.in('empresa_id', filtros.empresa_ids);

  if (filtros.estados?.length) {
    q = q.in('estado', filtros.estados);
  }

  if (agIds) {
    const { data: asig } = await supabase
      .from('agentes_tareas').select('tarea_id').in('agente_id', agIds);
    const tarIds = (asig ?? []).map((a) => a.tarea_id);
    if (tarIds.length) {
      q = q.or(`creador_id.in.(${agIds.join(',')}),id.in.(${tarIds.join(',')})`);
    } else {
      q = q.in('creador_id', agIds.length ? agIds : [NULL_ID]);
    }
  }

  const { data, error } = await q;
  manejarError('listarRecordatorios', error);

  return (data ?? []).map((t) => ({
    ...t,
    tipo: t.es_cronologica ? 'cronologica' : 'puntual'
  }));
}

/** Migración 009: genera instancias directamente desde tareas, sin RC */
export async function sincronizarRecordatorioPorTarea(tarea, agentesIds = []) {
  try {
    // regenerar_instancias_tarea es SECURITY DEFINER:
    // borra instancias futuras no completadas y regenera en una sola llamada atómica,
    // evitando el problema de RLS que bloqueaba el DELETE del cliente JS.
    await supabase.rpc('regenerar_instancias_tarea', { p_tarea_id: tarea.id, p_dias: 90 });
  } catch (err) {
    console.warn('[sincronizarRecordatorioPorTarea]', err.message);
  }
}

/** @deprecated — redirige a actualizarTarea + sincronizarRecordatorioPorTarea */
export async function actualizarRecordatorio(id, datos) {
  const { agentes_ids, ...campos } = datos;
  const tarea = await actualizarTarea(id, campos);
  await sincronizarRecordatorioPorTarea({ ...tarea, id }, agentes_ids ?? []);
  return tarea;
}

/** @deprecated — redirige a eliminarTarea */
export async function eliminarRecordatorio(id) {
  return eliminarTarea(id);
}

export async function obtenerInstanciasDelPeriodo(agenteId, desde, hasta, agenteIds = [], empresaIds = [], proyectoIds = []) {
  const hastaEOD = hasta.length === 10 ? hasta + 'T23:59:59' : hasta;
  const agentes  = agenteIds.length ? agenteIds : (agenteId ? [agenteId] : []);

  // Construir query de instancias
  let q = supabase
    .from('instancias_recordatorios')
    .select('*, tarea:tareas(titulo, descripcion, hora_recordatorio, proyecto_id, empresa_id, estado, es_cronologica)')
    .gte('fecha_programada', desde)
    .lte('fecha_programada', hastaEOD);

  if (agentes.length) {
    // Filtrar por tareas asignadas a los agentes
    const { data: asigTareas } = await supabase
      .from('agentes_tareas')
      .select('tarea_id')
      .in('agente_id', agentes);
    const tareaIds = [...new Set((asigTareas ?? []).map((r) => r.tarea_id))];
    if (!tareaIds.length) return [];
    q = q.in('tarea_id', tareaIds);
  }

  const { data, error } = await q;
  manejarError('obtenerInstanciasDelPeriodo', error);

  // Filtrar post-query por empresa, proyecto y estado. Deduplicar por (tarea_id, fecha)
  const seen = new Set();
  return (data ?? []).filter((i) => {
    if (i.tarea?.estado === 'archivado') return false;
    if (empresaIds.length && !empresaIds.includes(i.tarea?.empresa_id)) return false;
    if (proyectoIds.length && !proyectoIds.includes(i.tarea?.proyecto_id)) return false;
    const key = `${i.tarea_id}_${i.fecha_programada?.slice(0, 10)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
   CALENDARIO (combina tareas puntuales + tareas cronológicas + instancias de recordatorios)
   ============================================================================ */

// Mapa nombre-día → getDay() index (domingo=0 en JS)
const DOW_INDEX = { lunes:1, martes:2, miercoles:3, jueves:4, viernes:5, sabado:6, domingo:0 };

/**
 * Expande una tarea cronológica en eventos concretos dentro del período [desde, hasta].
 * Respeta fecha_inicio como punto de partida mínimo.
 */
function expandirTareaCronologica(tarea, desde, hasta) {
  const eventos = [];
  const periodoInicio = new Date(desde);
  const periodoFin    = new Date(hasta);
  const tareaInicio   = tarea.fecha_inicio ? new Date(tarea.fecha_inicio) : periodoInicio;
  const inicio = tareaInicio > periodoInicio ? tareaInicio : periodoInicio;

  const base = {
    tipo: 'tarea_cronologica',
    id: tarea.id,
    titulo: tarea.titulo,
    hora: tarea.hora_recordatorio ? tarea.hora_recordatorio.slice(0, 5) : null,
    estado: tarea.estado,
    prioridad: tarea.prioridad,
    color_proyecto: tarea.proyecto?.color_etiqueta,
    proyecto_nombre: tarea.proyecto?.nombre,
    vencida: false,
    es_cronologica: true
  };

  switch (tarea.frecuencia) {

    case 'diaria': {
      const d = new Date(inicio); d.setHours(0, 0, 0, 0);
      while (d <= periodoFin) {
        eventos.push({ ...base, fecha: d.toISOString().slice(0, 10) });
        d.setDate(d.getDate() + 1);
      }
      break;
    }

    case 'semanal': {
      const diasObjetivo = (tarea.dias_semana ?? []).map((n) => DOW_INDEX[n]).filter((v) => v !== undefined);
      if (!diasObjetivo.length) break;
      const d = new Date(inicio); d.setHours(0, 0, 0, 0);
      while (d <= periodoFin) {
        if (diasObjetivo.includes(d.getDay())) {
          eventos.push({ ...base, fecha: d.toISOString().slice(0, 10) });
        }
        d.setDate(d.getDate() + 1);
      }
      break;
    }

    case 'mensual': {
      const diaObjetivo = tarea.dia_mes ?? 1;
      // Empezar desde el mes de inicio, día objetivo
      const d = new Date(inicio.getFullYear(), inicio.getMonth(), diaObjetivo);
      d.setHours(0, 0, 0, 0);
      // Si ya pasó en este mes (antes de inicio), saltar al siguiente mes
      if (d < inicio) d.setMonth(d.getMonth() + 1);
      while (d <= periodoFin) {
        eventos.push({ ...base, fecha: d.toISOString().slice(0, 10) });
        d.setMonth(d.getMonth() + 1);
        d.setDate(diaObjetivo); // fuerza el día (setMonth puede cambiar el día si el mes es corto)
      }
      break;
    }

    case 'quincenal': {
      // dias_semana guarda los dos días del mes, ej: [15, 30]
      const dias = (tarea.dias_semana ?? ['15', '30']).map(Number).filter((v) => !isNaN(v));
      if (!dias.length) break;
      // Iterar mes a mes dentro del período
      const mesInicio = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
      while (mesInicio <= periodoFin) {
        for (const dia of dias) {
          const fecha = new Date(mesInicio.getFullYear(), mesInicio.getMonth(), dia);
          fecha.setHours(0, 0, 0, 0);
          if (fecha >= inicio && fecha <= periodoFin) {
            eventos.push({ ...base, fecha: fecha.toISOString().slice(0, 10) });
          }
        }
        mesInicio.setMonth(mesInicio.getMonth() + 1);
      }
      break;
    }

    case 'anual': {
      // Recurrence: misma fecha (día+mes) que fecha_inicio, cada año
      const origen = tarea.fecha_inicio ? new Date(tarea.fecha_inicio) : inicio;
      const diaMes  = origen.getDate();
      const mesOrig = origen.getMonth();
      // Buscar el primer año dentro del período
      let anio = periodoInicio.getFullYear();
      while (anio <= periodoFin.getFullYear() + 1) {
        const d = new Date(anio, mesOrig, diaMes);
        d.setHours(0, 0, 0, 0);
        if (d >= inicio && d <= periodoFin) {
          eventos.push({ ...base, fecha: d.toISOString().slice(0, 10) });
        }
        anio++;
        if (anio > periodoFin.getFullYear() + 1) break;
      }
      break;
    }
  }

  return eventos;
}

export async function obtenerEventosCalendario({ empresa_id, empresa_ids = [], agente_id, agente_ids = [], desde, hasta, proyecto_ids = [] }) {
  // Agentes a filtrar: si el usuario seleccionó filtro explícito usa ese, si no usa el agente logueado
  const agentes = agente_ids.length ? agente_ids : (agente_id ? [agente_id] : []);
  if (!agentes.length) return [];

  const hastaEOD = hasta.length === 10 ? hasta + 'T23:59:59' : hasta;

  // ── Paso 1: tareas asignadas al agente ───────────────────────────────────────
  const { data: asig } = await supabase
    .from('agentes_tareas')
    .select('tarea_id')
    .in('agente_id', agentes);

  const tareaIds = [...new Set((asig ?? []).map((r) => r.tarea_id))];
  if (!tareaIds.length) return [];

  // ── Paso 2: queries en paralelo ──────────────────────────────────────────────
  let qCrono = supabase
    .from('instancias_recordatorios')
    .select('id, tarea_id, fecha_programada, estado, tarea:tareas(titulo, descripcion, hora_recordatorio, proyecto_id, estado, es_cronologica)')
    .in('tarea_id', tareaIds)
    .gte('fecha_programada', desde)
    .lte('fecha_programada', hastaEOD);

  let qPunt = supabase
    .from('tareas')
    .select('id, titulo, descripcion, estado, prioridad, fecha_cierre, hora_recordatorio, proyecto_id, proyecto:proyectos(id, nombre, color_etiqueta)')
    .in('id', tareaIds)
    .eq('es_cronologica', false)
    .not('fecha_cierre', 'is', null)
    .not('estado', 'in', '("completado","archivado")')
    .gte('fecha_cierre', desde)
    .lte('fecha_cierre', hasta);

  if (proyecto_ids.length) {
    qCrono = qCrono.in('tarea_id', tareaIds); // ya filtrado, no-op
    qPunt  = qPunt.in('proyecto_id', proyecto_ids);
  }

  const [
    { data: instancias,     error: errCrono },
    { data: tareasPuntuales, error: errPunt  }
  ] = await Promise.all([qCrono, qPunt]);

  manejarError('obtenerEventosCalendario:cronologicas', errCrono);
  manejarError('obtenerEventosCalendario:puntuales',    errPunt);

  // ── Mapear cronológicas ───────────────────────────────────────────────────────
  const eventosInstancias = (instancias ?? [])
    .filter((i) => i.tarea?.es_cronologica && i.tarea?.estado !== 'archivado')
    .filter((i) => !proyecto_ids.length || proyecto_ids.includes(i.tarea?.proyecto_id))
    .map((i) => ({
      tipo: 'recordatorio',
      id: i.id,
      tarea_id: i.tarea_id,
      titulo: i.tarea?.titulo,
      descripcion: i.tarea?.descripcion,
      fecha: i.fecha_programada,
      hora: i.tarea?.hora_recordatorio ? String(i.tarea.hora_recordatorio).slice(0, 5) : null,
      estado_instancia: i.estado
    }));

  // ── Mapear puntuales ─────────────────────────────────────────────────────────
  const eventosPuntuales = (tareasPuntuales ?? []).map((t) => ({
    tipo: 'tarea',
    id: t.id,
    titulo: t.titulo,
    fecha: t.fecha_cierre,
    hora: t.hora_recordatorio ? t.hora_recordatorio.slice(0, 5) : null,
    estado: t.estado,
    prioridad: t.prioridad,
    color_proyecto: t.proyecto?.color_etiqueta,
    proyecto_nombre: t.proyecto?.nombre,
    vencida: new Date(t.fecha_cierre + 'T23:59:59') < new Date() && t.estado !== 'completado'
  }));

  return [...eventosPuntuales, ...eventosInstancias];
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
  const [{ data: porEstado }, { count: tareasVencidasCount }, { data: carga }] = await Promise.all([
    supabase.from('tareas').select('estado').eq('empresa_id', empresaId),
    supabase.from('tareas').select('id', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .lt('fecha_cierre', new Date().toISOString())
      .neq('estado', 'completado')
      .neq('estado', 'archivado'),
    supabase.from('vista_carga_trabajo').select('*, agente:agentes(nombre)').eq('empresa_id', empresaId)
  ]);

  const resumenEstado = (porEstado ?? []).reduce((acc, t) => {
    acc[t.estado] = (acc[t.estado] || 0) + 1;
    return acc;
  }, {});

  return {
    totalTareas: porEstado?.length ?? 0,
    porEstado: resumenEstado,
    tareasVencidas: tareasVencidasCount ?? 0,
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

// ─── Kanban helpers ───────────────────────────────────────────────────────────
/** Reemplaza TODOS los agentes asignados a una tarea (para drag kanban por Agente) */
export async function reasignarAgentesATarea(tareaId, agenteIds = []) {
  await supabase.from('agentes_tareas').delete().eq('tarea_id', tareaId);
  if (!agenteIds.length) return;
  const { error } = await supabase.from('agentes_tareas')
    .insert(agenteIds.map((agente_id) => ({ tarea_id: tareaId, agente_id })));
  manejarError('reasignarAgentesATarea', error);
}

/** @deprecated — redirige a reasignarAgentesATarea */
export async function reasignarAgentesARecordatorio(recordatorioId, agenteIds = []) {
  return reasignarAgentesATarea(recordatorioId, agenteIds);
}
