import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import {
  listarDepartamentos, crearDepartamento, actualizarDepartamento, eliminarDepartamento,
  listarAgentesDeEmpresa, listarAgentesDeDepartamento, agregarAgenteADepartamento, quitarAgenteDeDepartamento
} from './supabase-data.js';
import { $, escapeHTML, iniciales } from './utils.js';

let EMPRESA_ID, AGENTES_EMPRESA = [];

function plantilla() {
  return `
    <div class="page-header">
      <div><h1>Departamentos</h1><p class="page-header__subtitle">Organiza tu empresa en áreas y asigna managers.</p></div>
      <button class="btn btn-primary" id="btn-nuevo">+ Nuevo departamento</button>
    </div>
    <div class="grid-cards" id="lista-departamentos"><div class="loading-spinner"></div></div>

    <div class="modal-overlay" id="modal-depto">
      <div class="modal">
        <div class="modal__header"><h3 id="modal-depto-titulo">Nuevo departamento</h3><button class="btn-icon" data-close>✕</button></div>
        <form id="form-depto">
          <div class="modal__body">
            <input type="hidden" id="depto-id" />
            <div class="form-group"><label class="form-label">Nombre</label><input class="form-control" id="depto-nombre" required /></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-control" id="depto-descripcion"></textarea></div>
            <div class="form-group"><label class="form-label">Manager</label>
              <select class="form-control" id="depto-manager"><option value="">Sin asignar</option></select>
            </div>
          </div>
          <div class="modal__footer"><button type="button" class="btn btn-secondary" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Guardar</button></div>
        </form>
      </div>
    </div>

    <div class="modal-overlay" id="modal-miembros">
      <div class="modal">
        <div class="modal__header"><h3>Miembros del departamento</h3><button class="btn-icon" data-close>✕</button></div>
        <div class="modal__body">
          <form id="form-agregar-miembro" style="display:flex; gap:var(--space-3); margin-bottom:var(--space-4);">
            <input type="hidden" id="miembro-depto-id" />
            <select class="form-control" id="select-agente-miembro"></select>
            <button class="btn btn-primary" type="submit">Agregar</button>
          </form>
          <ul id="lista-miembros-depto"></ul>
        </div>
      </div>
    </div>
  `;
}

function tarjeta(d) {
  return `
    <div class="card">
      <div class="card__header"><h3 class="card__title">${escapeHTML(d.nombre)}</h3></div>
      <p style="color:var(--text-secondary); font-size:var(--fs-sm); min-height:36px;">${escapeHTML(d.descripcion || 'Sin descripción')}</p>
      <p style="font-size:var(--fs-xs); color:var(--text-tertiary); margin-bottom:var(--space-3);">Manager: ${d.manager ? escapeHTML(d.manager.nombre) : 'Sin asignar'}</p>
      <div style="display:flex; gap:var(--space-2); flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" data-miembros="${d.id}">👥 Miembros</button>
        <button class="btn btn-tertiary btn-sm" data-editar='${JSON.stringify({id: d.id, nombre: d.nombre, descripcion: d.descripcion || '', manager_id: d.manager_id || ''})}'>✏️ Editar</button>
        <button class="btn btn-tertiary btn-sm" data-eliminar="${d.id}" style="color:var(--color-danger)">🗑️ Eliminar</button>
      </div>
    </div>
  `;
}

async function cargar() {
  const cont = $('#lista-departamentos');
  const lista = await listarDepartamentos(EMPRESA_ID);
  cont.innerHTML = lista.length ? lista.map(tarjeta).join('') : '<div class="empty-state"><div class="empty-state__icon">🗂️</div><h3>Sin departamentos</h3><p>Crea el primero para organizar tu equipo.</p></div>';

  cont.querySelectorAll('[data-miembros]').forEach((b) => b.addEventListener('click', () => abrirMiembros(b.dataset.miembros)));
  cont.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirEdicion(JSON.parse(b.dataset.editar))));
  cont.querySelectorAll('[data-eliminar]').forEach((b) => b.addEventListener('click', () => onEliminar(b.dataset.eliminar)));
}

function llenarSelectManager(seleccionado = '') {
  const sel = $('#depto-manager');
  sel.innerHTML = '<option value="">Sin asignar</option>' + AGENTES_EMPRESA.map((a) => `<option value="${a.agente.id}" ${a.agente.id === seleccionado ? 'selected' : ''}>${escapeHTML(a.agente.nombre)}</option>`).join('');
}

function abrirEdicion(d) {
  $('#modal-depto-titulo').textContent = 'Editar departamento';
  $('#depto-id').value = d.id;
  $('#depto-nombre').value = d.nombre;
  $('#depto-descripcion').value = d.descripcion;
  llenarSelectManager(d.manager_id);
  abrirModal('modal-depto');
}

async function onEliminar(id) {
  const ok = await confirmar({ titulo: 'Eliminar departamento', mensaje: 'Se desvinculará de proyectos y agentes asociados.', peligro: true, textoConfirmar: 'Eliminar' });
  if (!ok) return;
  try { await eliminarDepartamento(id); toastExito('Departamento eliminado.'); cargar(); }
  catch (err) { toastError(err.message); }
}

async function abrirMiembros(departamentoId) {
  $('#miembro-depto-id').value = departamentoId;
  $('#select-agente-miembro').innerHTML = AGENTES_EMPRESA.map((a) => `<option value="${a.agente.id}">${escapeHTML(a.agente.nombre)}</option>`).join('');
  abrirModal('modal-miembros');
  await refrescarMiembros(departamentoId);
}

async function refrescarMiembros(departamentoId) {
  const miembros = await listarAgentesDeDepartamento(departamentoId);
  $('#lista-miembros-depto').innerHTML = miembros.length
    ? miembros.map((m) => `
      <li style="display:flex; align-items:center; justify-content:space-between; padding:var(--space-2) 0; border-bottom:1px solid var(--border-subtle);">
        <span style="display:flex; align-items:center; gap:var(--space-2);"><div class="avatar">${iniciales(m.agente?.nombre || '?')}</div>${escapeHTML(m.agente?.nombre || '')}</span>
        <button class="btn btn-icon" data-quitar="${m.id}">🗑️</button>
      </li>`).join('')
    : '<li style="color:var(--text-tertiary);">Sin miembros aún.</li>';

  $('#lista-miembros-depto').querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', async () => {
    await quitarAgenteDeDepartamento(b.dataset.quitar);
    toastExito('Miembro removido.');
    refrescarMiembros(departamentoId);
  }));
}

function bind() {
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { cerrarModal('modal-depto'); cerrarModal('modal-miembros'); }));

  $('#btn-nuevo').addEventListener('click', () => {
    $('#modal-depto-titulo').textContent = 'Nuevo departamento';
    $('#depto-id').value = ''; $('#depto-nombre').value = ''; $('#depto-descripcion').value = '';
    llenarSelectManager('');
    abrirModal('modal-depto');
  });

  $('#form-depto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#depto-id').value;
    const datos = { empresa_id: EMPRESA_ID, nombre: $('#depto-nombre').value.trim(), descripcion: $('#depto-descripcion').value.trim(), manager_id: $('#depto-manager').value || null };
    try {
      if (id) await actualizarDepartamento(id, datos); else await crearDepartamento(datos);
      toastExito('Departamento guardado.'); cerrarModal('modal-depto'); cargar();
    } catch (err) { toastError(err.message); }
  });

  $('#form-agregar-miembro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const departamentoId = $('#miembro-depto-id').value;
    const agenteId = $('#select-agente-miembro').value;
    try { await agregarAgenteADepartamento(agenteId, departamentoId); toastExito('Miembro agregado.'); refrescarMiembros(departamentoId); }
    catch (err) { toastError(err.message); }
  });
}

async function init() {
  renderLayout('departamentos');
  const ctx = await inicializarApp();
  if (!ctx) return;
  EMPRESA_ID = ctx.empresaId;
  const main = document.getElementById('main-content');
  if (!EMPRESA_ID) { main.innerHTML = '<div class="empty-state"><h3>Crea o selecciona una empresa primero.</h3></div>'; return; }
  main.innerHTML = plantilla();
  AGENTES_EMPRESA = await listarAgentesDeEmpresa(EMPRESA_ID);
  bind();
  await cargar();
}

init();
