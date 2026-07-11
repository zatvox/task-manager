import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import {
  listarProyectos, crearProyecto, actualizarProyecto, eliminarProyecto,
  listarDepartamentos, obtenerProgresoProyectos, obtenerEmpresasDelAgente,
  listarTodosLosProyectos, listarAgentesDeEmpresa, listarProyectosIdsPorAgente
} from './supabase-data.js';
import { $, $$, escapeHTML, formatearFecha, crearMultiSelect, iniciales } from './utils.js';

let AGENTE, EMPRESA_ID;
let EMPRESAS       = [];
let AGENTES_EMPRESA = [];
let DEPARTAMENTOS_CACHE = {};
let PROGRESO = {};

let VISTA      = 'grid';    // 'grid' | 'kanban'
let AGRUPACION = 'estado';  // 'estado' | 'empresa' | 'agente'
let PROYECTOS_CACHE = [];   // para kanban

let msEmpresas, msEstados, msDeptos, msAgentes;
let formDirty = false;

const ESTADOS_PROYECTO = ['activo','pausado','completado','archivado'];
const ESTADO_LABEL     = { activo:'Activo', pausado:'Pausado', completado:'Completado', archivado:'Archivado' };
const ESTADO_CLASE     = { activo:'completado', pausado:'en_progreso', completado:'en_revision', archivado:'archivado' };

/* ============================================================ PLANTILLA */
function plantilla() {
  return `
    <div class="page-header">
      <div><h1>Proyectos</h1><p class="page-header__subtitle">Conjuntos de tareas con o sin fecha de finalización.</p></div>
      <button class="btn btn-primary" id="btn-nuevo">+ Nuevo proyecto</button>
    </div>

    <div class="table-toolbar" style="flex-wrap:wrap;">
      <div id="slot-filtro-empresas"></div>
      <div id="slot-filtro-agentes"></div>
      <div id="slot-filtro-estados"></div>
      <div id="slot-filtro-deptos"></div>
      <div class="tabs" style="border-bottom:none; margin:0; margin-left:auto;">
        <div class="tab ${VISTA==='grid'?'active':''}" data-vista="grid">🗂️ Tarjetas</div>
        <div class="tab ${VISTA==='kanban'?'active':''}" data-vista="kanban">🗃️ Kanban</div>
      </div>
    </div>

    <div id="proy-group-bar" class="kanban-group-bar" style="display:${VISTA==='kanban'?'flex':'none'};">
      <span class="kanban-group-label">Agrupar por:</span>
      <button class="kanban-group-btn ${AGRUPACION==='estado'  ?'active':''}" data-agrup="estado">📋 Estado</button>
      <button class="kanban-group-btn ${AGRUPACION==='empresa' ?'active':''}" data-agrup="empresa">🏢 Empresa</button>
      <button class="kanban-group-btn ${AGRUPACION==='agente'  ?'active':''}" data-agrup="agente">👤 Agente</button>
    </div>

    <div id="contenedor-proyectos"><div class="loading-spinner"></div></div>

    <!-- Modal crear / editar proyecto -->
    <div class="modal-overlay" id="modal-proyecto" data-managed-close="true">
      <div class="modal modal--lg">
        <div class="modal__header">
          <h3 id="modal-titulo">Nuevo proyecto</h3>
          <button class="btn-icon" data-close>✕</button>
        </div>
        <form id="form-proyecto">
          <div class="modal__body">
            <input type="hidden" id="proyecto-id" />
            <div class="form-group">
              <label class="form-label">Empresa</label>
              <select class="form-control" id="proyecto-empresa"></select>
            </div>
            <div class="form-group">
              <label class="form-label">Nombre</label>
              <input class="form-control" id="proyecto-nombre" required />
            </div>
            <div class="form-group">
              <label class="form-label">Descripción</label>
              <textarea class="form-control" id="proyecto-descripcion"></textarea>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Departamento</label>
                <select class="form-control" id="proyecto-depto">
                  <option value="">Sin departamento</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Color</label>
                <input class="form-control" type="color" id="proyecto-color" value="#00d4ff" style="height:44px;" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Fecha de inicio</label>
                <input class="form-control" type="date" id="proyecto-fecha-inicio" />
              </div>
              <div class="form-group">
                <label class="form-label">Fecha de finalización (opcional)</label>
                <input class="form-control" type="date" id="proyecto-fecha-fin" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Estado</label>
              <select class="form-control" id="proyecto-estado">
                ${ESTADOS_PROYECTO.map((e) => `<option value="${e}">${ESTADO_LABEL[e]}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close>Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/* ============================================================ TARJETA GRID */
function tarjeta(p) {
  const prog = PROGRESO[p.id];
  return `
    <div class="card card-clickable" data-abrir="${p.id}" style="border-left:4px solid ${p.color_etiqueta};">
      <div class="card__header">
        <h3 class="card__title">${escapeHTML(p.nombre)}</h3>
        <span class="badge badge-estado-${ESTADO_CLASE[p.estado]||'archivado'}">${escapeHTML(ESTADO_LABEL[p.estado]||p.estado)}</span>
      </div>
      <p style="color:var(--text-secondary); font-size:var(--fs-sm); min-height:36px;">${escapeHTML(p.descripcion || 'Sin descripción')}</p>
      <p style="font-size:var(--fs-xs); color:var(--text-tertiary);">
        ${p.empresa?.nombre ? '🏢 ' + escapeHTML(p.empresa.nombre) + ' · ' : ''}
        ${p.departamento?.nombre ? '🗂️ ' + escapeHTML(p.departamento.nombre) + ' · ' : ''}
        Inicio: ${formatearFecha(p.fecha_inicio)}${p.fecha_finalizacion ? ' · Fin: ' + formatearFecha(p.fecha_finalizacion) : ''}
      </p>
      <div class="progress-bar" style="margin-top:var(--space-3);">
        <div class="progress-bar__fill" style="width:${prog?.porcentaje_progreso||0}%; background:${p.color_etiqueta};"></div>
      </div>
      <p style="font-size:var(--fs-xs); color:var(--text-tertiary); margin-top:var(--space-1);">
        ${prog?.porcentaje_progreso||0}% · ${prog?.tareas_completadas||0}/${prog?.total_tareas||0} tareas
      </p>
      <div style="display:flex; gap:var(--space-2); margin-top:var(--space-3);" onclick="event.stopPropagation()">
        <button class="btn btn-tertiary btn-sm" data-editar='${JSON.stringify(p).replace(/'/g,"&#39;")}'>✏️ Editar</button>
        <button class="btn btn-tertiary btn-sm" data-eliminar="${p.id}" style="color:var(--color-danger)">🗑️ Eliminar</button>
      </div>
    </div>`;
}

/* ============================================================ KANBAN CARD PROYECTO */
function kanbanCardProyecto(p) {
  const prog = PROGRESO[p.id];
  const pct  = prog?.porcentaje_progreso || 0;
  return `
    <div class="kanban-card" draggable="true" data-id="${p.id}" data-abrir="${p.id}" style="border-top:3px solid ${p.color_etiqueta};">
      <div style="font-weight:600; font-size:var(--fs-sm); margin-bottom:var(--space-2);">${escapeHTML(p.nombre)}</div>
      ${AGRUPACION !== 'estado' ? `<div style="margin-bottom:var(--space-2);"><span class="badge badge-estado-${ESTADO_CLASE[p.estado]||'archivado'}">${ESTADO_LABEL[p.estado]||p.estado}</span></div>` : ''}
      ${p.descripcion ? `<div style="font-size:var(--fs-xs); color:var(--text-secondary); margin-bottom:var(--space-2); line-height:1.4;">${escapeHTML(p.descripcion.substring(0,80))}${p.descripcion.length>80?'…':''}</div>` : ''}
      <div style="margin-bottom:var(--space-2);">
        <div class="progress-bar"><div class="progress-bar__fill" style="width:${pct}%; background:${p.color_etiqueta};"></div></div>
        <span style="font-size:var(--fs-xs); color:var(--text-tertiary);">${pct}%</span>
      </div>
      ${AGRUPACION !== 'empresa' && p.empresa ? `<div style="font-size:var(--fs-xs); color:var(--text-tertiary);">🏢 ${escapeHTML(p.empresa.nombre)}</div>` : ''}
      ${AGRUPACION !== 'agente' && p.creador ? `<div style="font-size:var(--fs-xs); color:var(--text-tertiary); margin-top:var(--space-1);">👤 ${escapeHTML(p.creador.nombre||'')}</div>` : ''}
      <div style="display:flex; gap:var(--space-2); margin-top:var(--space-2);" onclick="event.stopPropagation()">
        <button class="btn btn-tertiary btn-sm" data-editar='${JSON.stringify(p).replace(/'/g,"&#39;")}'>✏️</button>
        <button class="btn btn-tertiary btn-sm" data-eliminar="${p.id}" style="color:var(--color-danger)">🗑️</button>
      </div>
    </div>`;
}

/* ============================================================ KANBAN RENDER */
function renderKanbanProyectos(cont, lista) {
  let columnas, getColId, onDrop;

  if (AGRUPACION === 'estado') {
    columnas = ESTADOS_PROYECTO.map((e) => ({ id: e, label: ESTADO_LABEL[e] }));
    getColId = (p) => p.estado || 'activo';
    onDrop   = async (id, val) => actualizarProyecto(id, { estado: val });
  } else if (AGRUPACION === 'empresa') {
    columnas = [{ id: '__sin__', label: 'Sin empresa' }, ...EMPRESAS.map((e) => ({ id: e.id, label: e.nombre }))];
    getColId = (p) => p.empresa_id || '__sin__';
    onDrop   = async (id, val) => actualizarProyecto(id, { empresa_id: val === '__sin__' ? null : val });
  } else { // agente
    columnas = [{ id: '__sin__', label: 'Sin asignar' }, ...AGENTES_EMPRESA.map((a) => ({ id: a.agente.id, label: a.agente.nombre }))];
    getColId = (p) => p.creador_id || '__sin__';
    onDrop   = async (id, val) => actualizarProyecto(id, { creador_id: val === '__sin__' ? null : val });
  }

  cont.innerHTML = `<div class="kanban">
    ${columnas.map((col) => {
      const items = lista.filter((p) => getColId(p) === col.id);
      return `<div class="kanban-column" data-col="${col.id}">
        <div class="kanban-column__title">
          <div class="kanban-column__title-left"><span>${escapeHTML(col.label)}</span></div>
          <span class="badge badge-estado-en_progreso">${items.length}</span>
        </div>
        <div class="kanban-cards" data-drop="${col.id}">
          ${items.map((p) => kanbanCardProyecto(p)).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;

  cont.querySelectorAll('[data-abrir]').forEach((c) =>
    c.addEventListener('click', (e) => { if (!c.classList.contains('dragging')) window.location.href = `proyecto-detalle.html?id=${c.dataset.abrir}`; }));
  cont.querySelectorAll('[data-editar]').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); abrirEdicion(JSON.parse(b.dataset.editar.replace(/&#39;/g,"'"))); }));
  cont.querySelectorAll('[data-eliminar]').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); onEliminar(b.dataset.eliminar); }));

  // Drag & drop
  $$('.kanban-card').forEach((card) => {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend',   () => card.classList.remove('dragging'));
  });
  $$('.kanban-cards').forEach((dropzone) => {
    dropzone.addEventListener('dragover',  (e) => { e.preventDefault(); dropzone.closest('.kanban-column').classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', ()  => dropzone.closest('.kanban-column').classList.remove('drag-over'));
    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.closest('.kanban-column').classList.remove('drag-over');
      const id  = document.querySelector('.kanban-card.dragging')?.dataset.id;
      const val = dropzone.dataset.drop;
      if (!id || !val) return;
      try { await onDrop(id, val); toastExito('Proyecto actualizado.'); cargar(); }
      catch (err) { toastError(err.message); }
    });
  });
}

/* ============================================================ CARGA */
async function cargar() {
  const cont = document.getElementById('contenedor-proyectos');
  cont.innerHTML = '<div class="loading-spinner"></div>';

  const estadosSel  = msEstados?.getSelected()  || [];
  const deptosSel   = msDeptos?.getSelected()   || [];
  const empresasSel = msEmpresas?.getSelected() || [];
  const agentesSel  = msAgentes?.getSelected()  || [];

  let lista, progreso;

  if (empresasSel.length === 1) {
    [lista, progreso] = await Promise.all([
      listarProyectos(empresasSel[0], {}),
      obtenerProgresoProyectos(empresasSel[0])
    ]);
  } else {
    const idsProgreso = empresasSel.length ? empresasSel : EMPRESAS.map((e) => e.id);
    const progresoPorEmpresa = await Promise.all(idsProgreso.map((id) => obtenerProgresoProyectos(id)));
    [lista, progreso] = await Promise.all([
      listarTodosLosProyectos(),
      Promise.resolve(progresoPorEmpresa.flat())
    ]);
    if (empresasSel.length) lista = lista.filter((p) => empresasSel.includes(p.empresa_id));
  }

  PROGRESO = Object.fromEntries(progreso.map((p) => [p.proyecto_id, p]));

  let proyectosIdsFiltrados = null;
  if (agentesSel.length) proyectosIdsFiltrados = await listarProyectosIdsPorAgente(agentesSel);

  const filtrada = lista.filter((p) => {
    if (estadosSel.length && !estadosSel.includes(p.estado)) return false;
    if (deptosSel.length && !deptosSel.includes(p.departamento_id)) return false;
    if (proyectosIdsFiltrados && !proyectosIdsFiltrados.includes(p.id)) return false;
    return true;
  });

  PROYECTOS_CACHE = filtrada;

  if (VISTA === 'grid') {
    cont.innerHTML = filtrada.length
      ? `<div class="grid-cards">${filtrada.map(tarjeta).join('')}</div>`
      : '<div class="empty-state"><div class="empty-state__icon">📁</div><h3>Sin proyectos</h3><p>Crea tu primer proyecto.</p></div>';

    cont.querySelectorAll('[data-abrir]').forEach((c) =>
      c.addEventListener('click', () => window.location.href = `proyecto-detalle.html?id=${c.dataset.abrir}`));
    cont.querySelectorAll('[data-editar]').forEach((b) =>
      b.addEventListener('click', () => abrirEdicion(JSON.parse(b.dataset.editar.replace(/&#39;/g,"'")))));
    cont.querySelectorAll('[data-eliminar]').forEach((b) =>
      b.addEventListener('click', () => onEliminar(b.dataset.eliminar)));
  } else {
    renderKanbanProyectos(cont, filtrada);
  }
}

/* ============================================================ MODAL */
async function cargarDeptosParaEmpresa(empresaId) {
  if (!DEPARTAMENTOS_CACHE[empresaId]) {
    DEPARTAMENTOS_CACHE[empresaId] = await listarDepartamentos(empresaId);
  }
  const deptos = DEPARTAMENTOS_CACHE[empresaId];
  $('#proyecto-depto').innerHTML =
    '<option value="">Sin departamento</option>' +
    deptos.map((d) => `<option value="${d.id}">${escapeHTML(d.nombre)}</option>`).join('');
  return deptos;
}

function llenarSelectorEmpresa(selectedId) {
  $('#proyecto-empresa').innerHTML = EMPRESAS.map((e) =>
    `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHTML(e.nombre)}</option>`
  ).join('');
}

async function actualizarFiltroDeptos() {
  const empresasSel = msEmpresas?.getSelected() || [];
  const idsACargar  = empresasSel.length ? empresasSel : [EMPRESA_ID];
  const resultados  = await Promise.all(idsACargar.map((id) => cargarDeptosParaEmpresa(id)));
  msDeptos.setOptions(resultados.flat().map((d) => ({ value: d.id, label: d.nombre })));
}

function abrirEdicion(p) {
  $('#modal-titulo').textContent = 'Editar proyecto';
  $('#proyecto-id').value = p.id;
  llenarSelectorEmpresa(p.empresa_id);
  $('#proyecto-empresa').disabled = true;
  $('#proyecto-nombre').value = p.nombre;
  $('#proyecto-descripcion').value = p.descripcion || '';
  $('#proyecto-color').value = p.color_etiqueta || '#00d4ff';
  $('#proyecto-fecha-inicio').value = p.fecha_inicio ? p.fecha_inicio.slice(0,10) : '';
  $('#proyecto-fecha-fin').value = p.fecha_finalizacion ? p.fecha_finalizacion.slice(0,10) : '';
  $('#proyecto-estado').value = p.estado;
  cargarDeptosParaEmpresa(p.empresa_id).then(() => { $('#proyecto-depto').value = p.departamento_id || ''; });
  formDirty = false;
  abrirModal('modal-proyecto');
}

async function onEliminar(id) {
  const ok = await confirmar({ titulo: 'Eliminar proyecto', mensaje: 'Se eliminarán todas las tareas asociadas.', peligro: true, textoConfirmar: 'Eliminar' });
  if (!ok) return;
  try { await eliminarProyecto(id); toastExito('Proyecto eliminado.'); cargar(); }
  catch (err) { toastError(err.message); }
}

/* ============================================================ BIND */
function intentarCerrarModal() {
  if (formDirty && !confirm('¿Descartar cambios sin guardar?')) return;
  formDirty = false;
  cerrarModal('modal-proyecto');
}

function bind() {
  $$('[data-close]').forEach((b) => b.addEventListener('click', intentarCerrarModal));
  $('#modal-proyecto').addEventListener('modal:request-close', intentarCerrarModal);
  $('#form-proyecto').addEventListener('input',  () => { formDirty = true; });
  $('#form-proyecto').addEventListener('change', () => { formDirty = true; });
  $('#proyecto-empresa').addEventListener('change', async (e) => { await cargarDeptosParaEmpresa(e.target.value); });

  // Toggle vista
  $$('.tab[data-vista]').forEach((tab) =>
    tab.addEventListener('click', () => {
      VISTA = tab.dataset.vista;
      $$('.tab[data-vista]').forEach((t) => t.classList.toggle('active', t === tab));
      const bar = $('#proy-group-bar');
      if (bar) bar.style.display = VISTA === 'kanban' ? 'flex' : 'none';
      cargar();
    }));

  // Agrupación kanban
  $$('.kanban-group-btn').forEach((btn) =>
    btn.addEventListener('click', () => {
      AGRUPACION = btn.dataset.agrup;
      $$('.kanban-group-btn').forEach((b) => b.classList.toggle('active', b === btn));
      if (VISTA === 'kanban') cargar();
    }));

  $('#btn-nuevo').addEventListener('click', () => {
    $('#modal-titulo').textContent = 'Nuevo proyecto';
    $('#proyecto-id').value = '';
    llenarSelectorEmpresa(EMPRESA_ID);
    $('#proyecto-empresa').disabled = false;
    $('#proyecto-nombre').value = '';
    $('#proyecto-descripcion').value = '';
    $('#proyecto-color').value = '#00d4ff';
    $('#proyecto-fecha-inicio').value = new Date().toISOString().slice(0, 10);
    $('#proyecto-fecha-fin').value = '';
    $('#proyecto-estado').value = 'activo';
    cargarDeptosParaEmpresa(EMPRESA_ID).then(() => { $('#proyecto-depto').value = ''; });
    formDirty = false;
    abrirModal('modal-proyecto');
  });

  $('#form-proyecto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#proyecto-id').value;
    const empresaId = $('#proyecto-empresa').value || EMPRESA_ID;
    const datos = {
      empresa_id:         empresaId,
      departamento_id:    $('#proyecto-depto').value || null,
      nombre:             $('#proyecto-nombre').value.trim(),
      descripcion:        $('#proyecto-descripcion').value.trim(),
      color_etiqueta:     $('#proyecto-color').value,
      fecha_inicio:       $('#proyecto-fecha-inicio').value || new Date().toISOString(),
      fecha_finalizacion: $('#proyecto-fecha-fin').value || null,
      estado:             $('#proyecto-estado').value,
      creador_id:         AGENTE.id
    };
    try {
      if (id) await actualizarProyecto(id, datos);
      else await crearProyecto(datos);
      toastExito('Proyecto guardado.');
      formDirty = false;
      cerrarModal('modal-proyecto');
      cargar();
    } catch (err) { toastError(err.message); }
  });
}

/* ============================================================ INIT */
async function init() {
  renderLayout('proyectos');
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

  [EMPRESAS, AGENTES_EMPRESA] = await Promise.all([
    obtenerEmpresasDelAgente(AGENTE.id),
    listarAgentesDeEmpresa(EMPRESA_ID)
  ]);
  if (!EMPRESAS.find((e) => e.id === EMPRESA_ID)) {
    EMPRESAS.unshift({ id: EMPRESA_ID, nombre: 'Empresa actual' });
  }

  msAgentes = crearMultiSelect({
    placeholder: 'Agentes',
    options: AGENTES_EMPRESA.map((a) => ({ value: a.agente.id, label: a.agente.nombre })),
    onChange: () => cargar()
  });
  msAgentes.setSelected([AGENTE.id]);
  $('#slot-filtro-agentes').appendChild(msAgentes.el);

  msEmpresas = crearMultiSelect({
    placeholder: 'Empresas',
    options: EMPRESAS.map((e) => ({ value: e.id, label: e.nombre })),
    onChange: async () => { await actualizarFiltroDeptos(); cargar(); }
  });
  $('#slot-filtro-empresas').appendChild(msEmpresas.el);

  msEstados = crearMultiSelect({
    placeholder: 'Estados',
    options: ESTADOS_PROYECTO.map((e) => ({ value: e, label: ESTADO_LABEL[e] })),
    onChange: () => cargar()
  });
  $('#slot-filtro-estados').appendChild(msEstados.el);

  msDeptos = crearMultiSelect({ placeholder: 'Departamentos', options: [], onChange: () => cargar() });
  $('#slot-filtro-deptos').appendChild(msDeptos.el);

  await actualizarFiltroDeptos();
  bind();
  await cargar();
}

init();
