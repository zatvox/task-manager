import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import {
  listarProyectos, crearProyecto, actualizarProyecto, eliminarProyecto,
  listarDepartamentos, obtenerProgresoProyectos, obtenerEmpresasDelAgente,
  listarTodosLosProyectos
} from './supabase-data.js';
import { $, $$, escapeHTML, formatearFecha, crearMultiSelect } from './utils.js';

let AGENTE, EMPRESA_ID;
let EMPRESAS = [];
let DEPARTAMENTOS_CACHE = {}; // { [empresaId]: [{id, nombre}] }
let PROGRESO = {};

// Multiselect instances para filtros
let msEmpresas, msEstados, msDeptos;

function plantilla() {
  return `
    <div class="page-header">
      <div><h1>Proyectos</h1><p class="page-header__subtitle">Conjuntos de tareas con o sin fecha de finalización.</p></div>
      <button class="btn btn-primary" id="btn-nuevo">+ Nuevo proyecto</button>
    </div>

    <div class="table-toolbar" style="flex-wrap:wrap;">
      <div id="slot-filtro-empresas"></div>
      <div id="slot-filtro-estados"></div>
      <div id="slot-filtro-deptos"></div>
    </div>

    <div class="grid-cards" id="lista-proyectos"><div class="loading-spinner"></div></div>

    <!-- Modal crear / editar proyecto -->
    <div class="modal-overlay" id="modal-proyecto">
      <div class="modal modal--lg">
        <div class="modal__header">
          <h3 id="modal-titulo">Nuevo proyecto</h3>
          <button class="btn-icon" data-close>✕</button>
        </div>
        <form id="form-proyecto">
          <div class="modal__body">
            <input type="hidden" id="proyecto-id" />

            <!-- Selector de empresa -->
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
                <option value="activo">Activo</option>
                <option value="pausado">Pausado</option>
                <option value="completado">Completado</option>
                <option value="archivado">Archivado</option>
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

/* ── Tarjeta ── */
function tarjeta(p) {
  const prog = PROGRESO[p.id];
  return `
    <div class="card card-clickable" data-abrir="${p.id}" style="border-left:4px solid ${p.color_etiqueta};">
      <div class="card__header">
        <h3 class="card__title">${escapeHTML(p.nombre)}</h3>
        <span class="badge badge-estado-${p.estado === 'completado' ? 'completado' : p.estado === 'archivado' ? 'archivado' : 'en_progreso'}">${escapeHTML(p.estado)}</span>
      </div>
      <p style="color:var(--text-secondary); font-size:var(--fs-sm); min-height:36px;">${escapeHTML(p.descripcion || 'Sin descripción')}</p>
      <p style="font-size:var(--fs-xs); color:var(--text-tertiary);">
        ${p.empresa?.nombre ? '🏢 ' + escapeHTML(p.empresa.nombre) + ' · ' : ''}
        ${p.departamento?.nombre ? '🗂️ ' + escapeHTML(p.departamento.nombre) + ' · ' : ''}
        Inicio: ${formatearFecha(p.fecha_inicio)}${p.fecha_finalizacion ? ' · Fin: ' + formatearFecha(p.fecha_finalizacion) : ''}
      </p>
      <div class="progress-bar" style="margin-top:var(--space-3);">
        <div class="progress-bar__fill" style="width:${prog?.porcentaje_progreso || 0}%; background:${p.color_etiqueta};"></div>
      </div>
      <p style="font-size:var(--fs-xs); color:var(--text-tertiary); margin-top:var(--space-1);">
        ${prog?.porcentaje_progreso || 0}% completado · ${prog?.tareas_completadas || 0}/${prog?.total_tareas || 0} tareas
      </p>
      <div style="display:flex; gap:var(--space-2); margin-top:var(--space-3);" onclick="event.stopPropagation()">
        <button class="btn btn-tertiary btn-sm" data-editar='${JSON.stringify(p).replace(/'/g, "&#39;")}'>✏️ Editar</button>
        <button class="btn btn-tertiary btn-sm" data-eliminar="${p.id}" style="color:var(--color-danger)">🗑️ Eliminar</button>
      </div>
    </div>
  `;
}

/* ── Carga lista ── */
async function cargar() {
  const cont = $('#lista-proyectos');
  const estadosSel  = msEstados.getSelected();
  const deptosSel   = msDeptos.getSelected();
  const empresasSel = msEmpresas ? msEmpresas.getSelected() : [];

  let lista, progreso;

  if (empresasSel.length > 1) {
    // Multi-empresa: carga todos los proyectos accesibles (RLS filtra) y aplica filtro cliente
    const progresoPorEmpresa = await Promise.all(empresasSel.map((id) => obtenerProgresoProyectos(id)));
    [lista, progreso] = await Promise.all([
      listarTodosLosProyectos(),
      Promise.resolve(progresoPorEmpresa.flat())
    ]);
    lista = lista.filter((p) => empresasSel.includes(p.empresa_id));
  } else {
    // Sin filtro de empresa o una sola empresa seleccionada
    const empId = empresasSel[0] || EMPRESA_ID;
    [lista, progreso] = await Promise.all([
      listarProyectos(empId, {}),
      obtenerProgresoProyectos(empId)
    ]);
  }

  PROGRESO = Object.fromEntries(progreso.map((p) => [p.proyecto_id, p]));

  // Filtrado cliente para estados y deptos (siempre)
  const filtrada = lista.filter((p) => {
    if (estadosSel.length && !estadosSel.includes(p.estado)) return false;
    if (deptosSel.length && !deptosSel.includes(p.departamento_id)) return false;
    return true;
  });

  cont.innerHTML = filtrada.length
    ? filtrada.map(tarjeta).join('')
    : '<div class="empty-state"><div class="empty-state__icon">📁</div><h3>Sin proyectos</h3><p>Crea tu primer proyecto.</p></div>';

  cont.querySelectorAll('[data-abrir]').forEach((c) =>
    c.addEventListener('click', () => { window.location.href = `proyecto-detalle.html?id=${c.dataset.abrir}`; }));
  cont.querySelectorAll('[data-editar]').forEach((b) =>
    b.addEventListener('click', () => abrirEdicion(JSON.parse(b.dataset.editar.replace(/&#39;/g, "'")))));
  cont.querySelectorAll('[data-eliminar]').forEach((b) =>
    b.addEventListener('click', () => onEliminar(b.dataset.eliminar)));
}

/* ── Departamentos en modal ── */
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

/* ── Llena selector empresa en modal ── */
function llenarSelectorEmpresa(selectedId) {
  $('#proyecto-empresa').innerHTML = EMPRESAS.map((e) =>
    `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHTML(e.nombre)}</option>`
  ).join('');
}

/* ── Llena filtro de departamentos con los de las empresas seleccionadas ── */
async function actualizarFiltroDeptos() {
  const empresasSel = msEmpresas ? msEmpresas.getSelected() : [];
  const idsACargar = empresasSel.length ? empresasSel : [EMPRESA_ID];
  const resultados = await Promise.all(idsACargar.map((id) => cargarDeptosParaEmpresa(id)));
  const todos = resultados.flat();
  msDeptos.setOptions(todos.map((d) => ({ value: d.id, label: d.nombre })));
}

/* ── Abrir edición ── */
function abrirEdicion(p) {
  $('#modal-titulo').textContent = 'Editar proyecto';
  $('#proyecto-id').value = p.id;
  llenarSelectorEmpresa(p.empresa_id);
  // Editar empresa deshabilitado para evitar problemas de pertenencia
  $('#proyecto-empresa').disabled = true;
  $('#proyecto-nombre').value = p.nombre;
  $('#proyecto-descripcion').value = p.descripcion || '';
  $('#proyecto-color').value = p.color_etiqueta || '#00d4ff';
  $('#proyecto-fecha-inicio').value = p.fecha_inicio ? p.fecha_inicio.slice(0, 10) : '';
  $('#proyecto-fecha-fin').value = p.fecha_finalizacion ? p.fecha_finalizacion.slice(0, 10) : '';
  $('#proyecto-estado').value = p.estado;
  cargarDeptosParaEmpresa(p.empresa_id).then(() => {
    $('#proyecto-depto').value = p.departamento_id || '';
  });
  abrirModal('modal-proyecto');
}

async function onEliminar(id) {
  const ok = await confirmar({
    titulo: 'Eliminar proyecto',
    mensaje: 'Se eliminarán todas las tareas asociadas. Esta acción no se puede deshacer.',
    peligro: true, textoConfirmar: 'Eliminar'
  });
  if (!ok) return;
  try { await eliminarProyecto(id); toastExito('Proyecto eliminado.'); cargar(); }
  catch (err) { toastError(err.message); }
}

/* ── Bind ── */
function bind() {
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => cerrarModal('modal-proyecto')));

  // Cambio de empresa en modal → recarga departamentos
  $('#proyecto-empresa').addEventListener('change', async (e) => {
    await cargarDeptosParaEmpresa(e.target.value);
  });

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
    abrirModal('modal-proyecto');
  });

  $('#form-proyecto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id         = $('#proyecto-id').value;
    const empresaId  = $('#proyecto-empresa').value || EMPRESA_ID;
    const datos = {
      empresa_id:       empresaId,
      departamento_id:  $('#proyecto-depto').value || null,
      nombre:           $('#proyecto-nombre').value.trim(),
      descripcion:      $('#proyecto-descripcion').value.trim(),
      color_etiqueta:   $('#proyecto-color').value,
      fecha_inicio:     $('#proyecto-fecha-inicio').value || new Date().toISOString(),
      fecha_finalizacion: $('#proyecto-fecha-fin').value || null,
      estado:           $('#proyecto-estado').value,
      creador_id:       AGENTE.id
    };
    try {
      if (id) await actualizarProyecto(id, datos);
      else await crearProyecto(datos);
      toastExito('Proyecto guardado.');
      cerrarModal('modal-proyecto');
      cargar();
    } catch (err) { toastError(err.message); }
  });
}

/* ── Init ── */
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

  // Cargar empresas del agente
  EMPRESAS = await obtenerEmpresasDelAgente(AGENTE.id);
  if (!EMPRESAS.find((e) => e.id === EMPRESA_ID)) {
    EMPRESAS.unshift({ id: EMPRESA_ID, nombre: 'Empresa actual' });
  }

  // Multiselect: empresas
  msEmpresas = crearMultiSelect({
    placeholder: 'Empresas',
    options: EMPRESAS.map((e) => ({ value: e.id, label: e.nombre })),
    onChange: async () => {
      await actualizarFiltroDeptos();
      cargar();
    }
  });
  $('#slot-filtro-empresas').appendChild(msEmpresas.el);

  // Multiselect: estados
  msEstados = crearMultiSelect({
    placeholder: 'Estados',
    options: [
      { value: 'activo',     label: 'Activo' },
      { value: 'pausado',    label: 'Pausado' },
      { value: 'completado', label: 'Completado' },
      { value: 'archivado',  label: 'Archivado' }
    ],
    onChange: () => cargar()
  });
  $('#slot-filtro-estados').appendChild(msEstados.el);

  // Multiselect: departamentos (cargado después)
  msDeptos = crearMultiSelect({
    placeholder: 'Departamentos',
    options: [],
    onChange: () => cargar()
  });
  $('#slot-filtro-deptos').appendChild(msDeptos.el);

  await actualizarFiltroDeptos();
  bind();
  await cargar();
}

init();
