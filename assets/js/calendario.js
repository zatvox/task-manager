import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError } from './main.js';
import {
  obtenerEventosCalendario, moverTarea, obtenerTarea, completarInstancia,
  listarComentarios, crearComentario, cambiarEstadoTarea, listarProyectos,
  listarHistorialTarea
} from './supabase-data.js';
import {
  $, $$, escapeHTML, formatearFecha, formatearHora, iniciales,
  ETIQUETAS_ESTADO, ETIQUETAS_PRIORIDAD, COLORES_PRIORIDAD, COLORES_ESTADO,
  cacheLocal, crearMultiSelect
} from './utils.js';
import { CONFIG } from './config.js';

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
let EMPRESA_ID, AGENTE_ID, AGENTE;

let estado = {
  vista: 'mensual',
  fecha: new Date(),
  indicador: cacheLocal.get(CONFIG.STORAGE_KEYS.INDICADOR_CALENDARIO) || 'prioridad',
  soloMias: false,
  proyectoIds: []   // [] = todos los proyectos
};

// Instancias de multiselect (para poder limpiarlas desde fuera si se necesita)
let msProyectos = null;

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
        <div id="slot-filtro-proyectos"></div>
        <label class="checkbox-row" style="white-space:nowrap;">
          <input type="checkbox" id="chk-solo-mias" /> Solo mis tareas
        </label>
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
async function cargarEventos(desde, hasta) {
  return obtenerEventosCalendario({
    empresa_id: EMPRESA_ID,
    agente_id: AGENTE_ID,
    desde: desde.toISOString(),
    hasta: hasta.toISOString(),
    soloMias: estado.soloMias,
    proyecto_ids: estado.proyectoIds   // ← filtro multiselect
  });
}

/* ============================================================
   RENDER: CHIP
   ============================================================ */
function renderChip(e) {
  const titulo = e.titulo || '(Sin título)';
  const prefix = e.tipo === 'recordatorio' ? '🔁 ' : '';
  return `<div class="evento-chip ${e.vencida ? 'vencida' : ''}"
    style="border-left-color:${colorEvento(e)};"
    data-evento='${JSON.stringify(e).replace(/'/g, "&#39;")}'
    draggable="${e.tipo === 'tarea' ? 'true' : 'false'}"
    title="${escapeHTML(titulo)}"
  >${prefix}${escapeHTML(titulo)}</div>`;
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

  cont.innerHTML = `<div class="semana-grid">${dias.map((d) => {
    const clave = d.toISOString().slice(0, 10);
    const eventosDia = eventos
      .filter((e) => e.fecha?.slice(0, 10) === clave)
      .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    return `<div class="dia-columna" data-fecha="${clave}">
      <div style="font-weight:700; font-size:var(--fs-sm); margin-bottom:var(--space-2); text-align:center;">
        ${DOW[(d.getDay() + 6) % 7]} ${d.getDate()}
      </div>
      ${eventosDia.map((e) => `
        <div class="evento-chip ${e.vencida ? 'vencida' : ''}"
          style="display:block; margin-bottom:4px; border-left-color:${colorEvento(e)};"
          draggable="${e.tipo === 'tarea' ? 'true' : 'false'}"
          data-evento='${JSON.stringify(e).replace(/'/g, "&#39;")}'
          title="${escapeHTML(e.titulo || '')}"
        >${e.hora ? formatearHora(e.hora) + ' · ' : ''}${escapeHTML(e.titulo || '')}</div>
      `).join('') || '<p style="font-size:11px; color:var(--text-tertiary); text-align:center;">Sin eventos</p>'}
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

  cont.innerHTML = `<div class="card">${Array.from({ length: 24 }, (_, h) => {
    const eventosHora = eventos.filter((e) => {
      const hora = e.hora ? Number(e.hora.split(':')[0]) : new Date(e.fecha).getHours();
      return hora === h;
    });
    return `<div class="hora-fila">
      <div class="hora-label">${String(h).padStart(2, '0')}:00</div>
      <div style="display:flex; flex-direction:column; gap:4px; padding:var(--space-2) 0;">
        ${eventosHora.map((e) => `
          <div class="evento-chip ${e.vencida ? 'vencida' : ''}"
            style="display:block; border-left-color:${colorEvento(e)};"
            data-evento='${JSON.stringify(e).replace(/'/g, "&#39;")}'
          >${escapeHTML(e.titulo || '')}${e.descripcion ? ' — ' + escapeHTML(e.descripcion) : ''}</div>
        `).join('')}
      </div>
    </div>`;
  }).join('')}</div>`;

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

    $('#cal-panel-body').innerHTML = `
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-control" id="cal-select-estado">
          ${['nuevo','en_progreso','en_revision','completado','archivado'].map((s) =>
            `<option value="${s}" ${s === tarea.estado ? 'selected' : ''}>${ETIQUETAS_ESTADO[s]}</option>`
          ).join('')}
        </select>
      </div>
      <p>
        <span class="badge badge-prioridad-${tarea.prioridad}">${ETIQUETAS_PRIORIDAD[tarea.prioridad]}</span>
        ${tarea.es_cronologica ? '<span class="badge badge-estado-en_progreso" style="margin-left:4px;">🔁 Cronológica</span>' : ''}
      </p>
      <p style="font-size:var(--fs-sm); color:var(--text-secondary); margin:var(--space-3) 0;">${escapeHTML(tarea.descripcion || 'Sin descripción.')}</p>
      <p style="font-size:var(--fs-xs); color:var(--text-tertiary);">
        Inicio: ${formatearFecha(tarea.fecha_inicio)} ${tarea.fecha_cierre ? '· Cierre: ' + formatearFecha(tarea.fecha_cierre) : ''}
      </p>
      <div style="margin:var(--space-3) 0;">
        <strong style="font-size:var(--fs-sm);">Asignados:</strong>
        ${avataresAsignados(tarea.asignados)}
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
    $('#cal-form-comentario').addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = $('#cal-input-comentario').value.trim();
      if (!texto) return;
      await crearComentario({ tarea_id: evento.id, agente_id: AGENTE_ID, texto });
      abrirDetalle(evento);
    });

  } else {
    // Recordatorio
    $('#cal-editar-link').href = 'recordatorios.html';
    $('#cal-eliminar-btn').style.display = 'none';
    $('#cal-panel-body').innerHTML = `
      <p style="font-size:var(--fs-sm); color:var(--text-secondary);">${escapeHTML(evento.descripcion || '')}</p>
      <p style="font-size:var(--fs-xs); color:var(--text-tertiary);">
        Programado: ${formatearFecha(evento.fecha)} ${evento.hora ? formatearHora(evento.hora) : ''}
      </p>
      <span class="badge badge-estado-${evento.estado_instancia === 'completado' ? 'completado' : 'nuevo'}">
        ${evento.estado_instancia}
      </span>
      <button class="btn btn-primary btn-sm btn-block" id="cal-completar-instancia"
        style="margin-top:var(--space-4);" ${evento.estado_instancia === 'completado' ? 'disabled' : ''}>
        Marcar como completado
      </button>
    `;
    $('#cal-completar-instancia')?.addEventListener('click', async () => {
      await completarInstancia(evento.id);
      toastExito('Recordatorio completado.');
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

  // Solo mis tareas
  $('#chk-solo-mias').addEventListener('change', (e) => {
    estado.soloMias = e.target.checked;
    renderVistaActual();
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

  // Cargar proyectos disponibles en la empresa
  try {
    const proyectos = await listarProyectos(EMPRESA_ID);
    msProyectos.setOptions(
      proyectos.map((p) => ({ value: p.id, label: p.nombre }))
    );
  } catch (_) { /* sin proyectos: no pasa nada */ }
}

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
  if (!EMPRESA_ID) {
    main.innerHTML = '<div class="empty-state"><h3>Crea o selecciona una empresa primero.</h3></div>';
    return;
  }

  main.innerHTML = plantilla();
  await bind();
  await renderVistaActual();
}

init();
