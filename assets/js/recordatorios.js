import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import {
  listarRecordatorios, crearTarea, actualizarTarea, eliminarTarea,
  sincronizarRecordatorioPorTarea,
  obtenerEmpresasDelAgente, listarProyectos, listarAgentesDeEmpresa
} from './supabase-data.js';
import { $, $$, escapeHTML, formatearHora, formatearFecha, crearMultiSelect, iniciales, ETIQUETAS_ESTADO } from './utils.js';

let AGENTE, EMPRESA_ID;
let EMPRESAS       = [];
let AGENTES_EMPRESA = [];
let EMPRESAS_AGENTES = {};
let TODOS_PROYECTOS  = [];
let msEmpresas, msAgentes;
let formDirty = false;

let VISTA          = 'tabla';                        // 'tabla' | 'kanban'
let AGRUPACION     = 'frecuencia';                   // 'frecuencia' | 'empresa' | 'proyecto' | 'agente'
let FILTRO_TIPO    = ['puntual', 'cronologica'];     // multi-select: 'puntual' | 'cronologica'
let FILTRO_ESTADO  = ['nuevo', 'en_progreso', 'en_revision', 'completado']; // sin 'archivado' por defecto
let ITEMS_CACHE    = [];
let msTipo         = null;
let msEstado       = null;

const DIAS_SEMANA = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const FRECUENCIAS = ['unica','diaria','semanal','quincenal','mensual','anual'];
const FREC_LABEL  = { unica:'Única', diaria:'Diaria', semanal:'Semanal', mensual:'Mensual', quincenal:'Quincenal', anual:'Anual' };

function etiquetaFrecuencia(r) {
  switch (r.frecuencia) {
    case 'unica':     return 'Única';
    case 'diaria':    return 'Diaria';
    case 'semanal':   return `Semanal (${(r.dias_semana||[]).join(', ')})`;
    case 'mensual':   return `Mensual (día ${r.dia_mes||1})`;
    case 'quincenal': return `Quincenal (días ${r.dias_semana?.[0]||15} y ${r.dias_semana?.[1]||30})`;
    case 'anual':     return 'Anual';
    default:          return r.frecuencia ?? '—';
  }
}

/* ============================================================ PLANTILLA */
function plantilla() {
  return `
    <div class="page-header">
      <div><h1>Tareas y Recordatorios</h1><p class="page-header__subtitle">Tareas puntuales y recordatorios cronológicos recurrentes.</p></div>
      <button class="btn btn-primary" id="btn-nuevo">+ Nueva tarea</button>
    </div>

    <div class="table-toolbar" style="flex-wrap:wrap; gap:var(--space-2);">
      <div id="slot-ms-empresas-rec"></div>
      <div id="slot-ms-agentes-rec"></div>
      <div id="slot-ms-tipo-rec"></div>
      <div id="slot-ms-estado-rec"></div>
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

    <!-- Modal crear / editar tarea (puntual o cronológica) -->
    <div class="modal-overlay" id="modal-recordatorio" data-managed-close="true">
      <div class="modal modal--lg">
        <div class="modal__header">
          <h3 id="modal-rec-titulo">Nueva tarea</h3>
          <button class="btn-icon" id="btn-cerrar-modal-rec">✕</button>
        </div>
        <form id="form-recordatorio">
          <div class="modal__body">
            <input type="hidden" id="r-id" />
            <input type="hidden" id="r-creador-id" />
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
              <label class="form-label">Título *</label>
              <input class="form-control" id="r-titulo" required />
            </div>
            <div class="form-group">
              <label class="form-label">Descripción</label>
              <textarea class="form-control" id="r-descripcion"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label" style="display:flex; align-items:center; gap:var(--space-3); cursor:pointer;">
                <input type="checkbox" id="r-es-cronologica" style="width:16px; height:16px;" />
                <span>¿Es cronológica / recurrente?</span>
              </label>
            </div>
            <div id="grupo-frecuencia-completo" style="display:none;">
              <div class="form-group">
                <label class="form-label">Frecuencia</label>
                <select class="form-control" id="r-frecuencia">
                  ${FRECUENCIAS.map((f) => `<option value="${f}">${FREC_LABEL[f]}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" id="grupo-fecha-inicio" style="display:none;">
                <label class="form-label" id="label-fecha-inicio">Fecha</label>
                <input class="form-control" type="date" id="r-fecha-inicio" />
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
            </div>

            <!-- Hora de recordatorio — visible siempre, obligatorio -->
            <div class="form-group">
              <label class="form-label">Hora de recordatorio *</label>
              <input class="form-control" type="time" id="r-hora" value="09:00" required style="max-width:160px;" />
            </div>

            <!-- Fecha de cierre — obligatorio para puntuales, opcional para cronológicas -->
            <div class="form-group">
              <label class="form-label" style="display:flex; align-items:center; gap:var(--space-1);">
                <span id="label-fecha-cierre-txt">Fecha de cierre *</span>
                <button type="button" id="btn-tooltip-fecha-cierre" class="btn-icon" style="font-size:var(--fs-xs); opacity:.7; line-height:1;"
                  title="¿Qué es fecha de cierre?">(?)
                </button>
              </label>
              <div id="tooltip-fecha-cierre" style="display:none; font-size:var(--fs-xs); color:var(--text-secondary); background:var(--bg-surface-raised); padding:var(--space-2) var(--space-3); border-radius:var(--radius-sm); margin-bottom:var(--space-2);">
                Para tareas puntuales es obligatorio — aparece en el calendario. Para cronológicas es opcional (las instancias se generan por frecuencia).
              </div>
              <input class="form-control" type="date" id="r-fecha-cierre" style="max-width:200px;" />
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" id="btn-cancelar-rec">Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Panel lateral detalle -->
    <div class="side-panel-overlay" id="panel-rec-overlay"></div>
    <aside class="side-panel" id="panel-rec">
      <div class="side-panel__header">
        <h3 id="panel-rec-titulo">Detalle</h3>
        <button class="btn-icon" id="btn-cerrar-panel-rec">✕</button>
      </div>
      <div class="side-panel__body" id="panel-rec-body"></div>
      <div class="side-panel__footer">
        <button class="btn btn-secondary" id="btn-editar-panel-rec">✏️ Editar</button>
        <button class="btn btn-danger" id="btn-eliminar-panel-rec">🗑️ Eliminar</button>
      </div>
    </aside>
  `;
}

/* ============================================================ PANEL LATERAL */
async function abrirPanelRec(r) {
  const { listarComentarios, crearComentario, listarHistorialTarea, cambiarEstadoTarea } = await import('./supabase-data.js');

  $('#panel-rec-titulo').textContent = r.titulo;

  const esCron = r.tipo === 'cronologica';
  const comentarios = await listarComentarios(r.id).catch(() => []);
  const { data: historial } = await listarHistorialTarea(r.id, 0, 10).catch(() => ({ data: [] }));

  const ESTADOS_LISTA = ['nuevo', 'en_progreso', 'en_revision', 'completado', 'archivado'];
  $('#panel-rec-body').innerHTML = `
    <div class="form-group">
      <label class="form-label">Estado</label>
      <select class="form-control" id="panel-rec-estado">
        ${ESTADOS_LISTA.map((e) => `<option value="${e}" ${e === r.estado ? 'selected' : ''}>${ETIQUETAS_ESTADO[e]}</option>`).join('')}
      </select>
    </div>
    <p style="margin:var(--space-3) 0; display:flex; gap:var(--space-2); flex-wrap:wrap;">
      ${esCron
        ? '<span class="badge badge-estado-en_progreso">🔁 Cronológica</span>'
        : '<span class="badge badge-estado-archivado">📌 Puntual</span>'}
    </p>
    <p style="font-size:var(--fs-sm); color:var(--text-secondary); margin:var(--space-3) 0;">${escapeHTML(r.descripcion || 'Sin descripción.')}</p>
    <p style="font-size:var(--fs-xs); color:var(--text-tertiary); margin:var(--space-2) 0;">
      ${esCron ? `🔁 ${etiquetaFrecuencia(r)}` : ''}
      ${r.hora_recordatorio ? `⏰ ${r.hora_recordatorio.slice(0,5)}` : ''}
      ${r.fecha_cierre && !esCron ? `📅 Cierre: ${formatearFecha(r.fecha_cierre)}` : ''}
    </p>
    <div style="margin:var(--space-3) 0;">
      <strong style="font-size:var(--fs-sm);">Asignados:</strong>
      <div class="avatar-group" style="margin-top:var(--space-2);">
        ${(r.asignados||[]).map((a) => `<div class="avatar" title="${escapeHTML(a.agente?.nombre||'')}">${iniciales(a.agente?.nombre||'?')}</div>`).join('')}
      </div>
    </div>

    <h4 style="margin-top:var(--space-5);">Comentarios</h4>
    <div id="panel-rec-comentarios" style="max-height:200px; overflow-y:auto; margin:var(--space-3) 0;">
      ${comentarios.length ? comentarios.map((c) => `
        <div style="display:flex; gap:var(--space-2); margin-bottom:var(--space-3);">
          <div class="avatar">${iniciales(c.agente?.nombre || '?')}</div>
          <div>
            <div style="font-size:var(--fs-xs); font-weight:600;">${escapeHTML(c.agente?.nombre || '')}</div>
            <div style="font-size:var(--fs-sm);">${escapeHTML(c.texto)}</div>
          </div>
        </div>`).join('') : '<p style="color:var(--text-tertiary); font-size:var(--fs-sm);">Sin comentarios.</p>'}
    </div>
    <form id="form-panel-comentario" style="display:flex; gap:var(--space-2);">
      <input class="form-control" id="input-panel-comentario" placeholder="Agregar comentario…" />
      <button class="btn btn-primary btn-sm" type="submit">Enviar</button>
    </form>

    <h4 style="margin-top:var(--space-5);">Historial</h4>
    <div style="font-size:var(--fs-xs); color:var(--text-tertiary);">
      ${historial?.length ? historial.map((h) => `
        <div style="padding:var(--space-2) 0; border-bottom:1px solid var(--border-subtle);">
          ${escapeHTML(h.campo_modificado)}: ${escapeHTML(h.valor_antiguo || '—')} → ${escapeHTML(h.valor_nuevo || '—')}
        </div>`).join('') : 'Sin cambios registrados.'}
    </div>
  `;

  // Bind estado
  $('#panel-rec-estado').addEventListener('change', async (e) => {
    try {
      await cambiarEstadoTarea(r.id, e.target.value, AGENTE.id);
      toastExito('Estado actualizado.');
      // Actualizar cache local para no recargar toda la lista
      r.estado = e.target.value;
      cargar();
    } catch (err) { toastError(err.message); }
  });

  // Bind comentario
  $('#form-panel-comentario').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const texto = $('#input-panel-comentario').value.trim();
    if (!texto) return;
    try {
      await crearComentario({ tarea_id: r.id, agente_id: AGENTE.id, texto });
      $('#input-panel-comentario').value = '';
      abrirPanelRec(r);
    } catch (err) { toastError(err.message); }
  });

  // Bind botón editar del footer
  $('#btn-editar-panel-rec').onclick = () => { cerrarPanelRec(); abrirEdicion(r); };
  $('#btn-eliminar-panel-rec').onclick = async () => {
    const ok = await confirmar({ titulo: 'Eliminar tarea', mensaje: 'Se eliminarán también sus instancias futuras si es cronológica.', peligro: true, textoConfirmar: 'Eliminar' });
    if (!ok) return;
    try { await eliminarTarea(r.id); toastExito('Eliminada.'); cerrarPanelRec(); cargar(); }
    catch (err) { toastError(err.message); }
  };

  $('#panel-rec').classList.add('open');
  $('#panel-rec-overlay').classList.add('open');
}

function cerrarPanelRec() {
  $('#panel-rec').classList.remove('open');
  $('#panel-rec-overlay').classList.remove('open');
}

/* ============================================================ TABLA */
async function cargarTabla(lista) {
  const cont = document.getElementById('contenedor-rec');
  cont.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Título</th><th>Tipo</th><th>Empresa / Proyecto</th><th>Frecuencia</th><th>Hora</th><th>Fecha cierre</th><th>Asignados</th><th>Estado</th></tr>
        </thead>
        <tbody id="tabla-recordatorios">
          ${lista.length ? lista.map((r) => {
            const esCron = r.tipo === 'cronologica';
            const avatares = (r.asignados||[]).slice(0,4).map((a) =>
              `<div class="avatar" title="${escapeHTML(a.agente?.nombre||'')}">${iniciales(a.agente?.nombre||'?')}</div>`).join('');
            return `<tr data-abrir="${r.id}" style="cursor:pointer;">
              <td>${escapeHTML(r.titulo)}</td>
              <td>${esCron
                ? '<span class="badge badge-estado-en_progreso">🔁 Cronológica</span>'
                : '<span class="badge badge-estado-archivado">📌 Puntual</span>'}</td>
              <td>
                ${r.empresa?.nombre?`<div style="font-size:var(--fs-xs); color:var(--text-tertiary);">${escapeHTML(r.empresa.nombre)}</div>`:''}
                ${r.proyecto?.nombre?`<div><span style="color:${r.proyecto.color_etiqueta}">●</span> ${escapeHTML(r.proyecto.nombre)}</div>`:'<div style="color:var(--text-tertiary);">—</div>'}
              </td>
              <td>${esCron ? escapeHTML(etiquetaFrecuencia(r)) : '—'}</td>
              <td>${r.hora_recordatorio ? r.hora_recordatorio.slice(0,5) : '—'}</td>
              <td>${r.fecha_cierre ? formatearFecha(r.fecha_cierre) : '—'}</td>
              <td><div class="avatar-group">${avatares}</div></td>
              <td><span class="badge badge-estado-${r.estado}">${ETIQUETAS_ESTADO[r.estado]??r.estado}</span></td>
            </tr>`;
          }).join('') : `<tr><td colspan="8" style="text-align:center; color:var(--text-tertiary); padding:var(--space-6);">Sin tareas.</td></tr>`}
        </tbody>
      </table>
    </div>`;

  // Fila clickeable → abre panel lateral
  $$('[data-abrir]').forEach((tr) => {
    tr.addEventListener('click', () => {
      const r = lista.find((x) => x.id === tr.dataset.abrir);
      if (r) abrirPanelRec(r);
    });
  });
}

/* ============================================================ KANBAN CARD */
function kanbanCardRec(r) {
  const esCron = r.tipo === 'cronologica';
  const avatares = (r.asignados||[]).slice(0,3).map((a) =>
    `<div class="avatar" title="${escapeHTML(a.agente?.nombre||'')}">${iniciales(a.agente?.nombre||'?')}</div>`).join('');
  return `
    <div class="kanban-card" draggable="true" data-id="${r.id}" data-tipo="${r.tipo}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:var(--space-2); margin-bottom:var(--space-2);">
        <span style="font-size:var(--fs-xs); font-weight:600; opacity:.7;">${esCron?'🔁 Cronológica':'📌 Puntual'}</span>
        <span class="badge badge-estado-${r.estado}" style="font-size:10px;">${ETIQUETAS_ESTADO[r.estado]??r.estado}</span>
      </div>
      <div style="font-weight:600; font-size:var(--fs-sm); margin-bottom:var(--space-2); line-height:1.3;">${escapeHTML(r.titulo)}</div>
      ${esCron&&AGRUPACION!=='frecuencia'&&r.frecuencia?`<div style="font-size:var(--fs-xs); color:var(--text-tertiary); margin-bottom:var(--space-1);">🔁 ${FREC_LABEL[r.frecuencia]||r.frecuencia}</div>`:''}
      ${r.hora_recordatorio?`<div style="font-size:var(--fs-xs); color:var(--text-tertiary);">🕐 ${formatearHora(r.hora_recordatorio)}</div>`:''}
      ${r.fecha_cierre&&!esCron?`<div style="font-size:var(--fs-xs); color:var(--text-tertiary);">📅 ${formatearFecha(r.fecha_cierre)}</div>`:''}
      ${AGRUPACION!=='empresa'&&r.empresa?`<div style="font-size:var(--fs-xs); color:var(--text-tertiary); margin-top:var(--space-1);">🏢 ${escapeHTML(r.empresa.nombre)}</div>`:''}
      ${AGRUPACION!=='proyecto'&&r.proyecto?`<div style="font-size:var(--fs-xs); color:var(--text-tertiary);"><span style="color:${r.proyecto.color_etiqueta}">●</span> ${escapeHTML(r.proyecto.nombre)}</div>`:''}
      <div class="avatar-group" style="margin-top:var(--space-2);">${avatares}</div>
      <div style="display:flex; gap:var(--space-2); margin-top:var(--space-2);" onclick="event.stopPropagation()">
        <button class="btn btn-tertiary btn-sm" data-editar='${JSON.stringify(r).replace(/'/g,"&#39;")}'>✏️</button>
        <a class="btn btn-tertiary btn-sm" href="tarea-detalle.html?id=${r.id}">🔍</a>
        <button class="btn btn-tertiary btn-sm" data-eliminar="${r.id}" style="color:var(--color-danger)">🗑️</button>
      </div>
    </div>`;
}

/* ============================================================ KANBAN RENDER */
function renderKanbanRec(cont, lista) {
  let columnas, getColId, onDrop;

  // Todos los items ahora son tareas — solo usamos actualizarTarea
  if (AGRUPACION === 'frecuencia') {
    columnas = FRECUENCIAS.map((f) => ({ id: f, label: FREC_LABEL[f] }));
    getColId = (r) => r.frecuencia || 'unica';
    onDrop   = async (id, val) => { await actualizarTarea(id, { frecuencia: val }); };
  } else if (AGRUPACION === 'empresa') {
    columnas = [{ id:'__sin__', label:'Sin empresa' }, ...EMPRESAS.map((e) => ({ id: e.id, label: e.nombre }))];
    getColId = (r) => r.empresa_id || '__sin__';
    onDrop   = async (id, val) => { await actualizarTarea(id, { empresa_id: val==='__sin__'?null:val }); };
  } else if (AGRUPACION === 'proyecto') {
    const proyUnico = [...new Map(lista.filter(r=>r.proyecto).map(r=>[r.proyecto.id,r.proyecto])).values()];
    const todos = TODOS_PROYECTOS.length ? TODOS_PROYECTOS : proyUnico;
    columnas = [{ id:'__sin__', label:'Sin proyecto' }, ...todos.map((p) => ({ id: p.id, label: p.nombre, color: p.color_etiqueta }))];
    getColId = (r) => r.proyecto_id || '__sin__';
    onDrop   = async (id, val) => { await actualizarTarea(id, { proyecto_id: val==='__sin__'?null:val }); };
  } else { // agente
    columnas = [{ id:'__sin__', label:'Sin asignar' }, ...AGENTES_EMPRESA.map((a) => ({ id: a.agente.id, label: a.agente.nombre }))];
    getColId = (r) => r.asignados?.[0]?.agente?.id || '__sin__';
    onDrop   = async (id, val) => {
      const { reasignarAgentesATarea } = await import('./supabase-data.js');
      await reasignarAgentesATarea(id, val==='__sin__'?[]:[val]);
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
  cont.querySelectorAll('[data-eliminar]').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await confirmar({ titulo:'Eliminar tarea', mensaje:'Se eliminarán también sus instancias futuras si es cronológica.', peligro:true, textoConfirmar:'Eliminar' });
      if (!ok) return;
      try { await eliminarTarea(b.dataset.eliminar); toastExito('Eliminada.'); cargar(); }
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
      const val  = dropzone.dataset.drop;
      if (!id || !val) return;
      try { await onDrop(id, val); toastExito('Actualizado.'); cargar(); }
      catch (err) { toastError(err.message); }
    });
  });
}

/* ============================================================ CARGA PRINCIPAL */
async function cargar() {
  const filtros = {
    empresa_ids: msEmpresas?.getSelected() ?? [],
    agente_ids:  msAgentes?.getSelected()  ?? [],
    estados:     FILTRO_ESTADO.length ? FILTRO_ESTADO : undefined
  };
  const lista = await listarRecordatorios(AGENTE.id, filtros);
  ITEMS_CACHE = lista;

  // Cache proyectos para columnas kanban
  if (!TODOS_PROYECTOS.length && EMPRESAS.length) {
    const { listarTodosLosProyectos } = await import('./supabase-data.js');
    TODOS_PROYECTOS = await listarTodosLosProyectos().catch(() => []);
  }

  // Aplicar filtro de tipo (multi-select)
  const listaFiltrada = FILTRO_TIPO.length === 0 || FILTRO_TIPO.length === 2
    ? lista
    : lista.filter((r) => FILTRO_TIPO.includes(r.tipo));

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

function toggleSeccionCronologica() {
  const esCron = $('#r-es-cronologica')?.checked;
  $('#grupo-frecuencia-completo').style.display = esCron ? 'block' : 'none';
  if (esCron) toggleFrecuencia();
  // Actualizar label y obligatoriedad de fecha_cierre
  const lbl = $('#label-fecha-cierre-txt');
  const inp = $('#r-fecha-cierre');
  if (lbl) lbl.textContent = esCron ? 'Fecha de cierre (opcional)' : 'Fecha de cierre *';
  if (inp) inp.required = !esCron;
}

function toggleFrecuencia() {
  const f = $('#r-frecuencia')?.value;
  const mostrarFecha = f === 'unica' || f === 'anual';
  $('#grupo-fecha-inicio').style.display = mostrarFecha  ? 'block' : 'none';
  $('#grupo-dias').style.display         = f === 'semanal'   ? 'block' : 'none';
  $('#grupo-dia-mes').style.display      = f === 'mensual'   ? 'block' : 'none';
  $('#grupo-quincenal').style.display    = f === 'quincenal' ? 'block' : 'none';
  if (mostrarFecha) {
    $('#label-fecha-inicio').textContent = f === 'unica' ? 'Fecha del recordatorio *' : 'Fecha aniversario (día y mes) *';
  }
}

async function abrirEdicion(r) {
  // r ahora es una tarea (con tipo 'puntual' | 'cronologica')
  $('#modal-rec-titulo').textContent = 'Editar tarea';
  $('#r-id').value = r.id;
  $('#r-creador-id').value = r.creador_id || AGENTE.id;
  llenarSelectorEmpresa(r.empresa_id);
  $('#r-empresa').disabled = true;
  if (!EMPRESAS_AGENTES[r.empresa_id]) {
    EMPRESAS_AGENTES[r.empresa_id] = await listarAgentesDeEmpresa(r.empresa_id);
  }
  const seleccionados = (r.asignados||[]).map((a) => a.agente?.id).filter(Boolean);
  await cargarProyectosModal(r.empresa_id);
  cargarAgentesModal(r.empresa_id, seleccionados);
  $('#r-proyecto').value     = r.proyecto_id || '';
  $('#r-titulo').value       = r.titulo;
  $('#r-descripcion').value  = r.descripcion || '';
  $('#r-fecha-cierre').value = r.fecha_cierre?.substring(0,10) || '';

  const esCron = r.tipo === 'cronologica';
  $('#r-es-cronologica').checked = esCron;
  toggleSeccionCronologica();
  // hora_recordatorio siempre visible (puntual o cronológica)
  $('#r-hora').value = r.hora_recordatorio?.substring(0, 5) || '09:00';
  if (esCron) {
    $('#r-frecuencia').value = r.frecuencia || 'diaria';
    toggleFrecuencia();
    if (r.frecuencia==='semanal')   $$('.dia-semana').forEach((c) => { c.checked=(r.dias_semana||[]).includes(c.value); });
    if (r.frecuencia==='mensual')   $('#r-dia-mes').value=r.dia_mes||1;
    if (r.frecuencia==='quincenal') { $('#r-dia-q1').value=r.dias_semana?.[0]||15; $('#r-dia-q2').value=r.dias_semana?.[1]||30; }
    if (r.frecuencia==='unica'||r.frecuencia==='anual') $('#r-fecha-inicio').value=r.fecha_inicio?.substring(0,10)||'';
  }
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
  // Panel lateral
  $('#btn-cerrar-panel-rec').addEventListener('click', cerrarPanelRec);
  $('#panel-rec-overlay').addEventListener('click', cerrarPanelRec);

  $('#btn-cerrar-modal-rec').addEventListener('click', intentarCerrar);
  $('#btn-cancelar-rec').addEventListener('click', intentarCerrar);
  $('#modal-recordatorio').addEventListener('modal:request-close', intentarCerrar);
  $('#r-frecuencia').addEventListener('change', toggleFrecuencia);
  $('#r-es-cronologica').addEventListener('change', toggleSeccionCronologica);
  $('#r-empresa').addEventListener('change', async (e) => {
    const empId = e.target.value;
    await cargarProyectosModal(empId);
    if (!EMPRESAS_AGENTES[empId]) EMPRESAS_AGENTES[empId] = await listarAgentesDeEmpresa(empId);
    cargarAgentesModal(empId);
    formDirty = true;
  });
  $('#form-recordatorio').addEventListener('input',  () => { formDirty = true; });
  $('#form-recordatorio').addEventListener('change', () => { formDirty = true; });

  // Tooltip fecha-cierre (4 segundos)
  let tooltipTimer;
  $('#btn-tooltip-fecha-cierre').addEventListener('click', () => {
    const tip = $('#tooltip-fecha-cierre');
    tip.style.display = 'block';
    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => { tip.style.display = 'none'; }, 4000);
  });

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
    $('#modal-rec-titulo').textContent = 'Nueva tarea';
    $('#r-id').value = '';
    $('#r-creador-id').value = AGENTE.id;
    llenarSelectorEmpresa(EMPRESA_ID);
    $('#r-empresa').disabled = false;
    $('#r-titulo').value = '';
    $('#r-descripcion').value = '';
    $('#r-fecha-cierre').value = '';
    $('#r-es-cronologica').checked = false;
    toggleSeccionCronologica();
    $('#r-frecuencia').value = 'diaria';
    $('#r-hora').value = '09:00'; // siempre visible ahora
    $('#r-dia-mes').value = 1;
    $('#r-dia-q1').value = 15;
    $('#r-dia-q2').value = 30;
    $$('.dia-semana').forEach((c) => { c.checked=false; });
    $('#r-fecha-inicio').value = '';
    await cargarProyectosModal(EMPRESA_ID);
    cargarAgentesModal(EMPRESA_ID);
    formDirty = false;
    abrirModal('modal-recordatorio');
  });

  $('#form-recordatorio').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id           = $('#r-id').value;
    const esCronologica = $('#r-es-cronologica').checked;
    const frecuencia   = esCronologica ? $('#r-frecuencia').value : 'unica';
    const fechaCierre  = $('#r-fecha-cierre').value;
    const agentesIds   = $$('.agente-rec-check:checked').map((c) => c.value);
    const hoy          = new Date().toISOString().slice(0, 10);

    // hora_recordatorio siempre requerida
    const horaRec = $('#r-hora').value;
    if (!horaRec) {
      toastError('La hora de recordatorio es requerida');
      $('#r-hora').focus();
      return;
    }

    // fecha_cierre requerida solo para tareas puntuales
    if (!esCronologica && !fechaCierre) {
      toastError('La fecha de cierre es requerida para tareas puntuales');
      $('#r-fecha-cierre').focus();
      return;
    }

    const datos = {
      creador_id:        $('#r-creador-id').value || AGENTE.id,
      empresa_id:        $('#r-empresa').value || EMPRESA_ID,
      proyecto_id:       $('#r-proyecto').value || null,
      titulo:            $('#r-titulo').value.trim(),
      descripcion:       $('#r-descripcion').value.trim() || null,
      es_cronologica:    esCronologica,
      frecuencia,
      hora_recordatorio: horaRec,
      dias_semana:       null,
      dia_mes:           null,
      dia_mes_2:         null,
      fecha_inicio:      esCronologica ? null : hoy,
      fecha_cierre:      fechaCierre || null,
      agentes_ids:       agentesIds
    };

    if (esCronologica) {
      if (frecuencia==='semanal')        datos.dias_semana = $$('.dia-semana:checked').map((c) => c.value);
      else if (frecuencia==='mensual')   datos.dia_mes     = Number($('#r-dia-mes').value)||1;
      else if (frecuencia==='quincenal') {
        const d1 = Number($('#r-dia-q1').value)||15;
        const d2 = Number($('#r-dia-q2').value)||30;
        datos.dias_semana = [String(d1), String(d2)];
        datos.dia_mes_2   = d2;
        datos.dia_mes     = d1;
      }
      if (frecuencia==='unica'||frecuencia==='anual') {
        const fi = $('#r-fecha-inicio').value;
        if (!fi) { toastError('Ingresa la fecha para esta frecuencia'); return; }
        datos.fecha_inicio = fi;
      } else if (!datos.fecha_inicio) {
        datos.fecha_inicio = hoy;
      }
    }

    try {
      let tareaGuardada;
      if (id) {
        const { agentes_ids, creador_id, ...cambios } = datos;
        tareaGuardada = await actualizarTarea(id, cambios);
        tareaGuardada = { ...tareaGuardada, id };
      } else {
        tareaGuardada = await crearTarea(datos);
      }
      if (esCronologica) {
        await sincronizarRecordatorioPorTarea({ ...datos, id: tareaGuardada.id ?? id }, agentesIds);
      }
      toastExito('Tarea guardada.');
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

  msTipo = crearMultiSelect({
    placeholder: 'Tipo',
    options: [
      { value: 'puntual',     label: '📌 Puntual' },
      { value: 'cronologica', label: '🔁 Cronológica' }
    ],
    onChange(ids) { FILTRO_TIPO = ids; cargar(); }
  });
  msTipo.setSelected(FILTRO_TIPO);
  $('#slot-ms-tipo-rec').appendChild(msTipo.el);

  const TODOS_ESTADOS = ['nuevo', 'en_progreso', 'en_revision', 'completado', 'archivado'];
  msEstado = crearMultiSelect({
    placeholder: 'Estado',
    options: TODOS_ESTADOS.map((s) => ({ value: s, label: ETIQUETAS_ESTADO[s] ?? s })),
    onChange(ids) { FILTRO_ESTADO = ids; cargar(); }
  });
  msEstado.setSelected(FILTRO_ESTADO);
  $('#slot-ms-estado-rec').appendChild(msEstado.el);

  bind();
  await cargar();
}

init();
