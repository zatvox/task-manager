import { renderLayout } from './layout.js';
import { inicializarApp, toastExito } from './main.js';
import { dashboardEjecutivo, listarProyectos, reporteProyecto, reportePersonal } from './supabase-data.js';
import { $, escapeHTML, descargarCSV, iniciales } from './utils.js';

let EMPRESA_ID, AGENTE;

function plantilla() {
  return `
    <div class="page-header"><div><h1>Reportes & Analítica</h1><p class="page-header__subtitle">Visión ejecutiva, de proyecto y personal.</p></div></div>

    <div class="tabs">
      <div class="tab active" data-tab="ejecutivo">Dashboard ejecutivo</div>
      <div class="tab" data-tab="proyecto">Reporte de proyecto</div>
      <div class="tab" data-tab="personal">Reporte personal</div>
    </div>

    <div id="tab-ejecutivo">
      <div class="grid-cards" id="ejecutivo-stats" style="margin-bottom:var(--space-5);"><div class="loading-spinner"></div></div>
      <div class="card">
        <div class="card__header"><h3 class="card__title">Carga de trabajo por agente</h3><button class="btn btn-secondary btn-sm" id="btn-export-carga">⬇️ Exportar CSV</button></div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Agente</th><th>Total asignadas</th><th>Pendientes</th><th>En progreso</th><th>Completadas</th><th>Vencidas</th></tr></thead>
          <tbody id="tabla-carga"></tbody>
        </table></div>
      </div>
    </div>

    <div id="tab-proyecto" style="display:none;">
      <div class="form-group" style="max-width:360px;"><label class="form-label">Selecciona un proyecto</label><select class="form-control" id="select-proyecto-reporte"></select></div>
      <div class="grid-cards" id="proyecto-stats"></div>
    </div>

    <div id="tab-personal" style="display:none;">
      <div class="grid-cards" id="personal-stats" style="margin-bottom:var(--space-5);"></div>
      <div class="card">
        <div class="card__header"><h3 class="card__title">Mis tareas pendientes</h3><button class="btn btn-secondary btn-sm" id="btn-export-personal">⬇️ Exportar CSV</button></div>
        <div id="lista-personal"></div>
      </div>
    </div>
  `;
}

async function cargarEjecutivo() {
  const resumen = await dashboardEjecutivo(EMPRESA_ID);
  $('#ejecutivo-stats').innerHTML = `
    <div class="card stat-card"><div class="stat-card__value">${resumen.totalTareas}</div><div class="stat-card__label">Tareas totales</div></div>
    <div class="card stat-card"><div class="stat-card__value" style="color:var(--color-danger)">${resumen.tareasVencidas}</div><div class="stat-card__label">Vencidas</div></div>
    <div class="card stat-card"><div class="stat-card__value" style="color:var(--color-success)">${resumen.porEstado.completado || 0}</div><div class="stat-card__label">Completadas</div></div>
    <div class="card stat-card"><div class="stat-card__value" style="color:var(--color-accent)">${resumen.porEstado.en_progreso || 0}</div><div class="stat-card__label">En progreso</div></div>
  `;
  $('#tabla-carga').innerHTML = resumen.cargaPorAgente.map((c) => `
    <tr>
      <td style="display:flex; align-items:center; gap:var(--space-2);"><div class="avatar">${iniciales(c.agente?.nombre || '?')}</div>${escapeHTML(c.agente?.nombre || '')}</td>
      <td>${c.total_asignadas}</td><td>${c.pendientes}</td><td>${c.en_progreso}</td><td>${c.completadas}</td>
      <td style="color:${c.vencidas > 0 ? 'var(--color-danger)' : 'inherit'}">${c.vencidas}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center; color:var(--text-tertiary);">Sin datos de carga de trabajo.</td></tr>';

  $('#btn-export-carga').onclick = () => descargarCSV('carga-de-trabajo.csv', resumen.cargaPorAgente.map((c) => ({
    agente: c.agente?.nombre, total: c.total_asignadas, pendientes: c.pendientes, en_progreso: c.en_progreso, completadas: c.completadas, vencidas: c.vencidas
  })));
}

async function cargarReporteProyecto() {
  const proyectos = await listarProyectos(EMPRESA_ID);
  $('#select-proyecto-reporte').innerHTML = proyectos.map((p) => `<option value="${p.id}">${escapeHTML(p.nombre)}</option>`).join('');
  $('#select-proyecto-reporte').onchange = renderReporteProyecto;
  if (proyectos.length) renderReporteProyecto();
}

async function renderReporteProyecto() {
  const id = $('#select-proyecto-reporte').value;
  if (!id) { $('#proyecto-stats').innerHTML = '<div class="empty-state">Crea un proyecto primero.</div>'; return; }
  const r = await reporteProyecto(id);
  $('#proyecto-stats').innerHTML = `
    <div class="card stat-card"><div class="stat-card__value">${r.porcentaje_progreso || 0}%</div><div class="stat-card__label">Progreso</div></div>
    <div class="card stat-card"><div class="stat-card__value">${r.tareas_completadas || 0}/${r.total_tareas || 0}</div><div class="stat-card__label">Completadas / Total</div></div>
    <div class="card stat-card"><div class="stat-card__value">${r.tiempoEstimado || 0}h</div><div class="stat-card__label">Tiempo estimado</div></div>
    <div class="card stat-card"><div class="stat-card__value">${r.tiempoReal || 0}h</div><div class="stat-card__label">Tiempo real registrado</div></div>
  `;
}

async function cargarPersonal() {
  const r = await reportePersonal(AGENTE.id);
  $('#personal-stats').innerHTML = `
    <div class="card stat-card"><div class="stat-card__value" style="color:var(--color-success)">${r.totalCompletadas}</div><div class="stat-card__label">Completadas</div></div>
    <div class="card stat-card"><div class="stat-card__value">${r.totalPendientes}</div><div class="stat-card__label">Pendientes</div></div>
  `;
  $('#lista-personal').innerHTML = r.pendientes.length
    ? r.pendientes.map((t) => `<div style="padding:var(--space-2) 0; border-bottom:1px solid var(--border-subtle); font-size:var(--fs-sm);">${escapeHTML(t.titulo)} — <span class="badge badge-estado-${t.estado}">${t.estado}</span></div>`).join('')
    : '<p style="color:var(--text-tertiary);">Sin pendientes. 🎉</p>';

  $('#btn-export-personal').onclick = () => descargarCSV('mis-tareas-pendientes.csv', r.pendientes.map((t) => ({ titulo: t.titulo, estado: t.estado, cierre: t.fecha_cierre })));
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    ['ejecutivo', 'proyecto', 'personal'].forEach((id) => { document.getElementById('tab-' + id).style.display = id === tab.dataset.tab ? 'block' : 'none'; });
  }));
}

async function init() {
  renderLayout('reportes');
  const ctx = await inicializarApp();
  if (!ctx) return;
  AGENTE = ctx.agente; EMPRESA_ID = ctx.empresaId;
  const main = document.getElementById('main-content');
  if (!EMPRESA_ID) { main.innerHTML = '<div class="empty-state"><h3>Crea o selecciona una empresa primero.</h3></div>'; return; }
  main.innerHTML = plantilla();
  bindTabs();
  await cargarEjecutivo();
  await cargarReporteProyecto();
  await cargarPersonal();
}

init();
