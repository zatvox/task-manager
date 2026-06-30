import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import {
  listarRecordatorios, crearRecordatorio, actualizarRecordatorio,
  pausarRecordatorio, eliminarRecordatorio,
  obtenerEmpresasDelAgente, listarProyectos, listarAgentesDeEmpresa
} from './supabase-data.js';
import { $, $$, escapeHTML, formatearHora, crearMultiSelect, iniciales } from './utils.js';

let AGENTE, EMPRESA_ID;
let EMPRESAS = [];
let AGENTES_EMPRESA = [];
let EMPRESAS_AGENTES = {}; // cache { [empresaId]: [{agente:{id,nombre}}] }
let msEmpresas, msAgentes;
let formDirty = false;

const DIAS_SEMANA = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];

function etiquetaFrecuencia(r) {
  switch (r.frecuencia) {
    case 'diaria':    return 'Diaria';
    case 'semanal':   return `Semanal (${(r.dias_semana || []).join(', ')})`;
    case 'mensual':   return `Mensual (día ${r.dia_mes || 1})`;
    case 'quincenal': return `Quincenal (días ${r.dias_semana?.[0] || 15} y ${r.dias_semana?.[1] || 30})`;
    default:          return r.frecuencia;
  }
}

function plantilla() {
  return `
    <div class="page-header">
      <div><h1>Recordatorios</h1><p class="page-header__subtitle">Recordatorios cronológicos recurrentes por empresa y proyecto.</p></div>
      <button class="btn btn-primary" id="btn-nuevo">+ Nuevo recordatorio</button>
    </div>

    <div class="table-toolbar" style="flex-wrap:wrap; gap:var(--space-2);">
      <div id="slot-ms-empresas-rec"></div>
      <div id="slot-ms-agentes-rec"></div>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Título</th>
            <th>Empresa / Proyecto</th>
            <th>Frecuencia</th>
            <th>Hora</th>
            <th>Asignados</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody id="tabla-recordatorios">
          <tr><td colspan="6"><div class="loading-spinner"></div></td></tr>
        </tbody>
      </table>
    </div>

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

            <!-- Empresa -->
            <div class="form-group">
              <label class="form-label">Empresa</label>
              <select class="form-control" id="r-empresa"></select>
            </div>

            <!-- Proyecto (opcional) -->
            <div class="form-group">
              <label class="form-label">Proyecto (opcional)</label>
              <select class="form-control" id="r-proyecto">
                <option value="">Sin proyecto</option>
              </select>
            </div>

            <!-- Asignar agentes -->
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

            <!-- Frecuencia -->
            <div class="form-group">
              <label class="form-label">Frecuencia</label>
              <select class="form-control" id="r-frecuencia">
                <option value="diaria">Diaria</option>
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
                <option value="quincenal">Quincenal</option>
              </select>
            </div>

            <!-- Semanal: días de la semana -->
            <div class="form-group" id="grupo-dias" style="display:none;">
              <label class="form-label">Días de la semana</label>
              <div style="display:flex; gap:var(--space-2); flex-wrap:wrap;">
                ${DIAS_SEMANA.map((d) => `
                  <label class="checkbox-row" style="background:var(--bg-surface-raised); padding:var(--space-2) var(--space-3); border-radius:var(--radius-sm);">
                    <input type="checkbox" class="dia-semana" value="${d}" /> ${d}
                  </label>`).join('')}
              </div>
            </div>

            <!-- Mensual: día del mes -->
            <div class="form-group" id="grupo-dia-mes" style="display:none;">
              <label class="form-label">Día del mes (1–31)</label>
              <input class="form-control" type="number" min="1" max="31" id="r-dia-mes" value="1" />
            </div>

            <!-- Quincenal: 2 fechas editables -->
            <div class="form-group" id="grupo-quincenal" style="display:none;">
              <label class="form-label">Días del mes para el recordatorio quincenal</label>
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
            <button type="submit" class="btn btn-primary" id="btn-guardar-rec">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/* ── Llena selectores empresa y proyectos en modal ── */
function llenarSelectorEmpresa(selectedId) {
  $('#r-empresa').innerHTML = EMPRESAS.map((e) =>
    `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escapeHTML(e.nombre)}</option>`
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
        ${seleccionados.includes(a.agente.id) ? 'checked' : ''} />
      ${escapeHTML(a.agente.nombre)}
    </label>`).join('');
}

function toggleFrecuencia() {
  const f = $('#r-frecuencia').value;
  $('#grupo-dias').style.display     = f === 'semanal'   ? 'block' : 'none';
  $('#grupo-dia-mes').style.display  = f === 'mensual'   ? 'block' : 'none';
  $('#grupo-quincenal').style.display = f === 'quincenal' ? 'block' : 'none';
}

/* ── Carga tabla ── */
async function cargar() {
  const filtros = {
    empresa_ids: msEmpresas?.getSelected() ?? [],
    agente_ids:  msAgentes?.getSelected()  ?? []
  };
  const lista = await listarRecordatorios(AGENTE.id, filtros);
  const tbody = $('#tabla-recordatorios');

  tbody.innerHTML = lista.length
    ? lista.map((r) => `
      <tr>
        <td>${escapeHTML(r.titulo)}</td>
        <td>
          ${r.empresa?.nombre ? `<div style="font-size:var(--fs-xs); color:var(--text-tertiary);">${escapeHTML(r.empresa.nombre)}</div>` : ''}
          ${r.proyecto?.nombre
            ? `<div><span style="color:${r.proyecto.color_etiqueta}">●</span> ${escapeHTML(r.proyecto.nombre)}</div>`
            : '<div style="color:var(--text-tertiary);">—</div>'}
        </td>
        <td>${escapeHTML(etiquetaFrecuencia(r))}</td>
        <td>${r.hora_recordatorio ? formatearHora(r.hora_recordatorio) : '—'}</td>
        <td>
          <div class="avatar-group">
            ${(r.asignados || []).slice(0, 4).map((a) =>
              `<div class="avatar" title="${escapeHTML(a.agente?.nombre || '')}">${iniciales(a.agente?.nombre || '?')}</div>`
            ).join('')}
          </div>
        </td>
        <td><span class="badge badge-estado-${r.estado === 'activo' ? 'completado' : 'archivado'}">${escapeHTML(r.estado)}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-icon" data-editar='${JSON.stringify(r).replace(/'/g, "&#39;")}' title="Editar">✏️</button>
          <button class="btn btn-icon" data-toggle="${r.id}" data-estado-actual="${r.estado}" title="Pausar/activar">${r.estado === 'activo' ? '⏸️' : '▶️'}</button>
          <button class="btn btn-icon" data-eliminar="${r.id}" title="Eliminar" style="color:var(--color-danger)">🗑️</button>
        </td>
      </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center; color:var(--text-tertiary); padding:var(--space-6);">Sin recordatorios. Crea uno para empezar.</td></tr>`;

  $$('[data-editar]').forEach((b) =>
    b.addEventListener('click', () => abrirEdicion(JSON.parse(b.dataset.editar.replace(/&#39;/g, "'")))));

  $$('[data-toggle]').forEach((b) =>
    b.addEventListener('click', async () => {
      const nuevo = b.dataset.estadoActual === 'activo' ? 'pausado' : 'activo';
      try { await pausarRecordatorio(b.dataset.toggle, nuevo); toastExito('Recordatorio actualizado.'); cargar(); }
      catch (err) { toastError(err.message); }
    }));

  $$('[data-eliminar]').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await confirmar({ titulo: 'Eliminar recordatorio', mensaje: 'Se eliminarán también sus instancias futuras.', peligro: true, textoConfirmar: 'Eliminar' });
      if (!ok) return;
      try { await eliminarRecordatorio(b.dataset.eliminar); toastExito('Recordatorio eliminado.'); cargar(); }
      catch (err) { toastError(err.message); }
    }));
}

/* ── Abrir edición ── */
async function abrirEdicion(r) {
  $('#modal-rec-titulo').textContent = 'Editar recordatorio';
  $('#r-id').value = r.id;
  llenarSelectorEmpresa(r.empresa_id);
  $('#r-empresa').disabled = true;
  // Cargar agentes de la empresa (con cache)
  if (!EMPRESAS_AGENTES[r.empresa_id]) {
    EMPRESAS_AGENTES[r.empresa_id] = await listarAgentesDeEmpresa(r.empresa_id);
  }
  const seleccionados = (r.asignados || []).map((a) => a.agente?.id).filter(Boolean);
  await cargarProyectosModal(r.empresa_id);
  cargarAgentesModal(r.empresa_id, seleccionados);
  $('#r-proyecto').value = r.proyecto_id || '';
  $('#r-titulo').value = r.titulo;
  $('#r-descripcion').value = r.descripcion || '';
  $('#r-frecuencia').value = r.frecuencia;
  $('#r-hora').value = r.hora_recordatorio || '09:00';
  toggleFrecuencia();

  if (r.frecuencia === 'semanal') {
    $$('.dia-semana').forEach((c) => { c.checked = (r.dias_semana || []).includes(c.value); });
  }
  if (r.frecuencia === 'mensual') {
    $('#r-dia-mes').value = r.dia_mes || 1;
  }
  if (r.frecuencia === 'quincenal') {
    $('#r-dia-q1').value = r.dias_semana?.[0] || 15;
    $('#r-dia-q2').value = r.dias_semana?.[1] || 30;
  }

  formDirty = false;
  abrirModal('modal-recordatorio');
}

/* ── Confirmación al cerrar modal con datos ── */
function intentarCerrar() {
  if (formDirty) {
    if (!confirm('¿Descartar cambios sin guardar?')) return;
  }
  formDirty = false;
  cerrarModal('modal-recordatorio');
}

/* ── Bind ── */
function bind() {
  $('#btn-cerrar-modal-rec').addEventListener('click', intentarCerrar);
  $('#btn-cancelar-rec').addEventListener('click', intentarCerrar);
  $('#modal-recordatorio').addEventListener('modal:request-close', intentarCerrar);

  $('#r-frecuencia').addEventListener('change', toggleFrecuencia);

  // Cambio empresa → recarga proyectos y agentes
  $('#r-empresa').addEventListener('change', async (e) => {
    const empId = e.target.value;
    await cargarProyectosModal(empId);
    // Cargar agentes de la nueva empresa (con cache)
    if (!EMPRESAS_AGENTES[empId]) {
      EMPRESAS_AGENTES[empId] = await listarAgentesDeEmpresa(empId);
    }
    cargarAgentesModal(empId);
    formDirty = true;
  });

  // Detectar cambios en el formulario
  $('#form-recordatorio').addEventListener('input', () => { formDirty = true; });
  $('#form-recordatorio').addEventListener('change', () => { formDirty = true; });

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
    $$('.dia-semana').forEach((c) => { c.checked = false; });
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

    if (frecuencia === 'semanal') {
      datos.dias_semana = $$('.dia-semana:checked').map((c) => c.value);
    } else if (frecuencia === 'mensual') {
      datos.dia_mes = Number($('#r-dia-mes').value) || 1;
    } else if (frecuencia === 'quincenal') {
      datos.dias_semana = [
        String(Number($('#r-dia-q1').value) || 15),
        String(Number($('#r-dia-q2').value) || 30)
      ];
    }

    try {
      if (id) await actualizarRecordatorio(id, datos);
      else await crearRecordatorio(datos);
      toastExito('Recordatorio guardado.');
      formDirty = false;
      cerrarModal('modal-recordatorio');
      cargar();
    } catch (err) { toastError(err.message); }
  });
}

/* ── Init ── */
async function init() {
  renderLayout('recordatorios');
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

  // Cargar empresas y agentes
  EMPRESAS = await obtenerEmpresasDelAgente(AGENTE.id);
  if (!EMPRESAS.find((e) => e.id === EMPRESA_ID)) {
    EMPRESAS.unshift({ id: EMPRESA_ID, nombre: 'Empresa actual' });
  }
  AGENTES_EMPRESA = await listarAgentesDeEmpresa(EMPRESA_ID);
  EMPRESAS_AGENTES[EMPRESA_ID] = AGENTES_EMPRESA;

  // Multiselect empresas (filtro toolbar)
  msEmpresas = crearMultiSelect({
    placeholder: 'Empresas',
    options: EMPRESAS.map((e) => ({ value: e.id, label: e.nombre })),
    onChange: () => cargar()
  });
  $('#slot-ms-empresas-rec').appendChild(msEmpresas.el);

  // Multiselect agentes (filtro toolbar) — preselecciona usuario actual
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
