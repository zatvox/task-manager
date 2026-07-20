/**
 * calendario.js
 * Módulo principal del Calendario.
 * Maneja vistas mensual / semanal / diaria, carga de eventos
 * (tareas puntuales + instancias cronológicas), panel lateral de detalle
 * y acciones rápidas (estado, asignados, comentarios, historial).
 */

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

/* ============================================================
   CONSTANTES Y ESTADO
   ============================================================ */

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Variables de sesión — se rellenan en init() */
let EMPRESA_ID, AGENTE_ID, AGENTE;
let EMPRESAS = [];

/** Estado reactivo del calendario */
let estado = {
  vista: 'mensual',
  fecha: new Date(),
  indicador: cacheLocal.get(CONFIG.STORAGE_KEYS.INDICADOR_CALENDARIO) || 'prioridad',
  proyectoIds: [],  // [] = todos
  empresaIds: [],   // [] = todas las empresas del usuario
  agenteIds: []     // se inicializa con [AGENTE_ID] en bind()
};

/** Instancias de multiselect (empresas, proyectos, agentes) */
let msProyectos = null;
let msEmpresas  = null;
let msAgentes   = null;

/** Lista plana de agentes disponibles para asignación en el panel */
let AGENTES_CAL = [];

/* ============================================================
   HELPERS DE COLOR Y PERÍODO
   ============================================================ */

/**
 * Devuelve el color CSS que corresponde al evento según el indicador activo.
 * @param {object} e - Objeto de evento con prioridad, estado y color_proyecto
 * @returns {string} Valor CSS de color
 */
function colorEvento(e) {
  if (estado.indicador === 'estado' && e.estado) return COLORES_ESTADO[e.estado];
  if (e.prioridad) return COLORES_PRIORIDAD[e.prioridad];
  return e.color_proyecto || 'var(--color-accent)';
}

/**
 * Genera el texto del título de período según la vista activa.
 * @returns {string} Título legible (ej. "julio 2026" o "Semana del 14/07/2026")
 */
function tituloPeriodo() {
  const f = estado.fecha;
  if (estado.vista === 'mensual') return f.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  if (estado.vista === 'semanal') return 'Semana del ' + formatearFecha(inicioSemana(f).toISOString());
  return formatearFecha(f.toISOString());
}

/**
 * Calcula el lunes de la semana que contiene la fecha dada.
 * @param {Date} d
 * @returns {Date}
 */
function inicioSemana(d) {
  const date = new Date(d);
  const dia = (date.getDay() + 6) % 7; // lunes = 0
  date.setDate(date.getDate() - dia);
  date.setHours(0, 0, 0, 0);
  return date;
}

/* ============================================================
   CARGA DE DATOS
   ============================================================ */

/**
 * Convierte un objeto Date a string 'YYYY-MM-DD' en hora local.
 * Evita desfases de zona horaria que produce toISOString().
 * @param {Date} d
 * @returns {string}
 */
function fechaLocalStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Obtiene todos los eventos del período, aplicando los filtros del estado actual.
 * @param {Date} desde
 * @param {Date} hasta
 * @returns {Promise<object[]>}
 */
async function cargarEventos(desde, hasta) {
  return obtenerEventosCalendario({
    empresa_ids:  estado.empresaIds,
    agente_id:    AGENTE_ID,
    agente_ids:   estado.agenteIds,
    desde:        fechaLocalStr(desde),
    hasta:        fechaLocalStr(hasta),
    proyecto_ids: estado.proyectoIds
  });
}

/* ============================================================
   RENDER — CHIP DE EVENTO
   ============================================================ */

/**
 * Genera el HTML de un chip de evento para la grilla.
 * Los chips de tipo 'tarea' son arrastrables (drag & drop).
 * @param {object} e - Evento con tipo, titulo, hora, vencida, prioridad, etc.
 * @returns {string} HTML string
 */
function renderChip(e) {
  const titulo   = e.titulo || '(Sin título)';
  const prefix   = e.tipo === 'recordatorio' ? '🔁 ' : '';
  const draggable = e.tipo === 'tarea';
  const horaLabel = e.hora
    ? `<span class="cal-chip-time">${e.hora}</span>`
    : '';
  return `<div class="evento-chip ${e.vencida ? 'vencida' : ''}"
    style="border-left-color:${colorEvento(e)};"
    data-evento='${JSON.stringify(e).replace(/'/g, "&#39;")}'
    draggable="${draggable}"
    title="${escapeHTML(titulo)}${e.hora ? ' · ' + e.hora : ''}"
  >${horaLabel}${prefix}${escapeHTML(titulo)}</div>`;
}

/* ============================================================
   RENDER — VISTA MENSUAL
   ============================================================ */

/**
 * Renderiza la grilla mensual de 6 semanas (42 celdas).
 * Carga los eventos del período completo y los distribuye por día.
 */
async function renderMensual() {
  const cont = $('#calendario-contenedor');
  const f = estado.fecha;

  // Calcular los 42 días que caben en la grilla (comenzando el lunes de la 1ª semana del mes)
  const primerDiaMes = new Date(f.getFullYear(), f.getMonth(), 1);
  const inicio = inicioSemana(primerDiaMes);
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d;
  });

  const desde = dias[0];
  const hasta = new Date(dias[41]); hasta.setHours(23, 59, 59);

  const eventos = await cargarEventos(desde, hasta);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  const MAX_CHIPS = 4; // chips visibles por celda antes de mostrar "+N más"

  cont.innerHTML = `<div class="calendar-grid">
    ${DOW.map((d) => `<div class="dow">${d}</div>`).join('')}
    ${dias.map((d) => {
      const claveDia   = d.toISOString().slice(0, 10);
      const eventosDia = eventos.filter((e) => e.fecha?.slice(0, 10) === claveDia);
      const esOtroMes  = d.getMonth() !== f.getMonth();
      const esHoy      = d.getTime() === hoy.getTime();
      const extras     = eventosDia.length - MAX_CHIPS;
      return `<div class="calendar-day ${esOtroMes ? 'otro-mes' : ''} ${esHoy ? 'hoy' : ''}" data-fecha="${claveDia}">
        <div class="calendar-day__num">${d.getDate()}</div>
        ${eventosDia.slice(0, MAX_CHIPS).map(renderChip).join('')}
        ${extras > 0 ? `<div class="cal-chip-extra">+${extras} más</div>` : ''}
      </div>`;
    }).join('')}
  </div>`;

  habilitarDragDrop();
  habilitarClicksEventos();
}

/* ============================================================
   RENDER — VISTA SEMANAL
   ============================================================ */

/**
 * Renderiza 7 columnas (lun–dom) con los eventos de la semana.
 * Los eventos se ordenan por hora dentro de cada columna.
 */
async function renderSemanal() {
  const cont = $('#calendario-contenedor');
  const inicio = inicioSemana(estado.fecha);
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d;
  });
  const hasta = new Date(dias[6]); hasta.setHours(23, 59, 59);
  const eventos = await cargarEventos(dias[0], hasta);

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  cont.innerHTML = `<div class="semana-grid">${dias.map((d) => {
    const clave = d.toISOString().slice(0, 10);
    const esHoy = d.getTime() === hoy.getTime();
    const eventosDia = eventos
      .filter((e) => e.fecha?.slice(0, 10) === clave)
      .sort((a, b) => (a.hora || '99:99').localeCompare(b.hora || '99:99'));

    return `<div class="dia-columna" data-fecha="${clave}">
      <div class="cal-dia-header ${esHoy ? 'cal-dia-header--hoy' : ''}">
        ${DOW[(d.getDay() + 6) % 7]} ${d.getDate()}
      </div>
      ${eventosDia.map((e) => {
        const prefix  = e.tipo === 'recordatorio' ? '🔁 ' : '';
        const horaStr = e.hora ? `<span class="cal-chip-time--block">${e.hora}</span>` : '';
        return `<div class="evento-chip ${e.vencida ? 'vencida' : ''}"
          style="display:block; margin-bottom:4px; border-left-color:${colorEvento(e)};"
          draggable="${e.tipo === 'tarea' ? 'true' : 'false'}"
          data-evento='${JSON.stringify(e).replace(/'/g, "&#39;")}'
          title="${escapeHTML(e.titulo || '')}${e.hora ? ' · ' + e.hora : ''}"
        >${horaStr}${prefix}${escapeHTML(e.titulo || '')}</div>`;
      }).join('') || `<p class="cal-sin-eventos">Sin eventos</p>`}
    </div>`;
  }).join('')}</div>`;

  habilitarDragDrop();
  habilitarClicksEventos();
}

/* ============================================================
   RENDER — VISTA DIARIA
   ============================================================ */

/**
 * Renderiza una grilla de 24 horas para el día seleccionado.
 * Separa eventos con hora (ubicados en su franja) y sin hora (bloque "Todo el día").
 */
async function renderDiaria() {
  const cont = $('#calendario-contenedor');
  const d    = estado.fecha;
  const desde = new Date(d); desde.setHours(0, 0, 0, 0);
  const hasta = new Date(d); hasta.setHours(23, 59, 59);
  const eventos = await cargarEventos(desde, hasta);

  const sinHora = eventos.filter((e) => !e.hora);
  const conHora = eventos.filter((e) => !!e.hora);

  /** Chip simplificado para la vista diaria (sin draggable) */
  const chipDiaria = (e) => {
    const prefix = e.tipo === 'recordatorio' ? '🔁 ' : '';
    return `<div class="evento-chip ${e.vencida ? 'vencida' : ''}"
      style="display:block; border-left-color:${colorEvento(e)};"
      data-evento='${JSON.stringify(e).replace(/'/g, "&#39;")}'
      title="${escapeHTML(e.titulo || '')}${e.hora ? ' · ' + e.hora : ''}"
    >${prefix}${escapeHTML(e.titulo || '')}</div>`;
  };

  cont.innerHTML = `<div class="card">
    ${sinHora.length ? `
      <div class="hora-fila cal-todo-el-dia">
        <div class="hora-label">Todo el día</div>
        <div class="cal-chips-col--dia">${sinHora.map(chipDiaria).join('')}</div>
      </div>` : ''}
    ${Array.from({ length: 24 }, (_, h) => {
      const eventosHora = conHora.filter((e) => Number(e.hora.split(':')[0]) === h);
      return `<div class="hora-fila ${eventosHora.length ? 'cal-hora-fila-activa' : ''}">
        <div class="hora-label">${String(h).padStart(2, '0')}:00</div>
        <div class="cal-chips-col">${eventosHora.map(chipDiaria).join('')}</div>
      </div>`;
    }).join('')}
  </div>`;

  habilitarClicksEventos();
}

/* ============================================================
   INTERACCIONES — CLICKS Y DRAG & DROP
   ============================================================ */

/**
 * Añade listeners de click a todos los chips del DOM actual.
 * Parsea el dataset.evento y abre el panel de detalle.
 */
function habilitarClicksEventos() {
  $$('[data-evento]').forEach((el) =>
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      abrirDetalle(JSON.parse(el.dataset.evento.replace(/&#39;/g, "'")));
    }));
}

/**
 * Añade comportamiento de drag & drop a los chips arrastrables (tareas puntuales).
 * Al soltar en otra celda, llama a moverTarea() con la nueva fecha.
 */
function habilitarDragDrop() {
  // Draggable: solo chips de tipo 'tarea'
  $$('[data-evento][draggable="true"]').forEach((chip) => {
    chip.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      chip.classList.add('dragging');
      e.dataTransfer.setData('text/plain', chip.dataset.evento);
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
  });

  // Celdas drop target
  $$('[data-fecha]').forEach((celda) => {
    celda.addEventListener('dragover',  (e) => { e.preventDefault(); celda.classList.add('drag-over'); });
    celda.addEventListener('dragleave', ()  => celda.classList.remove('drag-over'));
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
   PANEL LATERAL — HELPERS DE RENDERIZADO
   ============================================================ */

/**
 * HTML del bloque "Asignados" reutilizable en ambos paneles.
 * @param {object[]} asignados - Array de { id, agente: { id, nombre } }
 * @param {object[]} agentesDisponibles - Agentes que aún no están asignados
 * @returns {string}
 */
function renderBloqueAsignados(asignados, agentesDisponibles) {
  return `
    <div style="margin:var(--space-3) 0;">
      <strong class="cal-section-title">Asignados</strong>
      <div id="cal-asignados-list">
        ${asignados.length
          ? asignados.map((a) => `
            <div class="cal-asignado-row">
              <div class="avatar cal-avatar-sm">${iniciales(a.agente?.nombre || '?')}</div>
              <span class="cal-asignado-nombre">${escapeHTML(a.agente?.nombre || '')}</span>
              <button class="btn btn-icon cal-quitar-btn"
                data-remove-asignado="${a.id}" title="Quitar agente">✕</button>
            </div>`)
            .join('')
          : '<p class="cal-empty-msg">Sin asignados.</p>'}
      </div>
      ${agentesDisponibles.length ? `
        <div class="cal-add-agente-row">
          <select class="form-control" id="cal-agregar-agente">
            <option value="">Agregar agente…</option>
            ${agentesDisponibles.map((a) => `<option value="${a.id}">${escapeHTML(a.nombre)}</option>`).join('')}
          </select>
          <button class="btn btn-secondary btn-sm" id="cal-btn-add-agente">+ Agregar</button>
        </div>` : ''}
    </div>`;
}

/**
 * HTML del bloque "Comentarios" + formulario para agregar uno.
 * @param {object[]} comentarios
 * @returns {string}
 */
function renderBloqueComentarios(comentarios) {
  return `
    <h4 style="margin-top:var(--space-5);">Comentarios</h4>
    <div class="cal-comentarios-list" id="cal-comentarios">
      ${comentarios.length
        ? comentarios.map((c) => `
          <div class="cal-comentario">
            <div class="avatar">${iniciales(c.agente?.nombre || '?')}</div>
            <div>
              <div class="cal-comentario-autor">${escapeHTML(c.agente?.nombre || '')}</div>
              <div class="cal-comentario-texto">${escapeHTML(c.texto)}</div>
            </div>
          </div>`)
          .join('')
        : '<p class="cal-empty-msg">Sin comentarios.</p>'}
    </div>
    <form class="cal-form-comentario" id="cal-form-comentario">
      <input class="form-control" id="cal-input-comentario" placeholder="Agregar comentario…" />
      <button class="btn btn-primary btn-sm" type="submit">Enviar</button>
    </form>`;
}

/**
 * HTML del bloque "Historial" de cambios de la tarea.
 * @param {object[]} historial
 * @returns {string}
 */
function renderBloqueHistorial(historial) {
  return `
    <h4 style="margin-top:var(--space-5);">Historial</h4>
    <div class="cal-historial-list">
      ${historial.length
        ? historial.map((h) => `
          <div class="cal-historial-item">
            ${escapeHTML(h.campo_modificado)}: ${escapeHTML(h.valor_antiguo || '—')} → ${escapeHTML(h.valor_nuevo || '—')}
          </div>`)
          .join('')
        : 'Sin cambios registrados.'}
    </div>`;
}

/**
 * Genera el HTML completo del cuerpo del panel para una TAREA PUNTUAL.
 * @param {object} tarea - Datos completos de la tarea
 * @param {object[]} comentarios
 * @param {object[]} historial
 * @param {object[]} agentesDisponibles
 * @returns {string}
 */
function renderPanelBodyTarea(tarea, comentarios, historial, agentesDisponibles) {
  return `
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
        value="${tarea.fecha_cierre?.slice(0, 10) || ''}"
        style="max-width:180px;" />
    </div>

    <p>
      <span class="badge badge-prioridad-${tarea.prioridad}">${ETIQUETAS_PRIORIDAD[tarea.prioridad]}</span>
      ${tarea.es_cronologica ? '<span class="badge badge-estado-en_progreso" style="margin-left:4px;">🔁 Cronológica</span>' : ''}
      ${tarea.hora_recordatorio
        ? `<span class="cal-panel-meta" style="margin-left:var(--space-2);">⏰ ${String(tarea.hora_recordatorio).slice(0, 5)}</span>`
        : ''}
    </p>

    <p class="cal-panel-desc">${escapeHTML(tarea.descripcion || 'Sin descripción.')}</p>

    ${renderBloqueAsignados(tarea.asignados || [], agentesDisponibles)}

    <div class="cal-etiquetas">
      ${(tarea.etiquetas || []).map((e) => `<span class="badge badge-estado-archivado">${escapeHTML(e)}</span>`).join('')}
    </div>

    ${renderBloqueComentarios(comentarios)}
    ${renderBloqueHistorial(historial)}
  `;
}

/**
 * Genera el HTML completo del cuerpo del panel para una TAREA CRONOLÓGICA (instancia).
 * @param {object} evento - Evento de tipo 'recordatorio' con fecha/hora de la instancia
 * @param {object} tarea - Datos completos de la tarea origen
 * @param {object[]} comentarios
 * @param {object[]} historial
 * @param {object[]} agentesDisponibles
 * @returns {string}
 */
function renderPanelBodyCronologica(evento, tarea, comentarios, historial, agentesDisponibles) {
  const yaCompletado = evento.estado_instancia === 'completado';
  return `
    <div class="form-group">
      <label class="form-label">Estado tarea</label>
      <select class="form-control" id="cal-select-estado">
        ${['nuevo','en_progreso','en_revision','completado','archivado'].map((s) =>
          `<option value="${s}" ${s === tarea.estado ? 'selected' : ''}>${ETIQUETAS_ESTADO[s]}</option>`
        ).join('')}
      </select>
    </div>

    <p style="margin-bottom:var(--space-2);">
      <span class="badge badge-estado-en_progreso">🔁 Cronológica</span>
      <span class="cal-panel-meta" style="margin-left:var(--space-2);">
        📅 ${formatearFecha(evento.fecha)}
        ${tarea.hora_recordatorio ? ' &nbsp;·&nbsp; ⏰ ' + String(tarea.hora_recordatorio).slice(0, 5) : ''}
      </span>
    </p>

    <p class="cal-panel-desc">${escapeHTML(tarea.descripcion || 'Sin descripción.')}</p>

    <button class="btn btn-primary btn-sm btn-block" id="cal-completar-instancia"
      style="margin-bottom:var(--space-4);" ${yaCompletado ? 'disabled' : ''}>
      ${yaCompletado ? '✓ Instancia completada' : 'Marcar instancia como completada'}
    </button>

    ${renderBloqueAsignados(tarea.asignados || [], agentesDisponibles)}
    ${renderBloqueComentarios(comentarios)}
    ${renderBloqueHistorial(historial)}
  `;
}

/* ============================================================
   PANEL LATERAL — BINDINGS DE EVENTOS
   ============================================================ */

/**
 * Registra todos los listeners del panel para una TAREA PUNTUAL.
 * @param {object} evento
 * @param {string} tareaId
 */
function bindPanelTarea(evento, tareaId) {
  // Cambio de estado
  $('#cal-select-estado')?.addEventListener('change', async (e) => {
    await cambiarEstadoTarea(tareaId, e.target.value, AGENTE_ID);
    toastExito('Estado actualizado.');
    renderVistaActual();
  });

  // Editar fecha de cierre
  $('#cal-fecha-cierre')?.addEventListener('change', async (e) => {
    const nuevaFecha = e.target.value;
    if (!nuevaFecha) return;
    await moverTarea(tareaId, nuevaFecha);
    toastExito('Fecha de cierre actualizada.');
    renderVistaActual();
  });

  // Quitar agente asignado
  $$('[data-remove-asignado]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        await desasignarAgenteDeTarea(btn.dataset.removeAsignado);
        toastExito('Agente removido.');
        abrirDetalle(evento);
        renderVistaActual();
      } catch (err) { toastError(err.message); }
    })
  );

  // Agregar agente
  $('#cal-btn-add-agente')?.addEventListener('click', async () => {
    const agenteId = $('#cal-agregar-agente')?.value;
    if (!agenteId) return;
    try {
      await asignarAgentesATarea(tareaId, [agenteId]);
      toastExito('Agente asignado.');
      abrirDetalle(evento);
      renderVistaActual();
    } catch (err) { toastError(err.message); }
  });

  // Enviar comentario
  $('#cal-form-comentario')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = $('#cal-input-comentario').value.trim();
    if (!texto) return;
    await crearComentario({ tarea_id: tareaId, agente_id: AGENTE_ID, texto });
    abrirDetalle(evento);
  });
}

/**
 * Registra todos los listeners del panel para una TAREA CRONOLÓGICA.
 * Igual que bindPanelTarea pero agrega el botón de completar instancia.
 * @param {object} evento
 * @param {string} tareaId
 */
function bindPanelCronologica(evento, tareaId) {
  // Completar la instancia de esta fecha
  $('#cal-completar-instancia')?.addEventListener('click', async () => {
    await completarInstancia(evento.id);
    toastExito('Instancia completada.');
    renderVistaActual();
    cerrarPanel();
  });

  // Reutiliza misma lógica de bindings que panel puntual
  bindPanelTarea(evento, tareaId);
}

/* ============================================================
   PANEL LATERAL — APERTURA Y CIERRE
   ============================================================ */

/**
 * Abre el panel lateral con el detalle del evento seleccionado.
 * Carga tarea, comentarios e historial en paralelo.
 * Rama 'tarea' → renderPanelBodyTarea
 * Rama 'recordatorio' con tarea_id → renderPanelBodyCronologica
 * Rama legacy (sin tarea_id) → fallback mínimo
 * @param {object} evento
 */
async function abrirDetalle(evento) {
  $('#cal-panel-titulo').textContent = evento.titulo || 'Detalle';

  if (evento.tipo === 'tarea') {
    /* ── Panel para tarea puntual ─────────────────────────── */
    const [tarea, comentarios, historialRes] = await Promise.all([
      obtenerTarea(evento.id),
      listarComentarios(evento.id),
      listarHistorialTarea(evento.id, 0, 10)
    ]);
    const historial = historialRes.data ?? [];

    $('#cal-editar-link').href = `tarea-detalle.html?id=${evento.id}`;
    $('#cal-editar-link').textContent = 'Editar tarea';
    const btnElim = $('#cal-eliminar-btn');
    btnElim.style.display = '';
    btnElim.dataset.id = evento.id;

    const yaAsignadosIds    = new Set((tarea.asignados || []).map((a) => a.agente?.id));
    const agentesDisponibles = AGENTES_CAL.filter((a) => !yaAsignadosIds.has(a.id));

    $('#cal-panel-body').innerHTML = renderPanelBodyTarea(tarea, comentarios, historial, agentesDisponibles);
    bindPanelTarea(evento, evento.id);

  } else {
    /* ── Panel para instancia cronológica ────────────────── */
    const tareaId = evento.tarea_id;

    $('#cal-editar-link').href = tareaId ? `tarea-detalle.html?id=${tareaId}` : 'recordatorios.html';
    $('#cal-editar-link').textContent = tareaId ? 'Editar tarea' : 'Ver recordatorios';
    $('#cal-eliminar-btn').style.display = 'none';

    if (!tareaId) {
      /* Fallback legacy: instancia sin tarea asociada */
      const yaCompletado = evento.estado_instancia === 'completado';
      $('#cal-panel-body').innerHTML = `
        <p class="cal-panel-meta">
          🔁 Cronológica &nbsp;·&nbsp; 📅 ${formatearFecha(evento.fecha)}
          ${evento.hora ? ' &nbsp;·&nbsp; ⏰ ' + formatearHora(evento.hora) : ''}
        </p>
        <button class="btn btn-primary btn-sm btn-block" id="cal-completar-instancia"
          style="margin-top:var(--space-3);" ${yaCompletado ? 'disabled' : ''}>
          ${yaCompletado ? 'Ya completado' : 'Marcar como completado'}
        </button>`;
      $('#cal-completar-instancia')?.addEventListener('click', async () => {
        await completarInstancia(evento.id);
        toastExito('Instancia completada.');
        renderVistaActual();
        cerrarPanel();
      });
      abrirPanelUI();
      return;
    }

    const [tarea, comentarios, historialRes] = await Promise.all([
      obtenerTarea(tareaId),
      listarComentarios(tareaId),
      listarHistorialTarea(tareaId, 0, 10)
    ]);
    const historial = historialRes.data ?? [];

    const yaAsignadosIds    = new Set((tarea.asignados || []).map((a) => a.agente?.id));
    const agentesDisponibles = AGENTES_CAL.filter((a) => !yaAsignadosIds.has(a.id));

    $('#cal-panel-body').innerHTML = renderPanelBodyCronologica(evento, tarea, comentarios, historial, agentesDisponibles);
    bindPanelCronologica(evento, tareaId);
  }

  abrirPanelUI();
}

/** Activa las clases CSS que muestran el panel y el overlay. */
function abrirPanelUI() {
  $('#cal-panel').classList.add('open');
  $('#cal-panel-overlay').classList.add('open');
}

/** Cierra el panel lateral y el overlay. */
function cerrarPanel() {
  $('#cal-panel').classList.remove('open');
  $('#cal-panel-overlay').classList.remove('open');
}

/* ============================================================
   RENDER GENERAL Y NAVEGACIÓN
   ============================================================ */

/**
 * Actualiza el título de período y despacha el render de la vista activa.
 */
async function renderVistaActual() {
  $('#titulo-periodo').textContent = tituloPeriodo();
  if (estado.vista === 'mensual')     await renderMensual();
  else if (estado.vista === 'semanal') await renderSemanal();
  else                                 await renderDiaria();
}

/**
 * Avanza o retrocede el período activo según la vista.
 * @param {1 | -1} dir - Dirección: 1 = siguiente, -1 = anterior
 */
function navegar(dir) {
  const f = new Date(estado.fecha);
  if (estado.vista === 'mensual')      f.setMonth(f.getMonth() + dir);
  else if (estado.vista === 'semanal') f.setDate(f.getDate() + dir * 7);
  else                                 f.setDate(f.getDate() + dir);
  estado.fecha = f;
  renderVistaActual();
}

/* ============================================================
   CARGA DE FILTROS (PROYECTOS Y AGENTES)
   ============================================================ */

/**
 * Recarga las opciones del multiselect de proyectos filtradas por empresa.
 * @param {string[]} empresaIds - Vacío = todas las empresas
 */
async function cargarProyectosMs(empresaIds) {
  try {
    const todos     = await listarTodosLosProyectos();
    const filtrados = empresaIds.length
      ? todos.filter((p) => empresaIds.includes(p.empresa_id))
      : todos;
    msProyectos?.setOptions(filtrados.map((p) => ({ value: p.id, label: p.nombre })));
  } catch (_) { /* sin proyectos */ }
}

/**
 * Recarga la lista de agentes disponibles para el filtro y para el panel de asignación.
 * Agrupa agentes únicos de todas las empresas seleccionadas.
 * @param {string[]} empresaIds - Vacío = todas las empresas del usuario
 */
async function cargarAgentesMs(empresaIds) {
  try {
    const emps  = empresaIds.length ? EMPRESAS.filter((e) => empresaIds.includes(e.id)) : EMPRESAS;
    const listas = await Promise.all(emps.map((e) => listarAgentesDeEmpresa(e.id).catch(() => [])));
    const mapa  = new Map();
    listas.flat().forEach((row) => {
      if (row.agente?.id) mapa.set(row.agente.id, row.agente.nombre);
    });
    AGENTES_CAL = [...mapa.entries()].map(([id, nombre]) => ({ id, nombre }));
    msAgentes?.setOptions(AGENTES_CAL.map((a) => ({ value: a.id, label: a.nombre })));
  } catch (_) { /* sin agentes */ }
}

/* ============================================================
   BIND — EVENTOS DE LA INTERFAZ
   ============================================================ */

/**
 * Registra todos los listeners de la toolbar, filtros y panel.
 * Debe llamarse después de inyectar la plantilla en el DOM.
 */
async function bind() {
  // Navegación de período
  $('#btn-prev').addEventListener('click', () => navegar(-1));
  $('#btn-next').addEventListener('click', () => navegar(1));
  $('#btn-hoy').addEventListener('click',  () => { estado.fecha = new Date(); renderVistaActual(); });

  // Panel lateral
  $('#cal-cerrar-panel').addEventListener('click', cerrarPanel);
  $('#cal-panel-overlay').addEventListener('click', cerrarPanel);

  // Eliminar tarea desde el panel (importación dinámica para no bloquear el bundle inicial)
  $('#cal-eliminar-btn').addEventListener('click', async () => {
    const { eliminarTarea } = await import('./supabase-data.js');
    const { confirmar }     = await import('./main.js');
    const id = $('#cal-eliminar-btn').dataset.id;
    if (!id) return;
    const ok = await confirmar({
      titulo: 'Eliminar tarea',
      mensaje: 'Esta acción no se puede deshacer.',
      peligro: true,
      textoConfirmar: 'Eliminar'
    });
    if (!ok) return;
    try {
      await eliminarTarea(id);
      toastExito('Tarea eliminada.');
      cerrarPanel();
      renderVistaActual();
    } catch (err) { toastError(err.message); }
  });

  // Indicador de color
  $('#select-indicador').value = estado.indicador;
  $('#select-indicador').addEventListener('change', (e) => {
    estado.indicador = e.target.value;
    cacheLocal.set(CONFIG.STORAGE_KEYS.INDICADOR_CALENDARIO, estado.indicador, 365 * 24 * 60 * 60 * 1000);
    renderVistaActual();
  });

  // Tabs de vista (mensual / semanal / diaria)
  $$('.tab[data-vista]').forEach((tab) =>
    tab.addEventListener('click', () => {
      estado.vista = tab.dataset.vista;
      $$('.tab[data-vista]').forEach((t) => t.classList.toggle('active', t === tab));
      renderVistaActual();
    }));
  document.querySelector('.tab[data-vista="mensual"]')?.classList.add('active');

  // Botón nueva tarea (redirige a tareas.html con la fecha seleccionada)
  $('#btn-nueva-tarea-cal').addEventListener('click', () => {
    const fecha = estado.fecha.toISOString().slice(0, 10);
    window.location.href = `tareas.html?nueva=1&fecha=${fecha}`;
  });

  // ── MultiSelect de empresas ──────────────────────────────
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

  // ── MultiSelect de proyectos ─────────────────────────────
  msProyectos = crearMultiSelect({
    placeholder: 'Proyectos',
    options: [],
    onChange(ids) {
      estado.proyectoIds = ids;
      renderVistaActual();
    }
  });
  $('#slot-filtro-proyectos').appendChild(msProyectos.el);

  // ── MultiSelect de agentes ───────────────────────────────
  msAgentes = crearMultiSelect({
    placeholder: 'Agentes',
    options: [],
    onChange(ids) {
      if (ids.length === 0) {
        // Requiere al menos 1 agente — restaurar selección previa
        if (estado.agenteIds.length > 0) {
          toastError('Debes tener al menos 1 agente seleccionado.');
          msAgentes.setSelected(estado.agenteIds);
        }
        return;
      }
      estado.agenteIds = ids;
      renderVistaActual();
    }
  });
  $('#slot-filtro-agentes-cal').appendChild(msAgentes.el);

  // Cargar opciones iniciales y pre-seleccionar el agente logueado
  await cargarProyectosMs([]);
  await cargarAgentesMs([]);
  estado.agenteIds = [AGENTE_ID];
  msAgentes.setSelected([AGENTE_ID]);
}

/* ============================================================
   INIT — PUNTO DE ENTRADA
   ============================================================ */

/**
 * Inicializa el módulo:
 * 1. Renderiza el layout principal (sidebar)
 * 2. Autentica y obtiene contexto de sesión
 * 3. Inyecta la plantilla HTML desde el <template> del HTML
 * 4. Carga filtros y renderiza la vista activa
 */
async function init() {
  renderLayout('calendario');
  const ctx = await inicializarApp();
  if (!ctx) return;

  AGENTE    = ctx.agente;
  AGENTE_ID = ctx.agente.id;
  EMPRESA_ID = ctx.empresaId;

  // Clonar la plantilla desde el HTML (separación HTML/JS)
  const main     = document.getElementById('main-content');
  const template = document.getElementById('cal-plantilla');
  main.innerHTML = template.content
    ? template.innerHTML // en Firefox .content es DocumentFragment
    : template.innerHTML;

  EMPRESAS = await obtenerEmpresasDelAgente(AGENTE_ID);

  await bind();
  await renderVistaActual();
}

init();
