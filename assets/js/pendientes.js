import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError } from './main.js';
import { obtenerTareasDelAgente, cambiarEstadoAgenteEnTarea, obtenerInstanciasDelPeriodo, dashboardEjecutivo } from './supabase-data.js';
import { $, $$, escapeHTML, formatearFecha, formatearHora, esVencida, ETIQUETAS_ESTADO, ETIQUETAS_PRIORIDAD } from './utils.js';

const ESTADOS_TABLERO = ['pendiente', 'en_progreso', 'completado', 'rechazada'];
const ETIQUETAS_AGENTE = { pendiente: 'Pendiente', en_progreso: 'En progreso', completado: 'Completado', rechazada: 'Rechazada' };

function plantilla() {
  return `
    <div class="page-header">
      <div><h1>Mis pendientes</h1><p class="page-header__subtitle">Tareas asignadas a ti y recordatorios de hoy.</p></div>
    </div>

    <div class="card" style="margin-bottom:var(--space-5);">
      <h3 style="margin-bottom:var(--space-3);">🔔 Recordatorios de hoy</h3>
      <div id="recordatorios-hoy"><div class="loading-spinner"></div></div>
    </div>

    <div class="table-toolbar">
      <select class="form-control" id="filtro-estado-agente"><option value="">Todos mis estados</option>${ESTADOS_TABLERO.map((e) => `<option value="${e}">${ETIQUETAS_AGENTE[e]}</option>`).join('')}</select>
    </div>

    <div class="kanban" id="mi-tablero"><div class="loading-spinner"></div></div>
  `;
}

async function cargarRecordatoriosHoy(agenteId) {
  const hoy = new Date(); const desde = new Date(hoy); desde.setHours(0,0,0,0); const hasta = new Date(hoy); hasta.setHours(23,59,59);
  const instancias = await obtenerInstanciasDelPeriodo(agenteId, desde.toISOString(), hasta.toISOString());
  $('#recordatorios-hoy').innerHTML = instancias.length
    ? instancias.map((i) => `
      <div style="display:flex; justify-content:space-between; padding:var(--space-2) 0; border-bottom:1px solid var(--border-subtle);">
        <span>${i.estado === 'completado' ? '✅' : '⏰'} ${escapeHTML(i.recordatorio?.titulo || '')}</span>
        <span style="color:var(--text-tertiary); font-size:var(--fs-xs);">${i.recordatorio?.hora_recordatorio ? formatearHora(i.recordatorio.hora_recordatorio) : ''}</span>
      </div>`).join('')
    : '<p style="color:var(--text-tertiary); font-size:var(--fs-sm);">Sin recordatorios para hoy. 🎉</p>';
}

async function cargarTablero(agenteId) {
  const filtro = $('#filtro-estado-agente').value || undefined;
  const tareas = await obtenerTareasDelAgente(agenteId, filtro ? { estado_agente: filtro } : {});
  const cont = $('#mi-tablero');

  cont.innerHTML = ESTADOS_TABLERO.map((estado) => {
    const filas = tareas.filter((r) => r.estado_agente === estado);
    return `<div class="kanban-column">
      <div class="kanban-column__title"><span>${ETIQUETAS_AGENTE[estado]}</span><span class="badge badge-estado-completado">${filas.length}</span></div>
      ${filas.map((r) => `
        <div class="kanban-card">
          <div style="font-weight:600; font-size:var(--fs-sm); margin-bottom:var(--space-2);"><a href="tarea-detalle.html?id=${r.tarea.id}" style="color:inherit;">${escapeHTML(r.tarea.titulo)}</a></div>
          <div style="font-size:var(--fs-xs); color:${esVencida(r.tarea.fecha_cierre, r.tarea.estado) ? 'var(--color-danger)' : 'var(--text-tertiary)'}; margin-bottom:var(--space-2);">${r.tarea.fecha_cierre ? formatearFecha(r.tarea.fecha_cierre) : 'Sin fecha'}</div>
          <span class="badge badge-prioridad-${r.tarea.prioridad}">${ETIQUETAS_PRIORIDAD[r.tarea.prioridad]}</span>
          <select class="form-control" data-cambiar-estado="${r.id}" style="margin-top:var(--space-2); min-height:32px; font-size:11px;">
            ${ESTADOS_TABLERO.map((e) => `<option value="${e}" ${e === estado ? 'selected' : ''}>${ETIQUETAS_AGENTE[e]}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>`;
  }).join('');

  $$('[data-cambiar-estado]').forEach((sel) => sel.addEventListener('change', async () => {
    try { await cambiarEstadoAgenteEnTarea(sel.dataset.cambiarEstado, sel.value); toastExito('Estado actualizado.'); cargarTablero(agenteId); }
    catch (err) { toastError(err.message); }
  }));
}

async function init() {
  renderLayout('pendientes');
  const ctx = await inicializarApp();
  if (!ctx) return;
  const main = document.getElementById('main-content');
  main.innerHTML = plantilla();
  $('#filtro-estado-agente').addEventListener('change', () => cargarTablero(ctx.agente.id));
  await cargarRecordatoriosHoy(ctx.agente.id);
  await cargarTablero(ctx.agente.id);
}

init();
