import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import {
  listarTodasLasEmpresasConMembresia, crearEmpresa, actualizarEmpresa, eliminarEmpresa,
  listarAgentesDeEmpresa, invitarAgenteAEmpresa, cambiarRolAgenteEmpresa, removerAgenteDeEmpresa
} from './supabase-data.js';
import { $, escapeHTML, iniciales } from './utils.js';

let AGENTE, EMPRESA_ACTIVA_ID;

function plantillaPagina() {
  return `
    <div class="page-header">
      <div>
        <h1>Empresas</h1>
        <p class="page-header__subtitle">Administra las empresas a las que perteneces y sus equipos.</p>
      </div>
      <button class="btn btn-primary" id="btn-nueva-empresa">+ Nueva empresa</button>
    </div>
    <div class="grid-cards" id="lista-empresas"><div class="loading-spinner"></div></div>

    <div class="modal-overlay" id="modal-empresa">
      <div class="modal">
        <div class="modal__header"><h3 id="modal-empresa-titulo">Nueva empresa</h3><button class="btn-icon" data-close-modal>✕</button></div>
        <form id="form-empresa">
          <div class="modal__body">
            <input type="hidden" id="empresa-id" />
            <div class="form-group">
              <label class="form-label" for="empresa-nombre">Nombre de la empresa</label>
              <input class="form-control" id="empresa-nombre" required placeholder="Ej. Jhiro Perú S.A.C." />
            </div>
            <div class="form-group">
              <label class="form-label" for="empresa-descripcion">Descripción</label>
              <textarea class="form-control" id="empresa-descripcion" placeholder="Breve descripción de la empresa"></textarea>
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>

    <div class="modal-overlay" id="modal-equipo">
      <div class="modal modal--lg">
        <div class="modal__header"><h3>Equipo de la empresa</h3><button class="btn-icon" data-close-modal>✕</button></div>
        <div class="modal__body">
          <form id="form-invitar" style="display:flex; gap:var(--space-3); margin-bottom:var(--space-5);">
            <input type="hidden" id="invitar-empresa-id" />
            <input class="form-control" id="invitar-email" type="email" placeholder="correo@empresa.com" required />
            <select class="form-control" id="invitar-rol" style="max-width:160px;">
              <option value="empleado">Empleado</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <button class="btn btn-primary" type="submit">Invitar</button>
          </form>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Agente</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody id="tabla-equipo"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

const ETIQUETAS_ROL = { admin: 'Admin', manager: 'Manager', empleado: 'Empleado' };

function tarjetaEmpresa(e) {
  const esMiembro = e.esMiembro;
  const badgeClase = esMiembro ? 'badge-estado-completado' : 'badge-estado-archivado';
  const badgeTexto = esMiembro ? (ETIQUETAS_ROL[e.rol] || e.rol) : 'Sin acceso';

  return `
    <div class="card" style="${!esMiembro ? 'opacity:0.72;' : ''}">
      <div class="card__header">
        <h3 class="card__title">${escapeHTML(e.nombre)}</h3>
        <span class="badge ${badgeClase}">${badgeTexto}</span>
      </div>
      <p style="color:var(--text-secondary); font-size:var(--fs-sm); min-height:40px;">${escapeHTML(e.descripcion || 'Sin descripción')}</p>
      <div style="display:flex; gap:var(--space-2); margin-top:var(--space-4); flex-wrap:wrap;">
        ${esMiembro ? `
          <button class="btn btn-secondary btn-sm" data-equipo="${e.id}">👥 Equipo</button>
          ${e.rol === 'admin' ? `
            <button class="btn btn-tertiary btn-sm" data-editar="${e.id}" data-nombre="${escapeHTML(e.nombre)}" data-descripcion="${escapeHTML(e.descripcion || '')}">✏️ Editar</button>
            <button class="btn btn-tertiary btn-sm" data-eliminar="${e.id}" style="color:var(--color-danger)">🗑️ Eliminar</button>
          ` : ''}
        ` : `
          <span style="font-size:var(--fs-xs); color:var(--text-tertiary); align-self:center;">
            🔒 Pide al administrador que te invite a esta empresa.
          </span>
        `}
      </div>
    </div>
  `;
}

async function cargarEmpresas() {
  const cont = $('#lista-empresas');
  const empresas = await listarTodasLasEmpresasConMembresia(AGENTE.id);
  cont.innerHTML = empresas.length
    ? empresas.map(tarjetaEmpresa).join('')
    : `<div class="empty-state"><div class="empty-state__icon">🏢</div><h3>Sin empresas todavía</h3><p>Crea la primera empresa para empezar.</p></div>`;

  cont.querySelectorAll('[data-equipo]').forEach((btn) => btn.addEventListener('click', () => abrirEquipo(btn.dataset.equipo)));
  cont.querySelectorAll('[data-editar]').forEach((btn) => btn.addEventListener('click', () => abrirEdicion(btn.dataset.editar, btn.dataset.nombre, btn.dataset.descripcion)));
  cont.querySelectorAll('[data-eliminar]').forEach((btn) => btn.addEventListener('click', () => onEliminar(btn.dataset.eliminar)));
}

function abrirEdicion(id, nombre, descripcion) {
  $('#modal-empresa-titulo').textContent = 'Editar empresa';
  $('#empresa-id').value = id;
  $('#empresa-nombre').value = nombre;
  $('#empresa-descripcion').value = descripcion;
  abrirModal('modal-empresa');
}

async function onEliminar(id) {
  const ok = await confirmar({ titulo: 'Eliminar empresa', mensaje: 'Se eliminarán también sus departamentos, proyectos y tareas. Esta acción no se puede deshacer.', textoConfirmar: 'Eliminar', peligro: true });
  if (!ok) return;
  try {
    await eliminarEmpresa(id);
    toastExito('Empresa eliminada.');
    cargarEmpresas();
  } catch (err) { toastError(err.message); }
}

async function abrirEquipo(empresaId) {
  $('#invitar-empresa-id').value = empresaId;
  abrirModal('modal-equipo');
  await refrescarEquipo(empresaId);
}

async function refrescarEquipo(empresaId) {
  const filas = await listarAgentesDeEmpresa(empresaId);
  $('#tabla-equipo').innerHTML = filas.map((f) => `
    <tr>
      <td style="display:flex; align-items:center; gap:var(--space-2);">
        <div class="avatar">${iniciales(f.agente?.nombre || '?')}</div>
        <div><div style="font-weight:600;">${escapeHTML(f.agente?.nombre || 'Agente')}</div><div style="font-size:var(--fs-xs); color:var(--text-tertiary);">${escapeHTML(f.agente?.email || '')}</div></div>
      </td>
      <td>
        <select class="form-control" data-rol-membresia="${f.id}" style="min-height:36px;">
          <option value="empleado" ${f.rol === 'empleado' ? 'selected' : ''}>Empleado</option>
          <option value="manager" ${f.rol === 'manager' ? 'selected' : ''}>Manager</option>
          <option value="admin" ${f.rol === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td>
      <td><span class="badge badge-estado-completado">${escapeHTML(f.estado)}</span></td>
      <td><button class="btn btn-icon" data-quitar-membresia="${f.id}" title="Quitar">🗑️</button></td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center; color:var(--text-tertiary);">Aún no hay agentes en esta empresa.</td></tr>';

  $('#tabla-equipo').querySelectorAll('[data-rol-membresia]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try { await cambiarRolAgenteEmpresa(sel.dataset.rolMembresia, sel.value); toastExito('Rol actualizado.'); }
      catch (err) { toastError(err.message); }
    });
  });
  $('#tabla-equipo').querySelectorAll('[data-quitar-membresia]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await confirmar({ titulo: 'Quitar agente', mensaje: '¿Quitar a este agente de la empresa?', peligro: true, textoConfirmar: 'Quitar' });
      if (!ok) return;
      try { await removerAgenteDeEmpresa(btn.dataset.quitarMembresia); toastExito('Agente removido.'); await refrescarEquipo(empresaId); }
      catch (err) { toastError(err.message); }
    });
  });
}

function bindModales() {
  document.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', () => {
    cerrarModal('modal-empresa'); cerrarModal('modal-equipo');
  }));

  $('#btn-nueva-empresa').addEventListener('click', () => {
    $('#modal-empresa-titulo').textContent = 'Nueva empresa';
    $('#empresa-id').value = '';
    $('#empresa-nombre').value = '';
    $('#empresa-descripcion').value = '';
    abrirModal('modal-empresa');
  });

  $('#form-empresa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#empresa-id').value;
    const nombre = $('#empresa-nombre').value.trim();
    const descripcion = $('#empresa-descripcion').value.trim();
    if (!nombre) return;
    try {
      if (id) await actualizarEmpresa(id, { nombre, descripcion });
      else await crearEmpresa({ nombre, descripcion, creador_id: AGENTE.id });
      toastExito('Empresa guardada.');
      cerrarModal('modal-empresa');
      cargarEmpresas();
    } catch (err) { toastError(err.message); }
  });

  $('#form-invitar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const empresaId = $('#invitar-empresa-id').value;
    const email = $('#invitar-email').value.trim();
    const rol = $('#invitar-rol').value;
    try {
      await invitarAgenteAEmpresa({ email, empresa_id: empresaId, rol });
      toastExito('Agente invitado correctamente.');
      $('#invitar-email').value = '';
      await refrescarEquipo(empresaId);
    } catch (err) { toastError(err.message); }
  });
}

async function init() {
  renderLayout('empresas');
  const ctx = await inicializarApp();
  if (!ctx) return;
  AGENTE = ctx.agente;
  EMPRESA_ACTIVA_ID = ctx.empresaId;

  document.getElementById('main-content').innerHTML = plantillaPagina();
  bindModales();
  await cargarEmpresas();
}

init();
