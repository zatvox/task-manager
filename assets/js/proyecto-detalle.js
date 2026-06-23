import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError } from './main.js';
import { obtenerProyecto, listarMiembrosProyecto, agregarMiembroProyecto, quitarMiembroProyecto, reporteProyecto, actividadRecienteProyecto, obtenerTareas, listarAgentesDeEmpresa } from './supabase-data.js';
import { $, qs, escapeHTML, formatearFecha, tiempoRelativo, iniciales, ETIQUETAS_ESTADO } from './utils.js';

async function init() {
  renderLayout('proyectos');
  const ctx = await inicializarApp();
  if (!ctx) return;
  const proyectoId = qs('id');
  const main = document.getElementById('main-content');
  if (!proyectoId) { main.innerHTML = '<div class="empty-state"><h3>Proyecto no especificado.</h3></div>'; return; }

  const proyecto = await obtenerProyecto(proyectoId);
  if (!proyecto) { main.innerHTML = '<div class="empty-state"><h3>Proyecto no encontrado.</h3></div>'; return; }

  main.innerHTML = `
    <div class="breadcrumbs"><a href="proyectos.html">Proyectos</a><span class="sep">/</span><span class="current">${escapeHTML(proyecto.nombre)}</span></div>
    <div class="page-header">
      <div>
        <h1 style="display:flex; align-items:center; gap:var(--space-3);"><span style="width:14px;height:14px;border-radius:50%;background:${proyecto.color_etiqueta};display:inline-block;"></span>${escapeHTML(proyecto.nombre)}</h1>
        <p class="page-header__subtitle">${escapeHTML(proyecto.descripcion || '')}</p>
      </div>
      <a class="btn btn-primary" href="tareas.html?proyecto=${proyecto.id}">+ Nueva tarea</a>
    </div>

    <div class="tabs">
      <div class="tab active" data-tab="resumen">Resumen</div>
      <div class="tab" data-tab="tareas">Tareas</div>
      <div class="tab" data-tab="miembros">Miembros</div>
      <div class="tab" data-tab="actividad">Actividad</div>
    </div>

    <div id="tab-resumen">
      <div class="grid-cards" id="resumen-stats"><div class="loading-spinner"></div></div>
    </div>
    <div id="tab-tareas" style="display:none;"><div class="table-wrap"><table class="data-table"><thead><tr><th>Título</th><th>Estado</th><th>Prioridad</th><th>Cierre</th></tr></thead><tbody id="tabla-tareas-proyecto"></tbody></table></div></div>
    <div id="tab-miembros" style="display:none;">
      <form id="form-agregar-miembro" style="display:flex; gap:var(--space-3); margin-bottom:var(--space-4); max-width:480px;">
        <select class="form-control" id="select-agente"></select>
        <select class="form-control" id="select-rol-miembro" style="max-width:140px;"><option value="miembro">Miembro</option><option value="manager">Manager</option><option value="owner">Owner</option></select>
        <button class="btn btn-primary">Agregar</button>
      </form>
      <ul id="lista-miembros"></ul>
    </div>
    <div id="tab-actividad" style="display:none;"><div id="lista-actividad"></div></div>
  `;

  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    ['resumen', 'tareas', 'miembros', 'actividad'].forEach((id) => {
      document.getElementById('tab-' + id).style.display = id === tab.dataset.tab ? 'block' : 'none';
    });
  }));

  try {
    const reporte = await reporteProyecto(proyectoId);
    document.getElementById('resumen-stats').innerHTML = `
      <div class="card stat-card"><div class="stat-card__value">${reporte.porcentaje_progreso || 0}%</div><div class="stat-card__label">Progreso</div></div>
      <div class="card stat-card"><div class="stat-card__value">${reporte.tareas_completadas || 0}/${reporte.total_tareas || 0}</div><div class="stat-card__label">Tareas completadas</div></div>
      <div class="card stat-card"><div class="stat-card__value">${reporte.tiempoEstimado || 0}h</div><div class="stat-card__label">Tiempo estimado</div></div>
      <div class="card stat-card"><div class="stat-card__value">${reporte.tiempoReal || 0}h</div><div class="stat-card__label">Tiempo real</div></div>
    `;
  } catch (err) { toastError('No se pudo cargar el resumen del proyecto.'); }

  try {
    const { data: tareas } = await obtenerTareas({ empresa_id: proyecto.empresa_id, proyecto_id: proyectoId }, 0, 100);
    document.getElementById('tabla-tareas-proyecto').innerHTML = tareas.length
      ? tareas.map((t) => `
        <tr>
          <td><a href="tarea-detalle.html?id=${t.id}">${escapeHTML(t.titulo)}</a></td>
          <td><span class="badge badge-estado-${t.estado}">${ETIQUETAS_ESTADO[t.estado]}</span></td>
          <td><span class="badge badge-prioridad-${t.prioridad}">${t.prioridad}</span></td>
          <td>${t.fecha_cierre ? formatearFecha(t.fecha_cierre) : '—'}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;color:var(--text-tertiary);">Sin tareas todavía.</td></tr>';
  } catch (err) { console.error(err); }

  async function refrescarMiembros() {
    const miembros = await listarMiembrosProyecto(proyectoId);
    document.getElementById('lista-miembros').innerHTML = miembros.map((m) => `
      <li style="display:flex; align-items:center; justify-content:space-between; padding:var(--space-2) 0; border-bottom:1px solid var(--border-subtle);">
        <span style="display:flex; align-items:center; gap:var(--space-2);"><div class="avatar">${iniciales(m.agente?.nombre || '?')}</div>${escapeHTML(m.agente?.nombre || '')} <span class="badge badge-estado-completado">${m.rol}</span></span>
        <button class="btn btn-icon" data-quitar="${m.id}">🗑️</button>
      </li>`).join('') || '<li style="color:var(--text-tertiary);">Sin miembros.</li>';

    document.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', async () => {
      await quitarMiembroProyecto(b.dataset.quitar); toastExito('Miembro removido.'); refrescarMiembros();
    }));
  }
  await refrescarMiembros();

  try {
    const agentesEmpresa = await listarAgentesDeEmpresa(proyecto.empresa_id);
    document.getElementById('select-agente').innerHTML = agentesEmpresa.map((a) => `<option value="${a.agente.id}">${escapeHTML(a.agente.nombre)}</option>`).join('');
  } catch (err) { console.error(err); }

  document.getElementById('form-agregar-miembro').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await agregarMiembroProyecto(proyectoId, document.getElementById('select-agente').value, document.getElementById('select-rol-miembro').value);
      toastExito('Miembro agregado.'); refrescarMiembros();
    } catch (err) { toastError(err.message); }
  });

  try {
    const actividad = await actividadRecienteProyecto(proyectoId);
    document.getElementById('lista-actividad').innerHTML = actividad.length
      ? actividad.map((a) => `
        <div style="display:flex; gap:var(--space-3); padding:var(--space-3) 0; border-bottom:1px solid var(--border-subtle);">
          <div class="avatar">${iniciales(a.agente?.nombre || 'Sistema')}</div>
          <div>
            <div style="font-size:var(--fs-sm);"><strong>${escapeHTML(a.agente?.nombre || 'Sistema')}</strong> cambió <strong>${escapeHTML(a.campo_modificado)}</strong> en "${escapeHTML(a.tarea?.titulo || '')}"</div>
            <div style="font-size:var(--fs-xs); color:var(--text-tertiary);">${escapeHTML(a.valor_antiguo || '—')} → ${escapeHTML(a.valor_nuevo || '—')} · ${tiempoRelativo(a.created_at)}</div>
          </div>
        </div>`).join('')
      : '<div class="empty-state">Sin actividad registrada todavía.</div>';
  } catch (err) { console.error(err); }
}

init();
