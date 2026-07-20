import { renderLayout } from './layout.js';
import { inicializarApp } from './main.js';
import {
  obtenerEmpresasDelAgente, listarAgentesDeEmpresa, listarDepartamentos,
  listarProyectos, dashboardEjecutivo, obtenerTareas, reportePersonal
} from './supabase-data.js';
import {
  $, escapeHTML, descargarCSV, iniciales, formatearFecha,
  ETIQUETAS_ESTADO, ETIQUETAS_PRIORIDAD, esVencida, crearMultiSelect
} from './utils.js';

/* ── Estado global ──────────────────────────────────────────────────────────── */
let EMPRESA_ID, AGENTE;
let todasEmpresas = [], todosAgentes = [], todosProyectos = [];
let msEmpresa, msAgente, msEstado;
let tabActiva = 'resumen';

/* Filtros activos */
const F = {
  empresa_ids: [],
  agente_ids: [],
  estados: [],
  proyecto_id: '',
  departamento_id: '',
  fecha_desde: '',
  fecha_hasta: '',
};

/* ── Plantilla HTML ─────────────────────────────────────────────────────────── */
function plantilla() {
  return `
  <div class="page-header">
    <div>
      <h1>Reportes & Analítica</h1>
      <p class="page-header__subtitle">Datos en tiempo real con filtros avanzados.</p>
    </div>
    <button class="btn btn-secondary" id="btn-export-tabla">⬇️ Exportar CSV</button>
  </div>

  <!-- FILTROS -->
  <div class="card" style="margin-bottom:var(--space-5); padding:var(--space-4);">
    <div style="display:flex; flex-wrap:wrap; gap:var(--space-3); align-items:flex-end;">
      <div>
        <div style="font-size:var(--fs-xs); color:var(--text-tertiary); font-weight:600; margin-bottom:4px;">EMPRESA</div>
        <div id="filtro-empresa"></div>
      </div>
      <div>
        <div style="font-size:var(--fs-xs); color:var(--text-tertiary); font-weight:600; margin-bottom:4px;">AGENTE</div>
        <div id="filtro-agente"></div>
      </div>
      <div>
        <div style="font-size:var(--fs-xs); color:var(--text-tertiary); font-weight:600; margin-bottom:4px;">ESTADO</div>
        <div id="filtro-estado"></div>
      </div>
      <div>
        <div style="font-size:var(--fs-xs); color:var(--text-tertiary); font-weight:600; margin-bottom:4px;">DEPARTAMENTO</div>
        <select class="form-control" id="filtro-dpto" style="height:34px; font-size:var(--fs-sm);">
          <option value="">Todos</option>
        </select>
      </div>
      <div>
        <div style="font-size:var(--fs-xs); color:var(--text-tertiary); font-weight:600; margin-bottom:4px;">PROYECTO</div>
        <select class="form-control" id="filtro-proyecto" style="height:34px; font-size:var(--fs-sm);">
          <option value="">Todos</option>
        </select>
      </div>
      <div>
        <div style="font-size:var(--fs-xs); color:var(--text-tertiary); font-weight:600; margin-bottom:4px;">DESDE</div>
        <input type="date" class="form-control" id="filtro-desde" style="height:34px; font-size:var(--fs-sm);" />
      </div>
      <div>
        <div style="font-size:var(--fs-xs); color:var(--text-tertiary); font-weight:600; margin-bottom:4px;">HASTA</div>
        <input type="date" class="form-control" id="filtro-hasta" style="height:34px; font-size:var(--fs-sm);" />
      </div>
      <button class="btn btn-primary btn-sm" id="btn-aplicar" style="height:34px;">Aplicar filtros</button>
      <button class="btn btn-secondary btn-sm" id="btn-limpiar" style="height:34px;">Limpiar</button>
    </div>
  </div>

  <!-- TABS -->
  <div class="tabs" style="margin-bottom:var(--space-5);">
    <div class="tab active" data-tab="resumen">📊 Resumen</div>
    <div class="tab" data-tab="tabla">📋 Lista de tareas</div>
    <div class="tab" data-tab="proyecto">📁 Por proyecto</div>
    <div class="tab" data-tab="personal">👤 Personal</div>
  </div>

  <!-- TAB: RESUMEN -->
  <div id="tab-resumen">
    <div id="resumen-stats" class="grid-cards" style="margin-bottom:var(--space-5);"><div class="loading-spinner"></div></div>
    <div class="card" style="margin-bottom:var(--space-5);">
      <div class="card__header">
        <h3 class="card__title">Distribución por estado</h3>
      </div>
      <div id="resumen-barras" style="padding:var(--space-4);"></div>
    </div>
    <div class="card">
      <div class="card__header"><h3 class="card__title">Carga de trabajo por agente</h3></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Agente</th><th>Total</th><th>Nuevo</th><th>En progreso</th><th>En revisión</th><th>Completadas</th><th>Vencidas</th></tr></thead>
          <tbody id="tabla-carga"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- TAB: TABLA -->
  <div id="tab-tabla" style="display:none;">
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Tareas <span id="tabla-count" style="color:var(--text-tertiary); font-size:var(--fs-sm);"></span></h3>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Estado</th>
              <th>Prioridad</th>
              <th>Tipo</th>
              <th>Proyecto</th>
              <th>Empresa</th>
              <th>Asignados</th>
              <th>Fecha cierre</th>
            </tr>
          </thead>
          <tbody id="tabla-tareas"></tbody>
        </table>
      </div>
      <div id="tabla-paginacion" style="display:flex; justify-content:center; gap:var(--space-2); padding:var(--space-4);"></div>
    </div>
  </div>

  <!-- TAB: PROYECTO -->
  <div id="tab-proyecto" style="display:none;">
    <div style="display:flex; align-items:center; gap:var(--space-3); margin-bottom:var(--space-5);">
      <div class="form-group" style="margin:0; flex:1; max-width:400px;">
        <label class="form-label">Selecciona un proyecto</label>
        <select class="form-control" id="select-proyecto-rep"></select>
      </div>
    </div>
    <div id="proyecto-stats" class="grid-cards" style="margin-bottom:var(--space-5);"></div>
    <div class="card">
      <div class="card__header"><h3 class="card__title">Tareas del proyecto</h3></div>
      <div id="proyecto-tareas"></div>
    </div>
  </div>

  <!-- TAB: PERSONAL -->
  <div id="tab-personal" style="display:none;">
    <div id="personal-stats" class="grid-cards" style="margin-bottom:var(--space-5);"></div>
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Mis tareas pendientes</h3>
        <button class="btn btn-secondary btn-sm" id="btn-export-personal">⬇️ Exportar CSV</button>
      </div>
      <div id="lista-personal"></div>
    </div>
  </div>
  `;
}

/* ── Leer filtros del DOM ───────────────────────────────────────────────────── */
function leerFiltros() {
  F.empresa_ids = msEmpresa?.getSelected() ?? [EMPRESA_ID];
  F.agente_ids  = msAgente?.getSelected()  ?? [];
  F.estados     = msEstado?.getSelected()  ?? [];
  F.departamento_id = $('#filtro-dpto')?.value ?? '';
  F.proyecto_id     = $('#filtro-proyecto')?.value ?? '';
  F.fecha_desde     = $('#filtro-desde')?.value ?? '';
  F.fecha_hasta     = $('#filtro-hasta')?.value ?? '';

  // Si no seleccionaron empresa, usar la activa
  if (!F.empresa_ids.length) F.empresa_ids = [EMPRESA_ID];
}

function filtrosParaObtenerTareas() {
  const f = {};
  if (F.empresa_ids.length)  f.empresa_ids   = F.empresa_ids;
  if (F.agente_ids.length)   f.agente_ids    = F.agente_ids;
  if (F.estados.length)      f.estados       = F.estados;
  if (F.proyecto_id)         f.proyecto_id   = F.proyecto_id;
  if (F.fecha_desde)         f.fecha_desde   = F.fecha_desde;
  if (F.fecha_hasta)         f.fecha_hasta   = F.fecha_hasta;
  return f;
}

/* ── Cargar opciones de filtro ──────────────────────────────────────────────── */
async function cargarFiltros() {
  // Multi-select empresa
  const empresaWrap = $('#filtro-empresa');
  msEmpresa = crearMultiSelect({
    placeholder: 'Empresas',
    options: todasEmpresas.map((e) => ({ value: e.id, label: e.nombre })),
    onChange: () => actualizarAgentesYProyectos(),
  });
  msEmpresa.setSelected([EMPRESA_ID]);
  empresaWrap.appendChild(msEmpresa.el);

  // Multi-select agente (se recarga según empresa)
  const agenteWrap = $('#filtro-agente');
  msAgente = crearMultiSelect({ placeholder: 'Agentes', options: [], onChange: () => {} });
  agenteWrap.appendChild(msAgente.el);

  // Multi-select estado
  const estadoWrap = $('#filtro-estado');
  msEstado = crearMultiSelect({
    placeholder: 'Estados',
    options: Object.entries(ETIQUETAS_ESTADO).map(([v, l]) => ({ value: v, label: l })),
    onChange: () => {},
  });
  estadoWrap.appendChild(msEstado.el);

  await actualizarAgentesYProyectos();
}

async function actualizarAgentesYProyectos() {
  const eIds = msEmpresa?.getSelected();
  const empId = eIds?.length ? eIds[0] : EMPRESA_ID;

  const [agentes, dptos, proyectos] = await Promise.all([
    listarAgentesDeEmpresa(empId),
    listarDepartamentos(empId),
    listarProyectos(empId),
  ]);
  todosAgentes   = agentes;
  todosProyectos = proyectos;

  msAgente?.setOptions(agentes.map((a) => ({ value: a.agente.id, label: a.agente.nombre })));

  // Departamentos
  const selDpto = $('#filtro-dpto');
  if (selDpto) {
    selDpto.innerHTML = '<option value="">Todos</option>' +
      dptos.map((d) => `<option value="${d.id}">${escapeHTML(d.nombre)}</option>`).join('');
    selDpto.onchange = filtrarProyectosPorDpto;
  }

  filtrarProyectosPorDpto();
}

function filtrarProyectosPorDpto() {
  const dptoId = $('#filtro-dpto')?.value ?? '';
  const lista = dptoId
    ? todosProyectos.filter((p) => p.departamento_id === dptoId)
    : todosProyectos;

  const sel = $('#filtro-proyecto');
  if (sel) {
    sel.innerHTML = '<option value="">Todos</option>' +
      lista.map((p) => `<option value="${p.id}">${escapeHTML(p.nombre)}</option>`).join('');
  }

  // Actualizar también select de tab proyecto
  const selRep = $('#select-proyecto-rep');
  if (selRep) {
    selRep.innerHTML = lista.map((p) => `<option value="${p.id}">${escapeHTML(p.nombre)}</option>`).join('');
  }
}

/* ── Cargar todo ────────────────────────────────────────────────────────────── */
let paginaTabla = 0;
const PAGE_SIZE = 25;

async function cargarTodo() {
  paginaTabla = 0;
  if (tabActiva === 'resumen')  await cargarResumen();
  if (tabActiva === 'tabla')    await cargarTabla();
  if (tabActiva === 'proyecto') await cargarTabProyecto();
  if (tabActiva === 'personal') await cargarPersonal();
}

/* ── Tab Resumen ────────────────────────────────────────────────────────────── */
async function cargarResumen() {
  const empId = F.empresa_ids[0] ?? EMPRESA_ID;
  const resumen = await dashboardEjecutivo(empId);

  const estados = ['nuevo', 'en_progreso', 'en_revision', 'completado', 'archivado'];
  const colores = {
    nuevo: 'var(--text-tertiary)',
    en_progreso: 'var(--color-accent)',
    en_revision: '#f59e0b',
    completado: 'var(--color-success)',
    archivado: 'var(--text-secondary)',
  };

  // Stats cards
  $('#resumen-stats').innerHTML = `
    <div class="card stat-card">
      <div class="stat-card__value">${resumen.totalTareas}</div>
      <div class="stat-card__label">Total tareas</div>
    </div>
    <div class="card stat-card">
      <div class="stat-card__value" style="color:var(--color-danger)">${resumen.tareasVencidas}</div>
      <div class="stat-card__label">Vencidas</div>
    </div>
    <div class="card stat-card">
      <div class="stat-card__value" style="color:var(--color-accent)">${resumen.porEstado.en_progreso || 0}</div>
      <div class="stat-card__label">En progreso</div>
    </div>
    <div class="card stat-card">
      <div class="stat-card__value" style="color:#f59e0b">${resumen.porEstado.en_revision || 0}</div>
      <div class="stat-card__label">En revisión</div>
    </div>
    <div class="card stat-card">
      <div class="stat-card__value" style="color:var(--color-success)">${resumen.porEstado.completado || 0}</div>
      <div class="stat-card__label">Completadas</div>
    </div>
    <div class="card stat-card">
      <div class="stat-card__value">${resumen.porEstado.nuevo || 0}</div>
      <div class="stat-card__label">Nuevas</div>
    </div>
  `;

  // Barras de distribución
  const total = resumen.totalTareas || 1;
  $('#resumen-barras').innerHTML = estados.map((est) => {
    const cant = resumen.porEstado[est] || 0;
    const pct  = Math.round((cant / total) * 100);
    return `
      <div style="margin-bottom:var(--space-3);">
        <div style="display:flex; justify-content:space-between; font-size:var(--fs-sm); margin-bottom:6px;">
          <span style="font-weight:600; color:${colores[est]}">${ETIQUETAS_ESTADO[est]}</span>
          <span style="color:var(--text-tertiary);">${cant} (${pct}%)</span>
        </div>
        <div style="background:var(--border-subtle); border-radius:4px; height:8px;">
          <div style="background:${colores[est]}; width:${pct}%; height:8px; border-radius:4px; transition:width .4s;"></div>
        </div>
      </div>`;
  }).join('');

  // Tabla carga por agente
  $('#tabla-carga').innerHTML = resumen.cargaPorAgente.map((c) => `
    <tr>
      <td style="display:flex; align-items:center; gap:var(--space-2);">
        <div class="avatar">${iniciales(c.agente?.nombre || '?')}</div>
        ${escapeHTML(c.agente?.nombre || 'Desconocido')}
      </td>
      <td>${c.total_asignadas}</td>
      <td>${c.pendientes ?? 0}</td>
      <td>${c.en_progreso ?? 0}</td>
      <td>${(c.total_asignadas - (c.pendientes ?? 0) - (c.en_progreso ?? 0) - (c.completadas ?? 0)) > 0
        ? (c.total_asignadas - (c.pendientes ?? 0) - (c.en_progreso ?? 0) - (c.completadas ?? 0))
        : 0}</td>
      <td style="color:var(--color-success)">${c.completadas ?? 0}</td>
      <td style="color:${(c.vencidas ?? 0) > 0 ? 'var(--color-danger)' : 'inherit'}">${c.vencidas ?? 0}</td>
    </tr>`).join('')
    || '<tr><td colspan="7" style="text-align:center; color:var(--text-tertiary);">Sin datos de carga de trabajo.</td></tr>';

  // Export CSV
  $('#btn-export-tabla').onclick = () => descargarCSV('reportes.csv', resumen.cargaPorAgente.map((c) => ({
    agente: c.agente?.nombre, total: c.total_asignadas,
    nuevo: c.pendientes, en_progreso: c.en_progreso,
    completadas: c.completadas, vencidas: c.vencidas
  })));
}

/* ── Tab Lista de tareas ────────────────────────────────────────────────────── */
async function cargarTabla(pagina = 0) {
  const cuerpo = $('#tabla-tareas');
  const conteo = $('#tabla-count');
  if (!cuerpo) return;
  cuerpo.innerHTML = '<tr><td colspan="8"><div class="loading-spinner"></div></td></tr>';

  const { data, total } = await obtenerTareas(filtrosParaObtenerTareas(), pagina, PAGE_SIZE);

  if (conteo) conteo.textContent = `(${total} tareas)`;

  if (!data.length) {
    cuerpo.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-tertiary);">Sin tareas con los filtros actuales.</td></tr>';
    renderPaginacion(0, total, pagina);
    return;
  }

  cuerpo.innerHTML = data.map((t) => {
    const vencida = esVencida(t.fecha_cierre, t.estado);
    return `
    <tr>
      <td>
        <a href="tarea-detalle.html?id=${t.id}" style="font-weight:600; color:var(--text-primary); text-decoration:none;">
          ${escapeHTML(t.titulo)}
        </a>
        ${vencida ? '<span style="color:var(--color-danger); font-size:var(--fs-xs);"> ⚠ vencida</span>' : ''}
      </td>
      <td><span class="badge badge-estado-${t.estado}">${ETIQUETAS_ESTADO[t.estado] ?? t.estado}</span></td>
      <td><span class="badge badge-prioridad-${t.prioridad}">${ETIQUETAS_PRIORIDAD[t.prioridad] ?? t.prioridad}</span></td>
      <td style="font-size:var(--fs-xs); color:var(--text-secondary);">${t.es_cronologica ? '🔁 Recurrente' : '📌 Puntual'}</td>
      <td style="font-size:var(--fs-sm);">${escapeHTML(t.proyecto?.nombre ?? '—')}</td>
      <td style="font-size:var(--fs-xs); color:var(--text-secondary);">${escapeHTML(t.proyecto?.empresa?.nombre ?? '—')}</td>
      <td>
        <div style="display:flex; gap:4px; flex-wrap:wrap;">
          ${(t.asignados ?? []).map((a) => `<div class="avatar avatar--sm" title="${escapeHTML(a.agente?.nombre ?? '')}">${iniciales(a.agente?.nombre ?? '?')}</div>`).join('')}
        </div>
      </td>
      <td style="font-size:var(--fs-sm); color:${vencida ? 'var(--color-danger)' : 'var(--text-secondary)'};">${formatearFecha(t.fecha_cierre)}</td>
    </tr>`;
  }).join('');

  renderPaginacion(data.length, total, pagina);

  // Export CSV de la vista actual (sin paginación)
  $('#btn-export-tabla').onclick = async () => {
    const { data: todos } = await obtenerTareas(filtrosParaObtenerTareas(), 0, 500);
    descargarCSV('tareas-reporte.csv', todos.map((t) => ({
      titulo: t.titulo,
      estado: t.estado,
      prioridad: t.prioridad,
      tipo: t.es_cronologica ? 'recurrente' : 'puntual',
      proyecto: t.proyecto?.nombre,
      empresa: t.proyecto?.empresa?.nombre,
      fecha_cierre: t.fecha_cierre,
    })));
  };
}

function renderPaginacion(len, total, pagina) {
  const el = $('#tabla-paginacion');
  if (!el) return;
  const totalPags = Math.ceil(total / PAGE_SIZE);
  if (totalPags <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = Array.from({ length: totalPags }, (_, i) => `
    <button class="btn btn-sm ${i === pagina ? 'btn-primary' : 'btn-secondary'}" data-pag="${i}">${i + 1}</button>
  `).join('');
  el.querySelectorAll('button').forEach((btn) =>
    btn.addEventListener('click', () => cargarTabla(Number(btn.dataset.pag)))
  );
}

/* ── Tab Por proyecto ───────────────────────────────────────────────────────── */
async function cargarTabProyecto() {
  const proyectos = todosProyectos.length ? todosProyectos : await listarProyectos(EMPRESA_ID);
  const sel = $('#select-proyecto-rep');
  if (!sel) return;
  sel.innerHTML = proyectos.map((p) => `<option value="${p.id}">${escapeHTML(p.nombre)}</option>`).join('');
  sel.onchange = renderProyecto;
  if (proyectos.length) renderProyecto();
}

async function renderProyecto() {
  const id = $('#select-proyecto-rep')?.value;
  if (!id) return;
  const statsEl = $('#proyecto-stats');
  const tareasEl = $('#proyecto-tareas');
  if (statsEl) statsEl.innerHTML = '<div class="loading-spinner"></div>';
  if (tareasEl) tareasEl.innerHTML = '';

  const { data: tareas } = await obtenerTareas({ proyecto_id: id }, 0, 200);
  const completadas = tareas.filter((t) => t.estado === 'completado').length;
  const vencidas    = tareas.filter((t) => esVencida(t.fecha_cierre, t.estado)).length;
  const pct = tareas.length ? Math.round((completadas / tareas.length) * 100) : 0;
  const tEst = tareas.reduce((s, t) => s + (t.tiempo_estimado_horas || 0), 0);
  const tReal = tareas.reduce((s, t) => s + (Number(t.tiempo_real_horas) || 0), 0);

  if (statsEl) statsEl.innerHTML = `
    <div class="card stat-card"><div class="stat-card__value">${pct}%</div><div class="stat-card__label">Progreso</div></div>
    <div class="card stat-card"><div class="stat-card__value">${completadas}/${tareas.length}</div><div class="stat-card__label">Completadas / Total</div></div>
    <div class="card stat-card"><div class="stat-card__value" style="color:var(--color-danger)">${vencidas}</div><div class="stat-card__label">Vencidas</div></div>
    <div class="card stat-card"><div class="stat-card__value">${tEst}h</div><div class="stat-card__label">Tiempo estimado</div></div>
    <div class="card stat-card"><div class="stat-card__value">${tReal.toFixed(1)}h</div><div class="stat-card__label">Tiempo real</div></div>
  `;

  if (tareasEl) {
    tareasEl.innerHTML = tareas.length
      ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>Título</th><th>Estado</th><th>Prioridad</th><th>Asignados</th><th>Fecha cierre</th></tr></thead>
          <tbody>
            ${tareas.map((t) => `
              <tr>
                <td><a href="tarea-detalle.html?id=${t.id}" style="color:var(--text-primary); font-weight:600;">${escapeHTML(t.titulo)}</a></td>
                <td><span class="badge badge-estado-${t.estado}">${ETIQUETAS_ESTADO[t.estado] ?? t.estado}</span></td>
                <td><span class="badge badge-prioridad-${t.prioridad}">${ETIQUETAS_PRIORIDAD[t.prioridad] ?? t.prioridad}</span></td>
                <td>${(t.asignados ?? []).map((a) => `<span style="font-size:var(--fs-xs);">${escapeHTML(a.agente?.nombre ?? '')}</span>`).join(', ')}</td>
                <td style="font-size:var(--fs-sm); color:${esVencida(t.fecha_cierre, t.estado) ? 'var(--color-danger)' : 'var(--text-secondary)'};">${formatearFecha(t.fecha_cierre)}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>`
      : '<p style="padding:var(--space-4); color:var(--text-tertiary);">Sin tareas en este proyecto.</p>';
  }
}

/* ── Tab Personal ───────────────────────────────────────────────────────────── */
async function cargarPersonal() {
  const r = await reportePersonal(AGENTE.id);
  const completadosRecientes = r.completadas.slice(-5).reverse();

  $('#personal-stats').innerHTML = `
    <div class="card stat-card"><div class="stat-card__value" style="color:var(--color-success)">${r.totalCompletadas}</div><div class="stat-card__label">Completadas</div></div>
    <div class="card stat-card"><div class="stat-card__value">${r.totalPendientes}</div><div class="stat-card__label">Pendientes</div></div>
    <div class="card stat-card">
      <div class="stat-card__value">${r.completadas.reduce((s, t) => s + (Number(t.tiempo_real_horas) || 0), 0).toFixed(1)}h</div>
      <div class="stat-card__label">Horas registradas</div>
    </div>
  `;

  const lista = r.pendientes;
  $('#lista-personal').innerHTML = lista.length
    ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Título</th><th>Estado</th><th>Fecha cierre</th></tr></thead>
        <tbody>
          ${lista.map((t) => `
            <tr>
              <td style="font-weight:600;">${escapeHTML(t.titulo)}</td>
              <td><span class="badge badge-estado-${t.estado}">${ETIQUETAS_ESTADO[t.estado] ?? t.estado}</span></td>
              <td style="font-size:var(--fs-sm); color:${esVencida(t.fecha_cierre, t.estado) ? 'var(--color-danger)' : 'var(--text-secondary)'};">${formatearFecha(t.fecha_cierre)}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>`
    : '<p style="padding:var(--space-4); color:var(--text-tertiary);">Sin tareas pendientes. 🎉</p>';

  $('#btn-export-personal').onclick = () => descargarCSV('mis-tareas.csv', lista.map((t) => ({
    titulo: t.titulo, estado: t.estado, fecha_cierre: t.fecha_cierre
  })));
}

/* ── Tabs ───────────────────────────────────────────────────────────────────── */
function bindTabs() {
  document.querySelectorAll('.tab').forEach((tab) =>
    tab.addEventListener('click', async () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      tabActiva = tab.dataset.tab;
      ['resumen', 'tabla', 'proyecto', 'personal'].forEach((id) => {
        const el = document.getElementById('tab-' + id);
        if (el) el.style.display = id === tabActiva ? 'block' : 'none';
      });
      leerFiltros();
      await cargarTodo();
    })
  );
}

/* ── Leer hash y pre-seleccionar filtro de estado ───────────────────────────── */
function aplicarHash() {
  const hash = location.hash.replace('#', '');
  const mapHash = { vencidas: null, completadas: 'completado', en_progreso: 'en_progreso' };
  if (hash in mapHash) {
    const estado = mapHash[hash];
    if (estado) msEstado?.setSelected([estado]);
  }
}

/* ── Init ───────────────────────────────────────────────────────────────────── */
async function init() {
  renderLayout('reportes');
  const ctx = await inicializarApp();
  if (!ctx) return;
  AGENTE = ctx.agente; EMPRESA_ID = ctx.empresaId;

  const main = document.getElementById('main-content');
  if (!EMPRESA_ID) {
    main.innerHTML = '<div class="empty-state"><h3>Crea o selecciona una empresa primero.</h3></div>';
    return;
  }

  // Cargar empresas del agente
  todasEmpresas = await obtenerEmpresasDelAgente(AGENTE.id);

  main.innerHTML = plantilla();
  bindTabs();
  await cargarFiltros();

  // Inicializar filtros por defecto
  F.empresa_ids = [EMPRESA_ID];

  // Aplicar hash de URL si viene del dashboard
  aplicarHash();

  // Botones de filtro
  $('#btn-aplicar').addEventListener('click', async () => {
    leerFiltros();
    await cargarTodo();
  });
  $('#btn-limpiar').addEventListener('click', async () => {
    msEmpresa?.setSelected([EMPRESA_ID]);
    msAgente?.clear?.();
    msEstado?.clear?.();
    if ($('#filtro-dpto')) $('#filtro-dpto').value = '';
    if ($('#filtro-proyecto')) $('#filtro-proyecto').value = '';
    if ($('#filtro-desde')) $('#filtro-desde').value = '';
    if ($('#filtro-hasta')) $('#filtro-hasta').value = '';
    F.empresa_ids = [EMPRESA_ID];
    F.agente_ids = []; F.estados = [];
    F.departamento_id = ''; F.proyecto_id = '';
    F.fecha_desde = ''; F.fecha_hasta = '';
    await cargarTodo();
  });

  // Cargar tab inicial
  await cargarResumen();
}

init();
