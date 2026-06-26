import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import {
  obtenerTareas, crearTarea, actualizarTarea, eliminarTarea, cambiarEstadoTarea,
  listarProyectos, listarAgentesDeEmpresa, obtenerEmpresasDelAgente, listarTodosLosProyectos
} from './supabase-data.js';
import {
  $, $$, qs, escapeHTML, formatearFecha, esVencida,
  ETIQUETAS_ESTADO, ETIQUETAS_PRIORIDAD, iniciales, debounce, crearMultiSelect
} from './utils.js';

let EMPRESA_ID, AGENTE;
let EMPRESAS      = [];   // Todas las empresas del usuario
let TODOS_PROYECTOS = []; // Proyectos de todas las empresas
let AGENTES_EMPRESA = []; // Agentes de la empresa activa en el modal

let VISTA = 'tabla';
let PAGINA = 0;
const ESTADOS = ['nuevo', 'en_progreso', 'en_revision', 'completado', 'archivado'];

// Multiselect instances (toolbar)
let msEmpresas, msProyectos, msEstados, msPrioridades;

/* ============================================================
   PLANTILLA
   ============================================================ */
function plantilla() {
  return `
    <div class="page-header">
      <div><h1>Tareas</h1><p class="page-header__subtitle">Actividades puntuales y cronológicas de tu empresa.</p></div>
      <button class="btn btn-primary" id="btn-nueva">+ Nueva tarea</button>
    </div>

    <div class="table-toolbar" style="flex-wrap:wrap; gap:var(--space-2);">
      <input class="form-control" id="filtro-busqueda" placeholder="Buscar por título…" style="min-width:200px; flex:1;" />
      <div id="slot-ms-empresas"></div>
      <div id="slot-ms-proyectos"></div>
      <div id="slot-ms-estados"></div>
      <div id="slot-ms-prioridades"></div>
      <div class="tabs" style="border-bottom:none; margin:0;">
        <div class="tab ${VISTA === 'tabla' ? 'active' : ''}" data-vista="tabla">📋 Tabla</div>
        <div class="tab ${VISTA === 'kanban' ? 'active' : ''}" data-vista="kanban">🗂️ Kanban</div>
      </div>
    </div>

    <div id="vista-contenedor"><div class="loading-spinner"></div></div>
    <div class="pagination" id="paginacion" style="display:none;"></div>

    <!-- Modal crear / editar tarea -->
    <div class="modal-overlay" id="modal-tarea">
      <div class="modal modal--lg">
        <div class="modal__header">
          <h3 id="modal-tarea-titulo">Nueva tarea</h3>
          <button class="btn-icon" data-close>✕</button>
        </div>
        <form id="form-tarea">
          <div class="modal__body">
            <input type="hidden" id="tarea-id" />

            <!-- Selector de empresa -->
            <div class="form-group">
              <label class="form-label">Empresa</label>
              <select class="form-control" id="tarea-empresa"></select>
            </div>

            <div class="form-group">
              <label class="form-label">Título</label>
              <input class="form-control" id="tarea-titulo" required />
            </div>
            <div class="form-group">
              <label class="form-label">Descripción</label>
              <textarea class="form-control" id="tarea-descripcion"></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Proyecto</label>
                <select class="form-control" id="tarea-proyecto">
                  <option value="">Sin proyecto</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Prioridad</label>
                <select class="form-control" id="tarea-prioridad">
                  ${Object.entries(ETIQUETAS_PRIORIDAD).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-group checkbox-row">
              <input type="checkbox" id="tarea-cronologica" />
              <label for="tarea-cronologica">Es recordatorio cronológico (sin fecha de cierre fija)</label>
            </div>

            <div id="campos-puntual" class="form-row">
              <div class="form-group">
                <label class="form-label">Fecha de inicio</label>
                <input class="form-control" type="date" id="tarea-fecha-inicio" />
              </div>
              <div class="form-group">
                <label class="form-label">Fecha de cierre</label>
                <input class="form-control" type="date" id="tarea-fecha-cierre" />
              </div>
            </div>

            <div id="campos-cronologica" style="display:none;">
              <div class="form-group">
                <label class="form-label">Frecuencia</label>
                <select class="form-control" id="tarea-frecuencia">
                  <option value="diaria">Diaria</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensual">Mensual</option>
                </select>
              </div>
              <div class="form-group" id="grupo-dias-semana">
                <label class="form-label">Días de la semana</label>
                <div style="display:flex; gap:var(--space-2); flex-wrap:wrap;">
                  ${['lunes','martes','miercoles','jueves','viernes','sabado','domingo'].map((d) => `
                    <label class="checkbox-row" style="background:var(--bg-surface-raised); padding:var(--space-2) var(--space-3); border-radius:var(--radius-sm);">
                      <input type="checkbox" value="${d}" class="dia-semana" /> ${d}
                    </label>`).join('')}
                </div>
              </div>
              <div class="form-group" id="grupo-dia-mes" style="display:none;">
                <label class="form-label">Día del mes</label>
                <input class="form-control" type="number" min="1" max="31" id="tarea-dia-mes" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Tiempo estimado (horas)</label>
                <input class="form-control" type="number" min="0" id="tarea-tiempo-estimado" />
              </div>
              <div class="form-group">
                <label class="form-label">Etiquetas (separadas por coma)</label>
                <input class="form-control" id="tarea-etiquetas" placeholder="urgente, cliente-x" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Asignar agentes</label>
              <div id="lista-asignar-agentes" style="display:flex; flex-wrap:wrap; gap:var(--space-2);"></div>
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar tarea</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Panel lateral detalle -->
    <div class="side-panel-overlay" id="panel-overlay"></div>
    <aside class="side-panel" id="panel-tarea">
      <div class="side-panel__header">
        <h3 id="panel-titulo">Detalle de tarea</h3>
        <button class="btn-icon" id="btn-cerrar-panel">✕</button>
      </div>
      <div class="side-panel__body" id="panel-body"></div>
      <div class="side-panel__footer">
        <a class="btn btn-secondary" id="btn-editar-completo">Editar tarea</a>
        <button class="btn btn-danger" id="btn-eliminar-tarea">Eliminar</button>
      </div>
    </aside>
  `;
}

/* ============================================================
   HELPERS UI
   ============================================================ */
function badgeEstado(t) {
  const vencida = esVencida(t.fecha_cierre, t.estado);
  return `<span class="badge badge-estado-${t.estado}" ${vencida ? 'style="color:var(--color-danger)"' : ''}>${ETIQUETAS_ESTADO[t.estado]}</span>`;
}

function avataresAsignados(asignados = []) {
  return `<div class="avatar-group">${asignados.slice(0, 3).map((a) =>
    `<div class="avatar" title="${escapeHTML(a.agente?.nombre || '')}">${iniciales(a.agente?.nombre || '?')}</div>`
  ).join('')}</div>`;
}

/* ============================================================
   FILTROS (toolbar)
   ============================================================ */
function filtrosActuales() {
  return {
    empresa_ids:  msEmpresas?.getSelected()  ?? [],
    proyecto_ids: msProyectos?.getSelected() ?? [],
    estados:      msEstados?.getSelected()   ?? [],
    prioridades:  msPrioridades?.getSelected() ?? [],
    busqueda:     $('#filtro-busqueda')?.value.trim() || undefined
  };
}

/* ── Popula multiselect de proyectos según empresas seleccionadas ── */
function actualizarMsProyectos() {
  const empresasSeleccionadas = msEmpresas.getSelected();
  const proyectosFiltrados = empresasSeleccionadas.length
    ? TODOS_PROYECTOS.filter((p) => empresasSeleccionadas.includes(p.empresa_id))
    : TODOS_PROYECTOS;

  msProyectos.setOptions(
    proyectosFiltrados.map((p) => ({
      value: p.id,
      label: empresasSeleccionadas.length !== 1
        ? `${escapeHTML(p.nombre)} (${escapeHTML(p.empresa?.nombre || '')})`
        : escapeHTML(p.nombre)
    }))
  );
}

/* ============================================================
   CARGA DE DATOS PARA EL MODAL
   ============================================================ */
async function cargarDatosModalEmpresa(empresaId) {
  const [proyectos, agentes] = await Promise.all([
    listarProyectos(empresaId),
    listarAgentesDeEmpresa(empresaId)
  ]);
  AGENTES_EMPRESA = agentes;

  $('#tarea-proyecto').innerHTML =
    '<option value="">Sin proyecto</option>' +
    proyectos.map((p) => `<option value="${p.id}">${escapeHTML(p.nombre)}</option>`).join('');

  $('#lista-asignar-agentes').innerHTML = agentes.map((a) => `
    <label class="checkbox-row" style="background:var(--bg-surface-raised); padding:var(--space-2) var(--space-3); border-radius:var(--radius-sm);">
      <input type="checkbox" value="${a.agente.id}" class="agente-check" /> ${escapeHTML(a.agente.nombre)}
    </label>`).join('');
}

function llenarSelectorEmpresaModal(selectedId) {
  $('#tarea-empresa').innerHTML = EMPRESAS.map((e) =>
    `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHTML(e.nombre)}</option>`
  ).join('');
}

/* ============================================================
   VISTA TABLA / KANBAN
   ============================================================ */
async function cargarVista() {
  const cont = $('#vista-contenedor');
  cont.innerHTML = '<div class="loading-spinner"></div>';
  const { data, total } = await obtenerTareas(filtrosActuales(), PAGINA, 25);

  if (VISTA === 'tabla') {
    cont.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Título</th><th>Empresa / Proyecto</th><th>Estado</th><th>Prioridad</th><th>Asignados</th><th>Cierre</th></tr>
          </thead>
          <tbody>${data.length ? data.map((t) => `
            <tr class="${esVencida(t.fecha_cierre, t.estado) ? 'row-vencida' : ''}" data-abrir="${t.id}" style="cursor:pointer;">
              <td>${escapeHTML(t.titulo)} ${t.es_cronologica ? '🔁' : ''}</td>
              <td>
                ${t.proyecto ? `<div style="font-size:var(--fs-xs); color:var(--text-tertiary);">${escapeHTML(t.proyecto.empresa?.nombre || '')}</div><div><span style="color:${t.proyecto.color_etiqueta}">●</span> ${escapeHTML(t.proyecto.nombre)}</div>` : '—'}
              </td>
              <td>${badgeEstado(t)}</td>
              <td><span class="badge badge-prioridad-${t.prioridad}">${ETIQUETAS_PRIORIDAD[t.prioridad]}</span></td>
              <td>${avataresAsignados(t.asignados)}</td>
              <td>${t.fecha_cierre ? formatearFecha(t.fecha_cierre) : '—'}</td>
            </tr>`).join('') :
            '<tr><td colspan="6" style="text-align:center; color:var(--text-tertiary); padding:var(--space-6);">Sin tareas que coincidan con los filtros.</td></tr>'}
          </tbody>
        </table>
      </div>`;
    cont.querySelectorAll('[data-abrir]').forEach((tr) =>
      tr.addEventListener('click', () => abrirPanelTarea(tr.dataset.abrir)));
    renderPaginacion(total);
  } else {
    const { data: todas } = await obtenerTareas(filtrosActuales(), 0, 200);
    cont.innerHTML = `<div class="kanban">${ESTADOS.map((estado) => `
      <div class="kanban-column" data-estado="${estado}">
        <div class="kanban-column__title">
          <span>${ETIQUETAS_ESTADO[estado]}</span>
          <span class="badge badge-estado-${estado}">${todas.filter((t) => t.estado === estado).length}</span>
        </div>
        <div class="kanban-cards" data-drop="${estado}">
          ${todas.filter((t) => t.estado === estado).map((t) => `
            <div class="kanban-card" draggable="true" data-id="${t.id}" data-abrir="${t.id}">
              <div style="font-weight:600; font-size:var(--fs-sm); margin-bottom:var(--space-2);">${escapeHTML(t.titulo)}</div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="badge badge-prioridad-${t.prioridad}">${ETIQUETAS_PRIORIDAD[t.prioridad]}</span>
                ${avataresAsignados(t.asignados)}
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('')}</div>`;

    cont.querySelectorAll('[data-abrir]').forEach((c) =>
      c.addEventListener('click', (e) => { if (!c.classList.contains('dragging')) abrirPanelTarea(c.dataset.abrir); }));
    inicializarDragDropKanban();
    $('#paginacion').style.display = 'none';
  }
}

function inicializarDragDropKanban() {
  $$('.kanban-card').forEach((card) => {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  $$('.kanban-cards').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.closest('.kanban-column').classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.closest('.kanban-column').classList.remove('drag-over'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.closest('.kanban-column').classList.remove('drag-over');
      const id = $('.dragging')?.dataset.id;
      if (!id) return;
      const nuevoEstado = col.dataset.drop;
      try {
        await cambiarEstadoTarea(id, nuevoEstado, AGENTE.id);
        toastExito(`Tarea movida a "${ETIQUETAS_ESTADO[nuevoEstado]}".`);
        cargarVista();
      } catch (err) { toastError(err.message); }
    });
  });
}

function renderPaginacion(total) {
  const totalPaginas = Math.max(1, Math.ceil(total / 25));
  const el = $('#paginacion');
  el.style.display = 'flex';
  el.innerHTML = `
    <span style="color:var(--text-tertiary); font-size:var(--fs-sm);">${total} tarea(s) · página ${PAGINA + 1} de ${totalPaginas}</span>
    <div class="pagination__pages">
      <button class="btn btn-secondary btn-sm" id="btn-prev" ${PAGINA === 0 ? 'disabled' : ''}>← Anterior</button>
      <button class="btn btn-secondary btn-sm" id="btn-next" ${PAGINA >= totalPaginas - 1 ? 'disabled' : ''}>Siguiente →</button>
    </div>`;
  $('#btn-prev')?.addEventListener('click', () => { PAGINA--; cargarVista(); });
  $('#btn-next')?.addEventListener('click', () => { PAGINA++; cargarVista(); });
}

/* ============================================================
   PANEL LATERAL DE DETALLE
   ============================================================ */
async function abrirPanelTarea(id) {
  const { obtenerTarea, listarComentarios, crearComentario, listarHistorialTarea } = await import('./supabase-data.js');
  const tarea = await obtenerTarea(id);
  if (!tarea) return;

  $('#panel-titulo').textContent = tarea.titulo;
  $('#btn-editar-completo').href = `tarea-detalle.html?id=${id}`;
  $('#btn-eliminar-tarea').dataset.id = id;

  const comentarios = await listarComentarios(id);
  const { data: historial } = await listarHistorialTarea(id, 0, 10);

  $('#panel-body').innerHTML = `
    <div class="form-group">
      <label class="form-label">Estado</label>
      <select class="form-control" id="panel-estado">
        ${ESTADOS.map((e) => `<option value="${e}" ${e === tarea.estado ? 'selected' : ''}>${ETIQUETAS_ESTADO[e]}</option>`).join('')}
      </select>
    </div>
    <p>
      <span class="badge badge-prioridad-${tarea.prioridad}">${ETIQUETAS_PRIORIDAD[tarea.prioridad]}</span>
      ${tarea.es_cronologica ? '<span class="badge badge-estado-en_progreso">🔁 Cronológica</span>' : ''}
    </p>
    <p style="font-size:var(--fs-sm); color:var(--text-secondary); margin:var(--space-3) 0;">${escapeHTML(tarea.descripcion || 'Sin descripción.')}</p>
    <p style="font-size:var(--fs-xs); color:var(--text-tertiary);">Inicio: ${formatearFecha(tarea.fecha_inicio)} ${tarea.fecha_cierre ? '· Cierre: ' + formatearFecha(tarea.fecha_cierre) : ''}</p>
    <div style="margin:var(--space-3) 0;"><strong style="font-size:var(--fs-sm);">Asignados:</strong> ${avataresAsignados(tarea.asignados)}</div>
    <div style="margin:var(--space-3) 0;">${(tarea.etiquetas || []).map((e) => `<span class="badge badge-estado-archivado">${escapeHTML(e)}</span>`).join(' ')}</div>

    <h4 style="margin-top:var(--space-5);">Comentarios</h4>
    <div id="panel-comentarios" style="max-height:200px; overflow-y:auto; margin:var(--space-3) 0;">
      ${comentarios.length ? comentarios.map((c) => `
        <div style="display:flex; gap:var(--space-2); margin-bottom:var(--space-3);">
          <div class="avatar">${iniciales(c.agente?.nombre || '?')}</div>
          <div>
            <div style="font-size:var(--fs-xs); font-weight:600;">${escapeHTML(c.agente?.nombre || '')}</div>
            <div style="font-size:var(--fs-sm);">${escapeHTML(c.texto)}</div>
          </div>
        </div>`).join('') : '<p style="color:var(--text-tertiary); font-size:var(--fs-sm);">Sin comentarios.</p>'}
    </div>
    <form id="form-comentario" style="display:flex; gap:var(--space-2);">
      <input class="form-control" id="input-comentario" placeholder="Agregar comentario…" />
      <button class="btn btn-primary btn-sm" type="submit">Enviar</button>
    </form>

    <h4 style="margin-top:var(--space-5);">Historial</h4>
    <div style="font-size:var(--fs-xs); color:var(--text-tertiary);">
      ${historial.length ? historial.map((h) => `
        <div style="padding:var(--space-2) 0; border-bottom:1px solid var(--border-subtle);">
          ${escapeHTML(h.campo_modificado)}: ${escapeHTML(h.valor_antiguo || '—')} → ${escapeHTML(h.valor_nuevo || '—')}
        </div>`).join('') : 'Sin cambios registrados.'}
    </div>
  `;

  $('#panel-estado').addEventListener('change', async (e) => {
    try { await cambiarEstadoTarea(id, e.target.value, AGENTE.id); toastExito('Estado actualizado.'); cargarVista(); }
    catch (err) { toastError(err.message); }
  });
  $('#form-comentario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = $('#input-comentario').value.trim();
    if (!texto) return;
    try {
      await crearComentario({ tarea_id: id, agente_id: AGENTE.id, texto });
      $('#input-comentario').value = '';
      abrirPanelTarea(id);
    } catch (err) { toastError(err.message); }
  });

  $('#panel-tarea').classList.add('open');
  $('#panel-overlay').classList.add('open');
}

function cerrarPanel() {
  $('#panel-tarea').classList.remove('open');
  $('#panel-overlay').classList.remove('open');
}

/* ============================================================
   MODAL CREAR / EDITAR
   ============================================================ */
function toggleCamposCronologicos() {
  const es = $('#tarea-cronologica').checked;
  $('#campos-puntual').style.display = es ? 'none' : 'grid';
  $('#campos-cronologica').style.display = es ? 'block' : 'none';
}

function toggleFrecuencia() {
  const f = $('#tarea-frecuencia').value;
  $('#grupo-dias-semana').style.display = f === 'semanal' ? 'block' : 'none';
  $('#grupo-dia-mes').style.display     = f === 'mensual'  ? 'block' : 'none';
}

function resetFormulario() {
  $('#form-tarea').reset();
  $('#tarea-id').value = '';
  $('#tarea-fecha-inicio').value = new Date().toISOString().slice(0, 10);
  toggleCamposCronologicos();
  toggleFrecuencia();
}

/* ============================================================
   BIND
   ============================================================ */
function bind() {
  // Búsqueda con debounce
  $('#filtro-busqueda').addEventListener('input', debounce(() => { PAGINA = 0; cargarVista(); }, 350));

  // Tabs de vista
  $$('.tab[data-vista]').forEach((tab) =>
    tab.addEventListener('click', () => {
      VISTA = tab.dataset.vista;
      $$('.tab[data-vista]').forEach((t) => t.classList.toggle('active', t === tab));
      PAGINA = 0;
      cargarVista();
    }));

  // Panel lateral
  $('#btn-cerrar-panel').addEventListener('click', cerrarPanel);
  $('#panel-overlay').addEventListener('click', cerrarPanel);

  $('#btn-eliminar-tarea').addEventListener('click', async () => {
    const id = $('#btn-eliminar-tarea').dataset.id;
    const ok = await confirmar({ titulo: 'Eliminar tarea', mensaje: 'Esta acción no se puede deshacer.', peligro: true, textoConfirmar: 'Eliminar' });
    if (!ok) return;
    try { await eliminarTarea(id); toastExito('Tarea eliminada.'); cerrarPanel(); cargarVista(); }
    catch (err) { toastError(err.message); }
  });

  // Modal
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => cerrarModal('modal-tarea')));
  $('#tarea-cronologica').addEventListener('change', toggleCamposCronologicos);
  $('#tarea-frecuencia').addEventListener('change', toggleFrecuencia);

  // Cambio de empresa en modal → recargar proyectos y agentes
  $('#tarea-empresa').addEventListener('change', async (e) => {
    await cargarDatosModalEmpresa(e.target.value);
  });

  $('#btn-nueva').addEventListener('click', () => {
    $('#modal-tarea-titulo').textContent = 'Nueva tarea';
    llenarSelectorEmpresaModal(EMPRESA_ID);
    $('#tarea-empresa').disabled = false;
    resetFormulario();
    cargarDatosModalEmpresa(EMPRESA_ID);
    abrirModal('modal-tarea');
  });

  $('#form-tarea').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id              = $('#tarea-id').value;
    const empresaId       = $('#tarea-empresa').value || EMPRESA_ID;
    const esCronologica   = $('#tarea-cronologica').checked;
    const agentesIds      = $$('.agente-check:checked').map((c) => c.value);
    const etiquetas       = $('#tarea-etiquetas').value.split(',').map((s) => s.trim()).filter(Boolean);

    const datos = {
      empresa_id:              empresaId,
      proyecto_id:             $('#tarea-proyecto').value || null,
      titulo:                  $('#tarea-titulo').value.trim(),
      descripcion:             $('#tarea-descripcion').value.trim(),
      prioridad:               $('#tarea-prioridad').value,
      es_cronologica:          esCronologica,
      etiquetas,
      tiempo_estimado_horas:   $('#tarea-tiempo-estimado').value ? Number($('#tarea-tiempo-estimado').value) : null,
      creador_id:              AGENTE.id,
      agentes_ids:             agentesIds
    };

    if (esCronologica) {
      datos.frecuencia    = $('#tarea-frecuencia').value;
      datos.fecha_inicio  = new Date().toISOString();
      if (datos.frecuencia === 'semanal') datos.dias_semana = $$('.dia-semana:checked').map((c) => c.value);
      if (datos.frecuencia === 'mensual') datos.dia_mes = Number($('#tarea-dia-mes').value) || 1;
    } else {
      datos.fecha_inicio  = $('#tarea-fecha-inicio').value || new Date().toISOString();
      datos.fecha_cierre  = $('#tarea-fecha-cierre').value || null;
    }

    try {
      if (id) { delete datos.agentes_ids; delete datos.creador_id; await actualizarTarea(id, datos); }
      else await crearTarea(datos);
      toastExito('Tarea guardada.');
      cerrarModal('modal-tarea');
      // Refrescar proyectos globales por si se creó uno nuevo
      TODOS_PROYECTOS = await listarTodosLosProyectos();
      actualizarMsProyectos();
      cargarVista();
    } catch (err) { toastError(err.message); }
  });
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  renderLayout('tareas');
  const ctx = await inicializarApp();
  if (!ctx) return;
  AGENTE = ctx.agente;
  EMPRESA_ID = ctx.empresaId;

  const main = document.getElementById('main-content');
  if (!EMPRESA_ID) {
    main.innerHTML = '<div class="empty-state"><h3>Crea o selecciona una empresa primero.</h3></div>';
    return;
  }

  main.innerHTML = plantilla();

  // Cargar datos base
  [EMPRESAS, TODOS_PROYECTOS] = await Promise.all([
    obtenerEmpresasDelAgente(AGENTE.id),
    listarTodosLosProyectos()
  ]);

  if (!EMPRESAS.find((e) => e.id === EMPRESA_ID)) {
    EMPRESAS.unshift({ id: EMPRESA_ID, nombre: 'Empresa actual' });
  }

  llenarSelectorEmpresaModal(EMPRESA_ID);
  await cargarDatosModalEmpresa(EMPRESA_ID);

  // ── Multiselects de toolbar ──────────────────────────────
  msEmpresas = crearMultiSelect({
    placeholder: 'Empresas',
    options: EMPRESAS.map((e) => ({ value: e.id, label: e.nombre })),
    onChange() {
      actualizarMsProyectos();
      PAGINA = 0;
      cargarVista();
    }
  });
  $('#slot-ms-empresas').appendChild(msEmpresas.el);

  msProyectos = crearMultiSelect({
    placeholder: 'Proyectos',
    options: [],
    onChange() { PAGINA = 0; cargarVista(); }
  });
  $('#slot-ms-proyectos').appendChild(msProyectos.el);
  actualizarMsProyectos();

  msEstados = crearMultiSelect({
    placeholder: 'Estados',
    options: ESTADOS.map((s) => ({ value: s, label: ETIQUETAS_ESTADO[s] })),
    onChange() { PAGINA = 0; cargarVista(); }
  });
  $('#slot-ms-estados').appendChild(msEstados.el);

  msPrioridades = crearMultiSelect({
    placeholder: 'Prioridad',
    options: Object.entries(ETIQUETAS_PRIORIDAD).map(([k, v]) => ({ value: k, label: v })),
    onChange() { PAGINA = 0; cargarVista(); }
  });
  $('#slot-ms-prioridades').appendChild(msPrioridades.el);

  // ── Bind y carga inicial ─────────────────────────────────
  bind();
  await cargarVista();

  // QS: abrir modal nueva tarea con datos pre-cargados
  if (qs('nueva') === '1') {
    $('#modal-tarea-titulo').textContent = 'Nueva tarea';
    llenarSelectorEmpresaModal(EMPRESA_ID);
    $('#tarea-empresa').disabled = false;
    resetFormulario();
    const fechaPre = qs('fecha');
    if (fechaPre) {
      $('#tarea-fecha-inicio').value = fechaPre;
      $('#tarea-fecha-cierre').value = fechaPre;
    }
    const proyectoQS = qs('proyecto');
    if (proyectoQS) $('#tarea-proyecto').value = proyectoQS;
    abrirModal('modal-tarea');
  }
}

init();
