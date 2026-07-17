import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError } from './main.js';
import {
  obtenerEventosCalendario, moverTarea, obtenerTarea, completarInstancia,
  listarComentarios, crearComentario, cambiarEstadoTarea,
  listarHistorialTarea, obtenerEmpresasDelAgente, listarTodosLosProyectos,
  listarAgentesDeEmpresa, asignarAgentesATarea, desasignarAgenteDeTarea
} from './supabase-data.js';
import {
  $, $$, escapeHTML, formatearFecha, formatearHora, iniciales,
  ETIQUETAS_ESTADO, ETIQUETAS_PRIORIDAD, COLORES_PRIORIDAD, COLORES_ESTADO,
  cacheLocal, crearMultiSelect
} from './utils.js';
import { CONFIG } from './config.js';

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
let EMPRESA_ID, AGENTE_ID, AGENTE;
let EMPRESAS = [];

let estado = {
  vista: 'mensual',
  fecha: new Date(),
  indicador: cacheLocal.get(CONFIG.STORAGE_KEYS.INDICADOR_CALENDARIO) || 'prioridad',
  proyectoIds: [],   // [] = todos los proyectos
  empresaIds: [],    // [] = todas las empresas del usuario
  agenteIds: []      // [] = [AGENTE_ID] por defecto, editable por el usuario
};

// Instancias de multiselect
let msProyectos = null;
let msEmpresas  = null;
let msAgentes   = null;
let AGENTES_CAL = [];

/* ============================================================
   PLANTILLA
   ============================================================ */
function plantilla() {
  return `
    <div class="page-header">
      <div><h1>Calendario</h1><p class="page-header__subtitle">Tareas puntuales y recordatorios cronológicos.</p></div>
      <button class="btn btn-primary" id="btn-nueva-tarea-cal">+ Nueva tarea</button>
    </div>

    <div class="calendar-toolbar">
      <!-- Navegación de período -->
      <div class="calendar-nav">
        <button class="btn btn-icon" id="btn-prev">←</button>
        <h3 id="titulo-periodo" style="min-width:200px; text-align:center;"></h3>
        <button class="btn btn-icon" id="btn-next">→</button>
        <button class="btn btn-secondary btn-sm" id="btn-hoy">Hoy</button>
      </div>

      <!-- Vistas -->
      <div class="tabs" style="border-bottom:none; margin:0;">
        <div class="tab" data-vista="mensual">Mensual</div>
        <div class="tab" data-vista="semanal">Semanal</div>
        <div class="tab" data-vista="diaria">Diaria</div>
      </div>

      <!-- Filtros -->
      <div style="display:flex; align-items:center; gap:var(--space-3); flex-wrap:wrap;">
        <div id="slot-filtro-empresas-cal"></div>
        <div id="slot-filtro-proyectos"></div>
        <div id="slot-filtro-agentes-cal"></div>
        <select class="form-control" id="select-indicador" style="max-width:190px;">
          <option value="prioridad">Color por prioridad</option>
          <option value="estado">Color por estado</option>
        </select>
      </div>
    </div>

    <div id="calendario-contenedor"><div class="loading-spinner"></div></div>

    <!-- Panel lateral de detalle -->
    <div class="side-panel-overlay" id="cal-panel-overlay"></div>
    <aside class="side-panel" id="cal-panel">
      <div class="side-panel__header">
        <h3 id="cal-panel-titulo">Detalle</h3>
        <button class="btn-icon" id="cal-cerrar-panel">✕</button>
      </div>
      <div class="side-panel__body" id="cal-panel-body"></div>
      <div class="side-panel__footer">
        <a class="btn btn-secondary" id="cal-editar-link" href="tarea-detalle.html">Editar tarea</a>
        <button class="btn btn-danger" id="cal-eliminar-btn" style="display:none;">Eliminar</button>
      </div>
    </aside>
  `;
}

/* ============================================================
   COLOR DE EVENTO
   ============================================================ */
function colorEvento(e) {
  if (estado.indicador === 'estado' && e.estado) return COLORES_ESTADO[e.estado];
  if (e.prioridad) return COLORES_PRIORIDAD[e.prioridad];
  return e.color_proyecto || 'var(--color-accent)';
}

/* ============================================================
   PERÍODO
   ============================================================ */
function tituloPeriodo() {
  const f = estado.fecha;
  if (estado.vista === 'mensual') return f.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  if (estado.vista === 'semanal') return 'Semana del ' + formatearFecha(inicioSemana(f).toISOString());
  return formatearFecha(f.toISOString());
}

function inicioSemana(d) {
  const date = new Date(d);
  const dia = (date.getDay() + 6) % 7; // lunes = 0
  date.setDate(date.getDate() - dia);
  date.setHours(0, 0, 0, 0);
  return date;
}

/* ============================================================
   CARGA DE EVENTOS
   ============================================================ */
function fechaLocalStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function cargarEventos(desde, hasta) {
  return obtenerEventosCalendario({
    empresa_ids: estado.empresaIds,
    agente_id: AGENTE_ID,
    agente_ids: estado.agenteIds,
    desde: fechaLocalStr(desde),
    hasta: fechaLocalStr(hasta),
    proyecto_ids: estado.proyectoIds
  });
}

/* ============================================================
   RENDER: CHIP
   ============================================================ */
function renderChip(e) {
  const titulo = e.titulo || '(Sin título)';
  const prefix = e.tipo === 'recordatorio' ? '🔁 ' : '';
  const draggable = e.tipo === 'tarea';
  const horaLabel = e.hora ? `<span style="font-size:10px; opacity:.7; margin-right:3px;">${e.hora}</span>` : '';
  return `<div class="evento-chip ${e.vencida ? 'vencida' : ''}"
    style="border-left-color:${colorEvento(e)};"
    data-evento='${JSON.stringify(e).replace(/'/g, "&#39;")}'
    draggable="${draggable}"
    title="${escapeHTML(titulo)}${e.hora ? ' · ' + e.hora : ''}"
  >${horaLabel}${prefix}${escapeHTML(titulo)}</div>`;
}

/* ============================================================
   RENDER: MENSUAL
   ============================================================ */
async function renderMensual() {
  const cont = $('#calendario-contenedor');
  const f = estado.fecha;
  const primerDiaMes = new Date(f.getFullYear(), f.getMonth(), 1);
  const inicio = inicioSemana(primerDiaMes);
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d;
  });
  const desde = dias[0];
  const hasta = new Date(dias[41]); hasta.setHours(23, 59, 59);

  const eventos = await cargarEventos(desde, hasta);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  // Cuántas chips caben en 110px de celda: ~num = (110 - 20px num - 2px gap) / 18px por chip ≈ 4
  const MAX_CHIPS = 4;

  cont.innerHTML = `<div class="calendar-grid">
    ${DOW.map((d) => `<div class="dow">${d}</div>`).join('')}
    ${dias.map((d) => {
      const claveDia = d.toISOString().slice(0, 10);
      const eventosDia = eventos.filter((e) => e.fecha?.slice(0, 10) === claveDia);
      const esOtroMes = d.getMonth() !== f.getMonth();
      const esHoy = d.getTime() === hoy.getTime();
      const extras = eventosDia.length - MAX_CHIPS;
      return `<div class="calendar-day ${esOtroMes ? 'otro-mes' : ''} ${esHoy ? 'hoy' : ''}" data-fecha="${claveDia}">
        <div class="calendar-day__num">${d.getDate()}</div>
        ${eventosDia.slice(0, MAX_CHIPS).map(renderChip).join('')}
        ${extras > 0 ? `<div style="font-size:10px; color:var(--text-tertiary); flex-shrink:0;">+${extras} más</div>` : ''}
      </div>`;
    }).join('')}
  </div>`;

  habilitarDragDrop();
  habilitarClicksEventos();
}

/* ============================================================
   RENDER: SEMANAL
   ============================================================ */
async function renderSemanal() {
  const cont = $('#calendario-contenedor');
  const inicio = inicioSemana(estado.fecha);
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d;
  });
  const hasta = new Date(dias[6]); hasta.setHours(23, 59, 59);
  const eventos = await cargarEventos(dias[0], hasta);

  const hoy = new Date(); hoy.setHours(0,0,0,0);
  cont.innerHTML = `<div class="semana-grid">${dias.map((d) => {
    const clave = d.toISOString().slice(0, 10);
    const esHoy = d.getTime() === hoy.getTime();
    const eventosDia = eventos
      .filter((e) => e.fecha?.slice(0, 10) === clave)
      .sort((a, b) => (a.hora || '99:99').localeCompare(b.hora || '99:99'));
    return `<div class="dia-columna ${esHoy ? 'hoy' : ''}" data-fecha="${clave}">
      <div style="font-weight:700; font-size:var(--fs-sm); margin-bottom:var(--space-2); text-align:center; ${esHoy ? 'color:var(--color-accent);' : ''}">
        ${DOW[(d.getDay() + 6) % 7]} ${d.getDate()}
      </div>
      ${eventosDia.map((e) => {
        const prefix = e.tipo === 'recordatorio' ? '🔁 ' : '';
        const horaStr = e.hora ? `<span style="font-size:10px; opacity:.7; display:block;">${e.hora}</span>` : '';
        return `<div class="evento-chip ${e.vencida ? 'vencida' : ''}"
          style="display:block; margin-bottom:4px; border-left-color:${colorEvento(e)};"
          draggable="${e.tipo === 'tarea' ? 'true' : 'false'}"
          data-evento='${JSON.stringify(e).replace(/'/g, "&#39;")}'
          title="${escapeHTML(e.titulo || '')}${e.hora ? ' · ' + e.hora : ''}"
        >${horaStr}${prefix}${escapeHTML(e.titulo || '')}</div>`;
      }).join('') || '<p style="font-size:11px; color:var(--text-tertiary); text-align:center;">Sin eventos</p>'}
    </div>`;
  }).join('')}</div>`;

  habilitarDragDrop();
  habilitarClicksEventos();
}

/* ============================================================
   RENDER: DIARIA
   ============================================================ */
async function renderDiaria() {
  const cont = $('#calendario-contenedor');
  const d = estado.fecha;
  const desde = new Date(d); desde.setHours(0, 0, 0, 0);
  const hasta = new Date(d); hasta.setHours(23, 59, 59);
  const eventos = await cargarEventos(desde, hasta);

  // Separar eventos con hora y sin hora
  const sinHora = eventos.filter((e) => !e.hora);
  const conHora = eventos.filter((e) => !!e.hora);

  const renderChipDiaria = (e) => {
    const prefix = e.tipo === 'recordatorio' ? '🔁 ' : '';
    return `<div class="evento-chip ${e.vencida ? 'vencida' : ''}"
      style="display:block; border-left-color:${colorEvento(e)};"
      data-evento='${JSON.stringify(e).replace(/'/g, "&#39;")}'
      title="${escapeHTML(e.titulo || '')}${e.hora ? ' · ' + e.hora : ''}"
    >${prefix}${escapeHTML(e.titulo || '')}</div>`;
  };

  cont.innerHTML = `<div class="card">
    ${sinHora.length ? `
      <div class="hora-fila" style="background:var(--bg-surface-raised); border-radius:var(--radius-sm); margin-bottom:var(--space-2);">
        <div class="hora-label" style="color:var(--text-tertiary); font-size:10px;">Todo el día</div>
        <div style="display:flex; flex-direction:column; gap:4px; padding:var(--space-2) 0;">
          ${sinHora.map(renderChipDiaria).join('')}
        </div>
      </div>` : ''}
    ${Array.from({ length: 24 }, (_, h) => {
      const eventosHora = conHora.filter((e) => Number(e.hora.split(':')[0]) === h);
      const tieneEventos = eventosHora.length > 0;
      return `<div class="hora-fila" style="${tieneEventos ? 'background:var(--bg-surface-raised);' : ''}">
        <div class="hora-label">${String(h).padStart(2, '0')}:00</div>
        <div style="display:flex; flex-direction:column; gap:4px; padding:var(--space-1) 0;">
          ${eventosHora.map(renderChipDiaria).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;

  habilitarClicksEventos();
}

/* ============================================================
   INTERACCIONES
   ============================================================ */
function habilitarClicksEventos() {
  $$('[data-evento]').forEach((el) =>
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      abrirDetalle(JSON.parse(el.dataset.evento.replace(/&#39;/g, "'")));
    }));
}

function habilitarDragDrop() {
  $$('[data-evento][draggable="true"]').forEach((chip) => {
    chip.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      chip.classList.add('dragging');
      e.dataTransfer.setData('text/plain', chip.dataset.evento);
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
  });

  $$('[data-fecha]').forEach((celda) => {
    celda.addEventListener('dragover', (e) => { e.preventDefault(); celda.classList.add('drag-over'); });
    celda.addEventListener('dragleave', () => celda.classList.remove('drag-over'));
    celda.addEventListener('drop', async (e) => {
      e.preventDefault();
      celda.classList.remove('drag-over');
      try {
        const evento = JSON.parse(e.dataTransfer.getData('text/plain').replace(/&#39;/g, "'"));
        if (evento.tipo !== 'tarea') return;
        const fechaOriginal = new Date(evento.fecha);
        const nuevaFecha = new Date(celda.dataset.fecha + 'T' + fechaOriginal.toISOString().slice(11, 19));
        await moverTarea(evento.id, nuevaFecha.toISOString());
        toastExito(`Tarea reprogramada a ${formatearFecha(nuevaFecha.toISOString())}.`);
        renderVistaActual();
      } catch (err) { toastError(err.message || 'No se pudo mover la tarea.'); }
    });
  });
}

/* ============================================================
   PANEL DE DETALLE
   ============================================================ */
function avataresAsignados(asignados = []) {
  return `<div class="avatar-group">${asignados.slice(0, 3).map((a) =>
    `<div class="avatar" title="${escapeHTML(a.agente?.nombre || '')}">${iniciales(a.agente?.nombre || '?')}</div>`
  ).join('')}</div>`;
}

async function abrirDetalle(evento) {
  $('#cal-panel-titulo').textContent = evento.titulo || 'Detalle';

  if (evento.tipo === 'tarea') {
    const [tarea, comentarios, historialRes] = await Promise.all([
      obtenerTarea(evento.id),
      listarComentarios(evento.id),
      listarHistorialTarea(evento.id, 0, 10)
    ]);
    const historial = historialRes.data ?? [];

    $('#cal-editar-link').href = `tarea-detalle.html?id=${evento.id}`;

    // Botón Eliminar
    const btnElim = $('#cal-eliminar-btn');
    btnElim.style.display = '';
    btnElim.dataset.id = evento.id;

    // Agentes disponibles para agregar (excluye ya asignados)
    const yaAsignadosIds = new Set((tarea.asignados || []).map((a) => a.agente?.id));
    const agentesDisponibles = AGENTES_CAL.filter((a) => !yaAsignadosIds.has(a.id));

    $('#cal-panel-body').innerHTML = `
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-control" id="cal-select-estado">
          ${['nuevo','en_progreso','en_revision','completado','archivado'].map((s) =>
            `<option value="${s}" ${s === tarea.estado ? 'selected' : ''}>${ETIQUETAS_ESTADO[s]}</option>`
          ).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Fecha de cierre</label>
        <input type="date" class="form-control" id="cal-fecha-cierre"
          value="${tarea.fecha_cierre?.slice(0,10) || ''}"
          style="max-width:180px;" />
      </div>

      <p>
        <span class="badge badge-prioridad-${tarea.prioridad}">${ETIQUETAS_PRIORIDAD[tarea.prioridad]}</span>
        ${tarea.es_cronologica ? '<span class="badge badge-estado-en_progreso" style="margin-left:4px;">🔁 Cronológica</span>' : ''}
        ${tarea.hora_recordatorio ? `<span style="font-size:var(--fs-xs); color:var(--text-tertiary); margin-left:var(--space-2);">⏰ ${tarea.hora_recordatorio.slice(0,5)}</span>` : ''}
      </p>
      <p style="font-size:var(--fs-sm); color:var(--text-secondary); margin:var(--space-3) 0;">${escapeHTML(tarea.descripcion || 'Sin descripción.')}</p>

      <div style="margin:var(--space-3) 0;">
        <strong style="font-size:var(--fs-sm); display:block; margin-bottom:var(--space-2);">Asignados</strong>
        <div id="cal-asignados-list">
          ${(tarea.asignados || []).map((a) => `
            <div style="display:flex; align-items:center; gap:var(--space-2); margin-bottom:var(--space-2);">
              <div class="avatar" style="width:28px; height:28px; font-size:10px;">${iniciales(a.agente?.nombre || '?')}</div>
              <span style="font-size:var(--fs-sm); flex:1;">${escapeHTML(a.agente?.nombre || '')}</span>
              <button class="btn btn-icon" style="font-size:11px; color:var(--color-danger, #f87171);"
                data-remove-asignado="${a.id}" title="Quitar agente">✕</button>
            </div>`).join('') || '<p style="font-size:var(--fs-sm); color:var(--text-tertiary);">Sin asignados.</p>'}
        </div>
        ${agentesDisponibles.length ? `
        <div style="display:flex; gap:var(--space-2); margin-top:var(--space-2);">
          <select class="form-control" id="cal-agregar-agente" style="font-size:var(--fs-sm);">
            <option value="">Agregar agente…</option>
            ${agentesDisponibles.map((a) => `<option value="${a.id}">${escapeHTML(a.nombre)}</option>`).join('')}
          </select>
          <button class="btn btn-secondary btn-sm" id="cal-btn-add-agente" style="white-space:nowrap;">+ Agregar</button>
        </div>` : ''}
      </div>

      <div style="margin:var(--space-3) 0; display:flex; flex-wrap:wrap; gap:var(--space-1);">
        ${(tarea.etiquetas || []).map((e) => `<span class="badge badge-estado-archivado">${escapeHTML(e)}</span>`).join('')}
      </div>

      <h4 style="margin-top:var(--space-5);">Comentarios</h4>
      <div id="cal-comentarios" style="max-height:180px; overflow-y:auto; margin:var(--space-3) 0;">
        ${comentarios.length ? comentarios.map((c) => `
          <div style="display:flex; gap:var(--space-2); margin-bottom:var(--space-3);">
            <div class="avatar">${iniciales(c.agente?.nombre || '?')}</div>
            <div>
              <div style="font-size:var(--fs-xs); font-weight:600;">${escapeHTML(c.agente?.nombre || '')}</div>
              <div style="font-size:var(--fs-sm);">${escapeHTML(c.texto)}</div>
            </div>
          </div>`).join('')
          : '<p style="color:var(--text-tertiary); font-size:var(--fs-sm);">Sin comentarios.</p>'}
      </div>
      <form id="cal-form-comentario" style="display:flex; gap:var(--space-2);">
        <input class="form-control" id="cal-input-comentario" placeholder="Agregar comentario…" />
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

    $('#cal-select-estado').addEventListener('change', async (e) => {
      await cambiarEstadoTarea(evento.id, e.target.value, AGENTE_ID);
      toastExito('Estado actualizado.');
      renderVistaActual();
    });

    // Editar fecha de cierre
    $('#cal-fecha-cierre').addEventListener('change', async (e) => {
      const nuevaFecha = e.target.value;
      if (!nuevaFecha) return;
      await moverTarea(evento.id, nuevaFecha);
      toastExito('Fecha de cierre actualizada.');
      renderVistaActual();
    });

    // Quitar agente asignado
    $$('[data-remove-asignado]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await desasignarAgenteDeTarea(btn.dataset.removeAsignado);
          toastExito('Agente removido.');
          // Refrescar panel con datos actualizados
          const tareaActualizada = await obtenerTarea(evento.id);
          evento._tarea = tareaActualizada;
          abrirDetalle(evento);
          renderVistaActual();
        } catch (err) { toastError(err.message); }
      })
    );

    // Agregar agente
    $('#cal-btn-add-agente')?.addEventListener('click', async () => {
      const sel = $('#cal-agregar-agente');
      const agenteId = sel?.value;
      if (!agenteId) return;
      try {
        await asignarAgentesATarea(evento.id, [agenteId]);
        toastExito('Agente asignado.');
        const tareaActualizada = await obtenerTarea(evento.id);
        evento._tarea = tareaActualizada;
        abrirDetalle(evento);
        renderVistaActual();
      } catch (err) { toastError(err.message); }
    });

    $('#cal-form-comentario').addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = $('#cal-input-comentario').value.trim();
      if (!texto) return;
      await crearComentario({ tarea_id: evento.id, agente_id: AGENTE_ID, texto });
      abrirDetalle(evento);
    });

  } else {
    // Instancia de recordatorio / tarea cronológica
    const tareaId = evento.tarea_id;
    $('#cal-editar-link').href = tareaId ? `tarea-detalle.html?id=${tareaId}` : 'recordatorios.html';
    $('#cal-editar-link').textContent = tareaId ? 'Ver tarea' : 'Ver recordatorios';
    $('#cal-eliminar-btn').style.display = 'none';
    const yaCompletado = evento.estado_instancia === 'completado';
    $('#cal-panel-body').innerHTML = `
      ${evento.descripcion ? `<p style="font-size:var(--fs-sm); color:var(--text-secondary); margin-bottom:var(--space-3);">${escapeHTML(evento.descripcion)}</p>` : ''}
      <p style="font-size:var(--fs-xs); color:var(--text-tertiary); margin-bottom:var(--space-3);">
        🔁 Cronológica &nbsp;·&nbsp; 📅 ${formatearFecha(evento.fecha)}${evento.hora ? ' &nbsp;·&nbsp; ⏰ ' + formatearHora(evento.hora) : ''}
      </p>
      <span class="badge badge-estado-${yaCompletado ? 'completado' : 'nuevo'}" style="margin-bottom:var(--space-4); display:inline-block;">
        ${yaCompletado ? 'Completado' : 'Pendiente'}
      </span>
      <button class="btn btn-primary btn-sm btn-block" id="cal-completar-instancia"
        style="margin-top:var(--space-3);" ${yaCompletado ? 'disabled' : ''}>
        ${yaCompletado ? 'Ya completado' : 'Marcar como completado'}
      </button>
    `;
    $('#cal-completar-instancia')?.addEventListener('click', async () => {
      await completarInstancia(evento.id);
      toastExito('Instancia completada.');
      renderVistaActual();
      cerrarPanel();
    });
  }

  $('#cal-panel').classList.add('open');
  $('#cal-panel-overlay').classList.add('open');
}

function cerrarPanel() {
  $('#cal-panel').classList.remove('open');
  $('#cal-panel-overlay').classList.remove('open');
}

/* ============================================================
   RENDER ACTUAL
   ============================================================ */
async function renderVistaActual() {
  $('#titulo-periodo').textContent = tituloPeriodo();
  if (estado.vista === 'mensual') await renderMensual();
  else if (estado.vista === 'semanal') await renderSemanal();
  else await renderDiaria();
}

function navegar(dir) {
  const f = new Date(estado.fecha);
  if (estado.vista === 'mensual') f.setMonth(f.getMonth() + dir);
  else if (estado.vista === 'semanal') f.setDate(f.getDate() + dir * 7);
  else f.setDate(f.getDate() + dir);
  estado.fecha = f;
  renderVistaActual();
}

/* ============================================================
   BIND
   ============================================================ */
async function cargarProyectosMs(empresaIds) {
  try {
    const todos = await listarTodosLosProyectos();
    const filtrados = empresaIds.length
      ? todos.filter((p) => empresaIds.includes(p.empresa_id))
      : todos;
    msProyectos?.setOptions(filtrados.map((p) => ({ value: p.id, label: p.nombre })));
  } catch (_) { /* sin proyectos */ }
}

async function cargarAgentesMs(empresaIds) {
  try {
    const emps = empresaIds.length ? EMPRESAS.filter((e) => empresaIds.includes(e.id)) : EMPRESAS;
    const listas = await Promise.all(emps.map((e) => listarAgentesDeEmpresa(e.id).catch(() => [])));
    const mapaAgentes = new Map();
    listas.flat().forEach((row) => {
      if (row.agente?.id) mapaAgentes.set(row.agente.id, row.agente.nombre);
    });
    AGENTES_CAL = [...mapaAgentes.entries()].map(([id, nombre]) => ({ id, nombre }));
    msAgentes?.setOptions(AGENTES_CAL.map((a) => ({ value: a.id, label: a.nombre })));
  } catch (_) { /* sin agentes */ }
}

async function bind() {
  // Navegación
  $('#btn-prev').addEventListener('click', () => navegar(-1));
  $('#btn-next').addEventListener('click', () => navegar(1));
  $('#btn-hoy').addEventListener('click', () => { estado.fecha = new Date(); renderVistaActual(); });

  // Panel
  $('#cal-cerrar-panel').addEventListener('click', cerrarPanel);
  $('#cal-panel-overlay').addEventListener('click', cerrarPanel);

  // Eliminar tarea desde el panel
  $('#cal-eliminar-btn').addEventListener('click', async () => {
    const { eliminarTarea } = await import('./supabase-data.js');
    const { confirmar } = await import('./main.js');
    const id = $('#cal-eliminar-btn').dataset.id;
    if (!id) return;
    const ok = await confirmar({ titulo: 'Eliminar tarea', mensaje: 'Esta acción no se puede deshacer.', peligro: true, textoConfirmar: 'Eliminar' });
    if (!ok) return;
    try { await eliminarTarea(id); toastExito('Tarea eliminada.'); cerrarPanel(); renderVistaActual(); }
    catch (err) { toastError(err.message); }
  });

  // Color indicador
  $('#select-indicador').value = estado.indicador;
  $('#select-indicador').addEventListener('change', (e) => {
    estado.indicador = e.target.value;
    cacheLocal.set(CONFIG.STORAGE_KEYS.INDICADOR_CALENDARIO, estado.indicador, 365 * 24 * 60 * 60 * 1000);
    renderVistaActual();
  });

  // Tabs de vista
  $$('.tab[data-vista]').forEach((tab) =>
    tab.addEventListener('click', () => {
      estado.vista = tab.dataset.vista;
      $$('.tab[data-vista]').forEach((t) => t.classList.toggle('active', t === tab));
      renderVistaActual();
    }));
  document.querySelector('.tab[data-vista="mensual"]')?.classList.add('active');

  // Nueva tarea
  $('#btn-nueva-tarea-cal').addEventListener('click', () => {
    const fecha = estado.fecha.toISOString().slice(0, 10);
    window.location.href = `tareas.html?nueva=1&fecha=${fecha}`;
  });

  // ── MultiSelect de empresas ───────────────────────────────
  msEmpresas = crearMultiSelect({
    placeholder: 'Empresas',
    options: EMPRESAS.map((e) => ({ value: e.id, label: e.nombre })),
    onChange(ids) {
      estado.empresaIds = ids;
      cargarProyectosMs(ids);
      cargarAgentesMs(ids);
      renderVistaActual();
    }
  });
  $('#slot-filtro-empresas-cal').appendChild(msEmpresas.el);

  // ── MultiSelect de proyectos ──────────────────────────────
  msProyectos = crearMultiSelect({
    placeholder: 'Proyectos',
    options: [],
    onChange(ids) {
      estado.proyectoIds = ids;
      renderVistaActual();
    }
  });
  $('#slot-filtro-proyectos').appendChild(msProyectos.el);

  // ── MultiSelect de agentes ────────────────────────────────
  msAgentes = crearMultiSelect({
    placeholder: 'Agentes',
    options: [],
    onChange(ids) {
      if (ids.length === 0) {
        toastError('Debes tener al menos 1 agente seleccionado.');
        // Restaurar selección anterior sin disparar onChange
        msAgentes.setSelected(estado.agenteIds);
        return;
      }
      estado.agenteIds = ids;
      renderVistaActual();
    }
  });
  $('#slot-filtro-agentes-cal').appendChild(msAgentes.el);

  // Cargar proyectos y agentes iniciales; pre-seleccionar el agente actual
  await cargarProyectosMs([]);
  await cargarAgentesMs([]);
  estado.agenteIds = [AGENTE_ID];
  msAgentes.setSelected([AGENTE_ID]);
}

/* ============================================================
   INIT
   ============================================================ */
/* ============================================================
   INIT
   ============================================================ */
async function init() {
  renderLayout('calendario');
  const ctx = await inicializarApp();
  if (!ctx) return;
  AGENTE = ctx.agente;
  AGENTE_ID = ctx.agente.id;
  EMPRESA_ID = ctx.empresaId;

  const main = document.getElementById('main-content');
  main.innerHTML = plantilla();

  EMPRESAS = await obtenerEmpresasDelAgente(AGENTE_ID);

  await bind();
  await renderVistaActual();
}

init();
