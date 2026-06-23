import { renderLayout } from './layout.js';
import { inicializarApp, toastError } from './main.js';
import { dashboardEjecutivo, obtenerTareasDelAgente, actividadRecienteProyecto, listarProyectos, obtenerProgresoProyectos } from './supabase-data.js';
import { formatearFecha, tiempoRelativo, escapeHTML, ETIQUETAS_ESTADO, ETIQUETAS_PRIORIDAD, esVencida } from './utils.js';

async function init() {
  renderLayout('dashboard');
  const ctx = await inicializarApp();
  if (!ctx) return;
  const { agente, empresaId } = ctx;

  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Hola, ${escapeHTML(agente.nombre.split(' ')[0])} 👋</h1>
        <p class="page-header__subtitle">Esto es lo que pasa en tu empresa hoy, ${formatearFecha(new Date().toISOString())}.</p>
      </div>
      <a href="pages/tareas.html" class="btn btn-primary">+ Nueva tarea</a>
    </div>

    <div class="grid-cards" style="margin-bottom: var(--space-6);" id="stats-grid">
      ${Array.from({length:4}).map(() => `<div class="card stat-card"><div class="skeleton" style="height:32px;width:60%;"></div><div class="skeleton" style="height:14px;width:80%;margin-top:8px;"></div></div>`).join('')}
    </div>

    <div style="display:grid; grid-template-columns: 1.4fr 1fr; gap: var(--space-5);" id="dashboard-cols">
      <div class="card">
        <div class="card__header"><h3 class="card__title">Mis tareas próximas</h3><a href="pages/pendientes.html">Ver todas</a></div>
        <div id="tareas-proximas"><div class="loading-spinner"></div></div>
      </div>
      <div class="card">
        <div class="card__header"><h3 class="card__title">Progreso de proyectos</h3><a href="pages/proyectos.html">Ver todos</a></div>
        <div id="progreso-proyectos"><div class="loading-spinner"></div></div>
      </div>
    </div>
  `;

  if (!empresaId) {
    main.innerHTML += `<div class="empty-state" style="margin-top:var(--space-6);">
      <div class="empty-state__icon">🏢</div>
      <h3>Aún no perteneces a ninguna empresa</h3>
      <p>Crea tu primera empresa para empezar a organizar proyectos y tareas.</p>
      <a href="pages/empresas.html" class="btn btn-primary" style="margin-top:var(--space-4);">Crear empresa</a>
    </div>`;
    return;
  }

  try {
    const [resumen, misTareas, proyectos] = await Promise.all([
      dashboardEjecutivo(empresaId),
      obtenerTareasDelAgente(agente.id),
      obtenerProgresoProyectos(empresaId)
    ]);

    document.getElementById('stats-grid').innerHTML = `
      <div class="card stat-card">
        <div class="stat-card__value">${resumen.totalTareas}</div>
        <div class="stat-card__label">Tareas totales</div>
      </div>
      <div class="card stat-card">
        <div class="stat-card__value" style="color:var(--color-danger)">${resumen.tareasVencidas}</div>
        <div class="stat-card__label">Tareas vencidas</div>
      </div>
      <div class="card stat-card">
        <div class="stat-card__value" style="color:var(--color-success)">${resumen.porEstado.completado || 0}</div>
        <div class="stat-card__label">Completadas</div>
      </div>
      <div class="card stat-card">
        <div class="stat-card__value" style="color:var(--color-accent)">${resumen.porEstado.en_progreso || 0}</div>
        <div class="stat-card__label">En progreso</div>
      </div>
    `;

    const proximas = misTareas
      .filter((t) => t.tarea && t.tarea.estado !== 'completado')
      .sort((a, b) => new Date(a.tarea.fecha_cierre || '2999-01-01') - new Date(b.tarea.fecha_cierre || '2999-01-01'))
      .slice(0, 6);

    document.getElementById('tareas-proximas').innerHTML = proximas.length
      ? proximas.map((r) => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:var(--space-3) 0; border-bottom:1px solid var(--border-subtle);">
          <div>
            <div style="font-weight:600; font-size:var(--fs-sm);">${escapeHTML(r.tarea.titulo)}</div>
            <div style="font-size:var(--fs-xs); color:${esVencida(r.tarea.fecha_cierre, r.tarea.estado) ? 'var(--color-danger)' : 'var(--text-tertiary)'};">
              ${r.tarea.fecha_cierre ? formatearFecha(r.tarea.fecha_cierre) : 'Sin fecha'} · ${r.tarea.proyecto?.nombre || 'Sin proyecto'}
            </div>
          </div>
          <span class="badge badge-prioridad-${r.tarea.prioridad}">${ETIQUETAS_PRIORIDAD[r.tarea.prioridad]}</span>
        </div>`).join('')
      : '<div class="empty-state"><div class="empty-state__icon">🎉</div>No tienes tareas pendientes.</div>';

    document.getElementById('progreso-proyectos').innerHTML = proyectos.length
      ? proyectos.slice(0, 6).map((p) => `
        <div style="margin-bottom: var(--space-4);">
          <div style="display:flex; justify-content:space-between; font-size:var(--fs-sm); margin-bottom:var(--space-2);">
            <span style="font-weight:600;">${escapeHTML(p.nombre)}</span>
            <span style="color:var(--text-tertiary);">${p.porcentaje_progreso}%</span>
          </div>
          <div class="progress-bar"><div class="progress-bar__fill" style="width:${p.porcentaje_progreso}%;"></div></div>
        </div>`).join('')
      : '<div class="empty-state">Sin proyectos aún.</div>';
  } catch (err) {
    console.error(err);
    toastError('No se pudo cargar el dashboard. Verifica tu conexión con Supabase.');
  }
}

init();
