import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import { listarRecordatorios, crearRecordatorio, pausarRecordatorio, eliminarRecordatorio } from './supabase-data.js';
import { $, $$, escapeHTML, formatearHora } from './utils.js';

let AGENTE, EMPRESA_ID;

function plantilla() {
  return `
    <div class="page-header">
      <div><h1>Recordatorios cronológicos</h1><p class="page-header__subtitle">Recordatorios personales recurrentes, independientes de un proyecto.</p></div>
      <button class="btn btn-primary" id="btn-nuevo">+ Nuevo recordatorio</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Título</th><th>Frecuencia</th><th>Hora</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody id="tabla-recordatorios"><tr><td colspan="5"><div class="loading-spinner"></div></td></tr></tbody>
      </table>
    </div>

    <div class="modal-overlay" id="modal-recordatorio">
      <div class="modal">
        <div class="modal__header"><h3>Nuevo recordatorio</h3><button class="btn-icon" data-close>✕</button></div>
        <form id="form-recordatorio">
          <div class="modal__body">
            <div class="form-group"><label class="form-label">Título</label><input class="form-control" id="r-titulo" required /></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-control" id="r-descripcion"></textarea></div>
            <div class="form-group"><label class="form-label">Frecuencia</label>
              <select class="form-control" id="r-frecuencia"><option value="diaria">Diaria</option><option value="semanal">Semanal</option><option value="mensual">Mensual</option></select>
            </div>
            <div class="form-group" id="grupo-dias" style="display:none;">
              <label class="form-label">Días de la semana</label>
              <div style="display:flex; gap:var(--space-2); flex-wrap:wrap;">
                ${['lunes','martes','miercoles','jueves','viernes','sabado','domingo'].map((d) => `<label class="checkbox-row"><input type="checkbox" class="dia-semana" value="${d}" /> ${d}</label>`).join('')}
              </div>
            </div>
            <div class="form-group" id="grupo-dia-mes" style="display:none;"><label class="form-label">Día del mes</label><input class="form-control" type="number" min="1" max="31" id="r-dia-mes" /></div>
            <div class="form-group"><label class="form-label">Hora del recordatorio</label><input class="form-control" type="time" id="r-hora" value="09:00" /></div>
          </div>
          <div class="modal__footer"><button type="button" class="btn btn-secondary" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Crear</button></div>
        </form>
      </div>
    </div>
  `;
}

async function cargar() {
  const lista = await listarRecordatorios(AGENTE.id);
  $('#tabla-recordatorios').innerHTML = lista.length
    ? lista.map((r) => `
      <tr>
        <td>${escapeHTML(r.titulo)}</td>
        <td>${escapeHTML(r.frecuencia)}${r.dias_semana?.length ? ' (' + r.dias_semana.join(', ') + ')' : ''}${r.dia_mes ? ' (día ' + r.dia_mes + ')' : ''}</td>
        <td>${r.hora_recordatorio ? formatearHora(r.hora_recordatorio) : '—'}</td>
        <td><span class="badge badge-estado-${r.estado === 'activo' ? 'completado' : 'archivado'}">${escapeHTML(r.estado)}</span></td>
        <td>
          <button class="btn btn-icon" data-toggle="${r.id}" data-estado-actual="${r.estado}" title="Pausar/activar">${r.estado === 'activo' ? '⏸️' : '▶️'}</button>
          <button class="btn btn-icon" data-eliminar="${r.id}" title="Eliminar">🗑️</button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center; color:var(--text-tertiary); padding:var(--space-6);">Sin recordatorios. Crea uno para empezar.</td></tr>';

  $$('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    const nuevo = b.dataset.estadoActual === 'activo' ? 'pausado' : 'activo';
    try { await pausarRecordatorio(b.dataset.toggle, nuevo); toastExito('Recordatorio actualizado.'); cargar(); }
    catch (err) { toastError(err.message); }
  }));
  $$('[data-eliminar]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmar({ titulo: 'Eliminar recordatorio', mensaje: 'Se eliminarán también sus instancias futuras.', peligro: true, textoConfirmar: 'Eliminar' });
    if (!ok) return;
    try { await eliminarRecordatorio(b.dataset.eliminar); toastExito('Recordatorio eliminado.'); cargar(); }
    catch (err) { toastError(err.message); }
  }));
}

function bind() {
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => cerrarModal('modal-recordatorio')));
  $('#btn-nuevo').addEventListener('click', () => { $('#form-recordatorio').reset(); abrirModal('modal-recordatorio'); $('#grupo-dias').style.display = 'none'; $('#grupo-dia-mes').style.display = 'none'; });

  $('#r-frecuencia').addEventListener('change', (e) => {
    $('#grupo-dias').style.display = e.target.value === 'semanal' ? 'block' : 'none';
    $('#grupo-dia-mes').style.display = e.target.value === 'mensual' ? 'block' : 'none';
  });

  $('#form-recordatorio').addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = {
      agente_id: AGENTE.id,
      empresa_id: EMPRESA_ID,
      titulo: $('#r-titulo').value.trim(),
      descripcion: $('#r-descripcion').value.trim(),
      frecuencia: $('#r-frecuencia').value,
      hora_recordatorio: $('#r-hora').value || null,
      dias_semana: $('#r-frecuencia').value === 'semanal' ? $$('.dia-semana:checked').map((c) => c.value) : null,
      dia_mes: $('#r-frecuencia').value === 'mensual' ? Number($('#r-dia-mes').value) || 1 : null
    };
    try { await crearRecordatorio(datos); toastExito('Recordatorio creado.'); cerrarModal('modal-recordatorio'); cargar(); }
    catch (err) { toastError(err.message); }
  });
}

async function init() {
  renderLayout('recordatorios');
  const ctx = await inicializarApp();
  if (!ctx) return;
  AGENTE = ctx.agente; EMPRESA_ID = ctx.empresaId;
  document.getElementById('main-content').innerHTML = plantilla();
  bind();
  await cargar();
}

init();
