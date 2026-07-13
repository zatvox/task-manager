import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import {
  listarRecordatorios, crearRecordatorio, actualizarRecordatorio,
  pausarRecordatorio, eliminarRecordatorio,
  obtenerEmpresasDelAgente, listarProyectos, listarAgentesDeEmpresa,
  reasignarAgentesARecordatorio
} from './supabase-data.js';
import { $, $$, escapeHTML, formatearHora, crearMultiSelect, iniciales, ETIQUETAS_ESTADO } from './utils.js';

let AGENTE, EMPRESA_ID;
let EMPRESAS       = [];
let AGENTES_EMPRESA = [];
let EMPRESAS_AGENTES = {};
let TODOS_PROYECTOS  = [];
let msEmpresas, msAgentes;
let formDirty = false;

let VISTA        = 'tabla';      // 'tabla' | 'kanban'
let AGRUPACION   = 'frecuencia'; // 'frecuencia' | 'empresa' | 'proyecto' | 'agente'
let FILTRO_TIPO  = 'todos';      // 'todos' | 'tarea' | 'recordatorio'
let ITEMS_CACHE  = [];

const DIAS_SEMANA = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const FRECUENCIAS = ['diaria','semanal','mensual','quincenal'];
const FREC_LABEL  = { diaria:'Diaria', semanal:'Semanal', mensual:'Mensual', quincenal:'Quincenal' };

function etiquetaFrecuencia(r) {
  switch (r.frecuencia) {
    case 'diaria':    return 'Diaria';
    case 'semanal':   return `Semanal (${(r.dias_semana||[]).join(', ')})`;
    case 'mensual':   return `Mensual (día ${r.dia_mes||1})`;
    case 'quincenal': return `Quincenal (días ${r.dias_semana?.[0]||15} y ${r.dias_semana?.[1]||30})`;
    default:          return r.frecuencia;
  }
}

/* ============================================================ PLANTILLA */
function plantilla() {
  return `
    <div class="page-header">
      <div><h1>Recordatorios</h1><p class="page-header__subtitle">Recordatorios cronológicos recurrentes por empresa y proyecto.</p></div>
      <button class="btn btn-primary" id="btn-nuevo">+ Nuevo recordatorio</button>
    </div>

    <div class="table-toolbar" style="flex-wrap:wrap; gap:var(--space-2);">
      <div id="slot-ms-empresas-rec"></div>
      <div id="slot-ms-agentes-rec"></div>
      <div style="display:flex; gap:var(--space-1);">
        <button class="btn btn-sm ${FILTRO_TIPO==='todos'       ?'btn-primary':'btn-secondary'}" data-tipo="todos">Todos</button>
        <button class="btn btn-sm ${FILTRO_TIPO==='tarea'       ?'btn-primary':'btn-secondary'}" data-tipo="tarea">🔁 Tareas</button>
        <button class="btn btn-sm ${FILTRO_TIPO==='recordatorio'?'btn-primary':'btn-secondary'}" data-tipo="recordatorio">📌 Recordatorios</button>
      </div>
      <div class="tabs" style="border-bottom:none; margin:0; margin-left:auto;">
        <div class="tab ${VISTA==='tabla'?'active':''}" data-vista="tabla">📋 Tabla</div>
        <div class="tab ${VISTA==='kanban'?'active':''}" data-vista="kanban">🗂️ Kanban</div>
      </div>
    </div>

    <div id="rec-group-bar" class="kanban-group-bar" style="display:${VISTA==='kanban'?'flex':'none'};">
      <span class="kanban-group-label">Agrupar por:</span>
      <button class="kanban-group-btn ${AGRUPACION==='frecuencia'?'active':''}" data-agrup="frecuencia">🔁 Frecuencia</button>
      <button class="kanban-group-btn ${AGRUPACION==='empresa'   ?'active':''}" data-agrup="empresa">🏢 Empresa</button>
      <button class="kanban-group-btn ${AGRUPACION==='proyecto'  ?'active':''}" data-agrup="proyecto">📁 Proyecto</button>
      <button class="kanban-group-btn ${AGRUPACION==='agente'    ?'active':''}" data-agrup="agente">👤 Agente</button>
    </div>

    <div id="contenedor-rec"><div class="loading-spinner"></div></div>

    <!-- Modal crear / editar recordatorio -->
    <div class="modal-overlay" id="modal-recordatorio" data-managed-close="true">
      <div class="modal modal--lg">
        <div class="modal__header">
          <h3 id="modal-rec-titulo">Nuevo recordatorio</h3>
          <button class="btn-icon" id="btn-cerrar-modal-rec">✕</button>
        </div>
        <form id="form-recordatorio">
          <div class="modal__body">
            <input type="hidden" id="r-id" />
            <div class="form-group">
              <label class="form-label">Empresa</label>
              <select class="form-control" id="r-empresa"></select>
            </div>
            <div class="form-group">
              <label class="form-label">Proyecto (opcional)</label>
              <select class="form-control" id="r-proyecto"><option value="">Sin proyecto</option></select>
            </div>
            <div class="form-group">
              <label class="form-label">Asignar agentes</label>
              <div id="lista-agentes-rec" style="display:flex; flex-wrap:wrap; gap:var(--space-2);"></div>
            </div>
            <div class="form-group">
              <label class="form-label">Título</label>
              <input class="form-control" id="r-titulo" required />
            </div>
            <div class="form-group">
              <label class="form-label">Descripción</label>
              <textarea class="form-control" id="r-descripcion"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Frecuencia</label>
              <select class="form-control" id="r-frecuencia">
                ${FRECUENCIAS.map((f) => `<option value="${f}">${FREC_LABEL[f]}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" id="grupo-dias" style="display:none;">
              <label class="form-label">Días de la semana</label>
              <div style="display:flex; gap:var(--space-2); flex-wrap:wrap;">
                ${DIAS_SEMANA.map((d) => `
                  <label class="checkbox-row" style="background:var(--bg-surface-raised); padding:var(--space-2) var(--space-3); border-radius:var(--radius-sm);">
                    <input type="checkbox" class="dia-semana" value="${d}" /> ${d}
                  </label>`).join('')}
              </div>
            </div>
            <div class="form-group" id="grupo-dia-mes" style="display:none;">
              <label class="form-label">Día del mes (1–31)</label>
              <input class="form-control" type="number" min="1" max="31" id="r-dia-mes" value="1" />
            </div>
            <div class="form-group" id="grupo-quincenal" style="display:none;">
              <label class="form-label">Días del mes quincenal</label>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label" style="font-size:var(--fs-xs);">Primer día</label>
                  <input class="form-control" type="number" min="1" max="28" id="r-dia-q1" value="15" />
                </div>
                <div class="form-group">
                  <label class="form-label" style="font-size:var(--fs-xs);">Segundo día</label>
                  <input class="form-control" type="number" min="1" max="31" id="r-dia-q2" value="30" />
                </div>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Hora del recordatorio</label>
              <input class="form-control" type="time" id="r-hora" value="09:00" />
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" id="btn-cancelar-rec">Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/* ============================================================ TABLA */
async function cargarTabla(lista) {
  const cont = document.getElementById('contenedor-rec');
  cont.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Título</th><th>Tipo</th><th>Empresa / Proyecto</th><th>Frecuencia</th><th>Hora</th><th>Asignados</th><th>Estado</th><th>Acciones</th></tr>
        </thead>
        <tbody id="tabla-recordatorios">
          ${lista.length ? lista.map((r) => {
            const esTarea = r.tipo === 'tarea';
            const avatares = (r.asignados||[]).slice(0,4).map((a) =>
              `<div class="avatar" title="${escapeHTML(a.agente?.nombre||'')}">${iniciales(a.agente?.nombre||'?')}</div>`).join('');
            const estadoHtml = esTarea
              ? `<span class="badge badge-estado-${r.estado}">${ETIQUETAS_ESTADO[r.estado]??r.estado}</span>`
              : `<span class="badge badge-estado-${r.estado==='activo'?'completado':'archivado'}">${escapeHTML(r.estado)}</span>`;
            const accionesHtml = esTarea
              ? `<a class="btn btn-icon" href="tarea-detalle.html?id=${r.id}" title="Ver tarea">✏️</a>`
              : `<button class="btn btn-icon" data-editar='${JSON.stringify(r).replace(/'/g,"&#39;")}' title="Editar">✏️</button>
                 <button class="btn btn-icon" data-toggle="${r.id}" data-estado-actual="${r.estado}">${r.estado==='activo'?'⏸️':'▶️'}</button>
                 <button class="btn btn-icon" data-eliminar="${r.id}" style="color:var(--color-danger)">🗑️</button>`;
            return `<tr>
              <td>${escapeHTML(r.titulo)}</td>
              <td>${esTarea?'<span class="badge badge-estado-en_progreso">🔁 Tarea</span>':'<span class="badge badge-estado-archivado">📌 Recordatorio</span>'}</td>
              <td>
                ${r.empresa?.nombre?`<div style="font-size:var(--fs-xs); color:var(--text-tertiary);">${escapeHTML(r.empresa.nombre)}</div>`:''}
                ${r.proyecto?.nombre?`<div><span style="color:${r.proyecto.color_etiqueta}">●</span> ${escapeHTML(r.proyecto.nombre)}</div>`:'<div style="color:var(--text-tertiary);">—</div>'}
              </td>
              <td>${escapeHTML(etiquetaFrecuencia(r))}</td>
              <td>${r.hora_recordatorio?formatearHora(r.hora_recordatorio):'—'}</td>
              <td><div class="avatar-group">${avatares}</div></td>
              <td>${estadoHtml}</td>
              <td style="white-space:nowrap;">${accionesHtml}</td>
            </tr>`;
          }).join('') : `<tr><td colspan="8" style="text-align:center; color:var(--text-tertiary); padding:var(--space-6);">Sin recordatorios.</td></tr>`}
        </tbody>
      </table>
    </div>`;

  $$('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirEdicion(JSON.parse(b.dataset.editar.replace(/&#39;/g,"'")))));
  $$('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    const nuevo = b.dataset.estadoActual === 'activo' ? 'pausado' : 'activo';
    try { await pausarRecordatorio(b.dataset.toggle, nuevo); toastExito('Actualizado.'); cargar(); }
    catch (err) { toastError(err.message); }
  }));
  $$('[data-eliminar]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmar({ titulo: 'Eliminar recordatorio', mensaje: 'Se eliminarán también sus instancias futuras.', peligro: true, textoConfirmar: 'Eliminar' });
    if (!ok) return;
    try { await eliminarRecordatorio(b.dataset.eliminar); toastExito('Eliminado.'); cargar(); }
    catch (err) { toastError(err.message); }
  }));
}

/* ============================================================ KANBAN CARD */
function kanbanCardRec(r) {
  const esTarea = r.tipo === 'tarea';
  const avatares = (r.asignados||[]).slice(0,3).map((a) =>
    `<div class="avatar" title="${escapeHTML(a.agente?.nombre||'')}">${iniciales(a.agente?.nombre||'?')}</div>`).join('');
  return `
    <div class="kanban-card" draggable="${!esTarea}" data-id="${r.id}" data-tipo="${r.tipo}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:var(--space-2); margin-bottom:var(--space-2);">
        <span style="font-size:var(--fs-xs); font-weight:600; opacity:.7;">${esTarea?'🔁 Tarea ciclica':'📌 Recordatorio'}</span>
        <span class="badge badge-estado-${r.estado==='activo'?'completado':'archivado'}" style="font-size:10px;">${r.estado}</span>
      </div>
      <div style="font-weight:600; font-size:var(--fs-sm); margin-bottom:var(--space-2); line-height:1.3;">${escapeHTML(r.titulo)}</div>
      ${AGRUPACION!=='frecuencia'&&r.frecuencia?`<div style="font-size:var(--fs-xs); color:var(--text-tertiary); margin-bottom:var(--space-1);">🔁 ${FREC_LABEL[r.frecuencia]||r.frecuencia}</div>`:''}
      ${r.hora_recordatorio?`<div style="font-size:var(--fs-xs); color:var(--text-tertiary);">🕐 ${formatearHora(r.hora_recordatorio)}</div>`:''}
      ${AGRUPACION!=='empresa'&&r.empresa?`<div style="font-size:var(--fs-xs); color:var(--text-tertiary); margin-top:var(--space-1);">🏢 ${escapeHTML(r.empresa.nombre)}</div>`:''}
      ${AGRUPACION!=='proyecto'&&r.proyecto?`<div style="font-size:var(--fs-xs); color:var(--text-tertiary);"><span style="color:${r.proyecto.color_etiqueta}">●</span> ${escapeHTML(r.proyecto.nombre)}</div>`:''}
      <div class="avatar-group" style="margin-top:var(--space-2);">${avatares}</div>
      ${!esTarea?`<div style="display:flex; gap:var(--space-2); margin-top:var(--space-2);" onclick="event.stopPropagation()">
        <button class="btn btn-tertiary btn-sm" data-editar='${JSON.stringify(r).replace(/'/g,"&#39;")}'>✏️</button>
        <button class="btn btn-tertiary btn-sm" data-toggle="${r.id}" data-estado-actual="${r.estado}">${r.estado==='activo'?'⏸️':'▶️'}</button>
        <button class="btn btn-tertiary btn-sm" data-eliminar="${r.id}" style="color:var(--color-danger)">🗑️</button>
      </div>`:
      `<a class="btn btn-tertiary btn-sm" href="tarea-detalle.html?id=${r.id}" style="margin-top:var(--space-2); display:inline-block;">Ver tarea →</a>`}
    </div>`;
}

/* ============================================================ KANBAN RENDER */
function renderKanbanRec(cont, lista) {
  let columnas, getColId, onDrop;

  if (AGRUPACION === 'frecuencia') {
    columnas = FRECUENCIAS.map((f) => ({ id: f, label: FREC_LABEL[f] }));
    getColId = (r) => r.frecuencia || 'diaria';
    onDrop   = async (id, val, tipo) => {
      if (tipo === 'tarea') {
        const { actualizarTarea } = await import('./supabase-data.js');
        await actualizarTarea(id, { frecuencia: val });
      } else {
        await actualizarRecordatorio(id, { frecuencia: val });
      }
    };
  } else if (AGRUPACION === 'empresa') {
    columnas = [{ id:'__sin__', label:'Sin empresa' }, ...EMPRESAS.map((e) => ({ id: e.id, label: e.nombre }))];
    getColId = (r) => r.empresa_id || '__sin__';
    onDrop   = async (id, val, tipo) => {
      if (tipo === 'tarea') {
        const { actualizarTarea } = await import('./supabase-data.js');
        await actualizarTarea(id, { empresa_id: val==='__sin__'?null:val });
      } else {
        await actualizarRecordatorio(id, { empresa_id: val==='__sin__'?null:val });
      }
    };
  } else if (AGRUPACION === 'proyecto') {
    const proyUnico = [...new Map(lista.filter(r=>r.proyecto).map(r=>[r.proyecto.id,r.proyecto])).values()];
    const todos = TODOS_PROYECTOS.length ? TODOS_PROYECTOS : proyUnico;
    columnas = [{ id:'__sin__', label:'Sin proyecto' }, ...todos.map((p) => ({ id: p.id, label: p.nombre, color: p.color_etiqueta }))];
    getColId = (r) => r.proyecto_id || '__sin__';
    onDrop   = async (id, val, tipo) => {
      if (tipo === 'tarea') {
        const { actualizarTarea } = await import('./supabase-data.js');
        await actualizarTarea(id, { proyecto_id: val==='__sin__'?null:val });
      } else {
        await actualizarRecordatorio(id, { proyecto_id: val==='__sin__'?null:val });
      }
    };
  } else { // agente
    columnas = [{ id:'__sin__', label:'Sin asignar' }, ...AGENTES_EMPRESA.map((a) => ({ id: a.agente.id, label: a.agente.nombre }))];
    getColId = (r) => r.asignados?.[0]?.agente?.id || '__sin__';
    onDrop   = async (id, val, tipo) => {
      if (tipo === 'tarea') {
        const { reasignarAgentesATarea } = await import('./supabase-data.js');
        await reasignarAgentesATarea(id, val==='__sin__'?[]:[val]);
      } else {
        await reasignarAgentesARecordatorio(id, val==='__sin__'?[]:[val]);
      }
    };
  }

  cont.innerHTML = `<div class="kanban">
    ${columnas.map((col) => {
      const items = lista.filter((r) => getColId(r) === col.id);
      const topBorder = col.color ? `border-top:3px solid ${col.color};` : '';
      return `<div class="kanban-column" data-col="${col.id}" style="${topBorder}">
        <div class="kanban-column__title">
          <div class="kanban-column__title-left"><span>${escapeHTML(col.label)}</span></div>
          <span class="badge badge-estado-en_progreso">${items.length}</span>
        </div>
        <div class="kanban-cards" data-drop="${col.id}">
          ${items.map((r) => kanbanCardRec(r)).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;

  // Bind card actions
  cont.querySelectorAll('[data-editar]').forEach((b) =>
    b.addEventListener('click', () => abrirEdicion(JSON.parse(b.dataset.editar.replace(/&#39;/g,"'")))));
  cont.querySelectorAll('[data-toggle]').forEach((b) =>
    b.addEventListener('click', async () => {
      const nuevo = b.dataset.estadoActual === 'activo' ? 'pausado' : 'activo';
      try { await pausarRecordatorio(b.dataset.toggle, nuevo); toastExito('Actualizado.'); cargar(); }
      catch (err) { toastError(err.message); }
    }));
  cont.querySelectorAll('[data-eliminar]').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await confirmar({ titulo:'Eliminar', mensaje:'¿Eliminar este recordatorio?', peligro:true, textoConfirmar:'Eliminar' });
      if (!ok) return;
      try { await eliminarRecordatorio(b.dataset.eliminar); toastExito('Eliminado.'); cargar(); }
      catch (err) { toastError(err.message); }
    }));

  // Drag & drop
  $$('.kanban-card[draggable="true"]').forEach((card) => {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend',   () => card.classList.remove('dragging'));
  });
  $$('.kanban-cards').forEach((dropzone) => {
    dropzone.addEventListener('dragover',  (e) => { e.preventDefault(); dropzone.closest('.kanban-column').classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', ()  => dropzone.closest('.kanban-column').classList.remove('drag-over'));
    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.closest('.kanban-column').classList.remove('drag-over');
      const dragging = document.querySelector('.kanban-card.dragging');
      if (!dragging) return;
      const id   = dragging.dataset.id;
      const tipo = dragging.dataset.tipo;
      const val  = dropzone.dataset.drop;
      if (!id || !val) return;
      try { await onDrop(id, val, tipo); toastExito('Actualizado.'); cargar(); }
      catch (err) { toastError(err.message); }
    });
  });
}

/* ============================================================ CARGA PRINCIPAL */
async function cargar() {
  const filtros = {
    empresa_ids: msEmpresas?.getSelected() ?? [],
    agente_ids:  msAgentes?.getSelected()  ?? []
  };
  const lista = await listarRecordatorios(AGENTE.id, filtros);
  ITEMS_CACHE = lista;

  // Cache proyectos para columnas
  if (!TODOS_PROYECTOS.length && EMPRESAS.length) {
    const { listarTodosLosProyectos } = await import('./supabase-data.js');
    TODOS_PROYECTOS = await listarTodosLosProyectos().catch(() => []);
  }

  // Aplicar filtro de tipo
  const listaFiltrada = FILTRO_TIPO === 'todos' ? lista : lista.filter((r) => r.tipo === FILTRO_TIPO);

  const cont = document.getElementById('contenedor-rec');
  if (VISTA === 'tabla') {
    await cargarTabla(listaFiltrada);
  } else {
    renderKanbanRec(cont, listaFiltrada);
  }
}

/* ============================================================ MODAL */
function llenarSelectorEmpresa(selectedId) {
  $('#r-empresa').innerHTML = EMPRESAS.map((e) =>
    `<option value="${e.id}" ${e.id===selectedId?'selected':''}>${escapeHTML(e.nombre)}</option>`
  ).join('');
}

async function cargarProyectosModal(empresaId) {
  const proyectos = await listarProyectos(empresaId);
  $('#r-proyecto').innerHTML =
    '<option value="">Sin proyecto</option>' +
    proyectos.map((p) => `<option value="${p.id}">${escapeHTML(p.nombre)}</option>`).join('');
}

function cargarAgentesModal(empresaId, seleccionados = []) {
  const agentes = EMPRESAS_AGENTES[empresaId] || AGENTES_EMPRESA;
  $('#lista-agentes-rec').innerHTML = agentes.map((a) => `
    <label class="checkbox-row" style="background:var(--bg-surface-raised); padding:var(--space-2) var(--space-3); border-radius:var(--radius-sm);">
      <input type="checkbox" value="${a.agente.id}" class="agente-rec-check"
        ${seleccionados.includes(a.agente.id)?'checked':''} />
      ${escapeHTML(a.agente.nombre)}
    </label>`).join('');
}

function toggleFrecuencia() {
  const f = $('#r-frecuencia').value;
  $('#grupo-dias').style.display      = f==='semanal'   ? 'block' : 'none';
  $('#grupo-dia-mes').style.display   = f==='mensual'   ? 'block' : 'none';
  $('#grupo-quincenal').style.display = f==='quincenal' ? 'block' : 'none';
}

async function abrirEdicion(r) {
  $('#modal-rec-titulo').textContent = 'Editar recordatorio';
  $('#r-id').value = r.id;
  llenarSelectorEmpresa(r.empresa_id);
  $('#r-empresa').disabled = true;
  if (!EMPRESAS_AGENTES[r.empresa_id]) {
    EMPRESAS_AGENTES[r.empresa_id] = await listarAgentesDeEmpresa(r.empresa_id);
  }
  const seleccionados = (r.asignados||[]).map((a) => a.agente?.id).filter(Boolean);
  await cargarProyectosModal(r.empresa_id);
  cargarAgentesModal(r.empresa_id, seleccionados);
  $('#r-proyecto').value  = r.proyecto_id || '';
  $('#r-titulo').value    = r.titulo;
  $('#r-descripcion').value = r.descripcion || '';
  $('#r-frecuencia').value  = r.frecuencia;
  $('#r-hora').value        = r.hora_recordatorio || '09:00';
  toggleFrecuencia();
  if (r.frecuencia==='semanal')   $$('.dia-semana').forEach((c) => { c.checked=(r.dias_semana||[]).includes(c.value); });
  if (r.frecuencia==='mensual')   $('#r-dia-mes').value=r.dia_mes||1;
  if (r.frecuencia==='quincenal') { $('#r-dia-q1').value=r.dias_semana?.[0]||15; $('#r-dia-q2').value=r.dias_semana?.[1]||30; }
  formDirty = false;
  abrirModal('modal-recordatorio');
}

function intentarCerrar() {
  if (formDirty && !confirm('¿Descartar cambios sin guardar?')) return;
  formDirty = false;
  cerrarModal('modal-recordatorio');
}

/* ============================================================ BIND */
function bind() {
  $('#btn-cerrar-modal-rec').addEventListener('click', intentarCerrar);
  $('#btn-cancelar-rec').addEventListener('click', intentarCerrar);
  $('#modal-recordatorio').addEventListener('modal:request-close', intentarCerrar);
  $('#r-frecuencia').addEventListener('change', toggleFrecuencia);
  $('#r-empresa').addEventListener('change', async (e) => {
    const empId = e.target.value;
    await cargarProyectosModal(empId);
    if (!EMPRESAS_AGENTES[empId]) EMPRESAS_AGENTES[empId] = await listarAgentesDeEmpresa(empId);
    cargarAgentesModal(empId);
    formDirty = true;
  });
  $('#form-recordatorio').addEventListener('input',  () => { formDirty = true; });
  $('#form-recordatorio').addEventListener('change', () => { formDirty = true; });

  // Filtro de tipo (Todos / Tareas / Recordatorios)
  $$('.btn[data-tipo]').forEach((btn) =>
    btn.addEventListener('click', () => {
      FILTRO_TIPO = btn.dataset.tipo;
      $$('.btn[data-tipo]').forEach((b) => {
        b.classList.toggle('btn-primary',   b === btn);
        b.classList.toggle('btn-secondary', b !== btn);
      });
      cargar();
    }));

  // Toggle vista
  $$('.tab[data-vista]').forEach((tab) =>
    tab.addEventListener('click', () => {
      VISTA = tab.dataset.vista;
      $$('.tab[data-vista]').forEach((t) => t.classList.toggle('active', t === tab));
      const bar = $('#rec-group-bar');
      if (bar) bar.style.display = VISTA==='kanban' ? 'flex' : 'none';
      cargar();
    }));

  // Agrupación
  $$('.kanban-group-btn').forEach((btn) =>
    btn.addEventListener('click', () => {
      AGRUPACION = btn.dataset.agrup;
      $$('.kanban-group-btn').forEach((b) => b.classList.toggle('active', b===btn));
      if (VISTA==='kanban') cargar();
    }));

  $('#btn-nuevo').addEventListener('click', async () => {
    $('#modal-rec-titulo').textContent = 'Nuevo recordatorio';
    $('#r-id').value = '';
    llenarSelectorEmpresa(EMPRESA_ID);
    $('#r-empresa').disabled = false;
    $('#r-titulo').value = '';
    $('#r-descripcion').value = '';
    $('#r-frecuencia').value = 'diaria';
    $('#r-hora').value = '09:00';
    $('#r-dia-mes').value = 1;
    $('#r-dia-q1').value = 15;
    $('#r-dia-q2').value = 30;
    $$('.dia-semana').forEach((c) => { c.checked=false; });
    toggleFrecuencia();
    await cargarProyectosModal(EMPRESA_ID);
    cargarAgentesModal(EMPRESA_ID);
    formDirty = false;
    abrirModal('modal-recordatorio');
  });

  $('#form-recordatorio').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id         = $('#r-id').value;
    const frecuencia = $('#r-frecuencia').value;
    const datos = {
      agente_id:         AGENTE.id,
      empresa_id:        $('#r-empresa').value || EMPRESA_ID,
      proyecto_id:       $('#r-proyecto').value || null,
      titulo:            $('#r-titulo').value.trim(),
      descripcion:       $('#r-descripcion').value.trim(),
      frecuencia,
      hora_recordatorio: $('#r-hora').value || null,
      dias_semana:       null,
      dia_mes:           null,
      agentes_ids:       $$('.agente-rec-check:checked').map((c) => c.value)
    };
    if (frecuencia==='semanal')   datos.dias_semana = $$('.dia-semana:checked').map((c) => c.value);
    else if (frecuencia==='mensual')   datos.dia_mes = Number($('#r-dia-mes').value)||1;
    else if (frecuencia==='quincenal') datos.dias_semana = [String(Number($('#r-dia-q1').value)||15), String(Number($('#r-dia-q2').value)||30)];
    try {
      if (id) await actualizarRecordatorio(id, datos);
      else    await crearRecordatorio(datos);
      toastExito('Recordatorio guardado.');
      formDirty = false;
      cerrarModal('modal-recordatorio');
      cargar();
    } catch (err) { toastError(err.message); }
  });
}

/* ============================================================ INIT */
async function init() {
  renderLayout('recordatorios');
  const ctx = await inicializarApp();
  if (!ctx) return;
  AGENTE = ctx.agente;
  EMPRESA_ID = ctx.empresaId;
  document.getElementById('main-content').innerHTML = plantilla();

  EMPRESAS = await obtenerEmpresasDelAgente(AGENTE.id);
  const agentesXEmpresa = await Promise.all(EMPRESAS.map((e) => listarAgentesDeEmpresa(e.id)));
  EMPRESAS.forEach((e, i) => { EMPRESAS_AGENTES[e.id] = agentesXEmpresa[i]; });
  const seen = new Set();
  AGENTES_EMPRESA = agentesXEmpresa.flat().filter((a) => { if (seen.has(a.agente.id)) return false; seen.add(a.agente.id); return true; });

  msEmpresas = crearMultiSelect({
    placeholder: 'Empresas',
    options: EMPRESAS.map((e) => ({ value: e.id, label: e.nombre })),
    onChange: () => cargar()
  });
  $('#slot-ms-empresas-rec').appendChild(msEmpresas.el);

  msAgentes = crearMultiSelect({
    placeholder: 'Agentes',
    options: AGENTES_EMPRESA.map((a) => ({ value: a.agente.id, label: a.agente.nombre })),
    onChange: () => cargar()
  });
  msAgentes.setSelected([AGENTE.id]);
  $('#slot-ms-agentes-rec').appendChild(msAgentes.el);

  bind();
  await cargar();
}

init();
