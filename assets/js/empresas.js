import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import {
  listarTodasLasEmpresasConMembresia, crearEmpresa, actualizarEmpresa, eliminarEmpresa,
  unirsEaEmpresa, listarAgentesDeEmpresa, invitarAgenteAEmpresa,
  cambiarRolAgenteEmpresa, removerAgenteDeEmpresa
} from './supabase-data.js';
import { $, escapeHTML, iniciales } from './utils.js';

let AGENTE, EMPRESA_ACTIVA_ID;

/* ============================================================
   PLANTILLA DE PÁGINA
   ============================================================ */
function plantillaPagina() {
  return `
    <div class="page-header">
      <div>
        <h1>Empresas</h1>
        <p class="page-header__subtitle">Únete a empresas existentes o crea la tuya propia.</p>
      </div>
      <button class="btn btn-primary" id="btn-nueva-empresa">+ Nueva empresa</button>
    </div>
    <div class="grid-cards" id="lista-empresas"><div class="loading-spinner"></div></div>

    <!-- Modal: crear / editar empresa -->
    <div class="modal-overlay" id="modal-empresa">
      <div class="modal">
        <div class="modal__header">
          <h3 id="modal-empresa-titulo">Nueva empresa</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <form id="form-empresa">
          <div class="modal__body">
            <input type="hidden" id="empresa-id" />
            <div class="form-group">
              <label class="form-label" for="empresa-nombre">Nombre de la empresa</label>
              <input class="form-control" id="empresa-nombre" required placeholder="Ej. Jhiro Perú S.A.C." />
            </div>
            <div class="form-group">
              <label class="form-label" for="empresa-descripcion">Descripción</label>
              <textarea class="form-control" id="empresa-descripcion" rows="3"
                placeholder="Breve descripción de la empresa"></textarea>
            </div>
            <!-- Solo visible para el fundador (se muestra/oculta dinámicamente) -->
            <div class="form-group" id="grupo-visibilidad" style="display:none;">
              <label class="form-label" style="display:flex; align-items:center; gap:var(--space-3); cursor:pointer;">
                <input type="checkbox" id="empresa-visible" style="width:18px; height:18px; cursor:pointer;" />
                <div>
                  <div>Empresa pública</div>
                  <div style="font-size:var(--fs-xs); color:var(--text-tertiary); font-weight:400;">
                    Si está marcado, cualquier usuario puede ver y unirse a esta empresa.
                    Solo tú (fundador) puedes cambiar esta opción.
                  </div>
                </div>
              </label>
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal: gestión de equipo -->
    <div class="modal-overlay" id="modal-equipo">
      <div class="modal modal--lg">
        <div class="modal__header">
          <h3>Equipo de la empresa</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <div class="modal__body">
          <form id="form-invitar" style="display:flex; gap:var(--space-3); margin-bottom:var(--space-5);">
            <input type="hidden" id="invitar-empresa-id" />
            <input class="form-control" id="invitar-email" type="email"
              placeholder="correo@empresa.com" required />
            <select class="form-control" id="invitar-rol" style="max-width:160px;">
              <option value="empleado">Empleado</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <button class="btn btn-primary" type="submit">Invitar</button>
          </form>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr><th>Agente</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr>
              </thead>
              <tbody id="tabla-equipo"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   TARJETA DE EMPRESA
   ============================================================ */
const ETIQUETAS_ROL = { admin: 'Admin', manager: 'Manager', empleado: 'Empleado' };

function tarjetaEmpresa(e) {
  const esFundador = e.creador_id === AGENTE.id;
  const esAdmin    = e.rol === 'admin';
  const puedeEditar = esFundador || esAdmin;

  if (e.esMiembro) {
    // ── Tarjeta de miembro ──────────────────────────────────
    const iconoVisible = e.visible
      ? `<span title="Empresa pública">🌐</span>`
      : `<span title="Empresa oculta" style="color:var(--color-warning)">🔒</span>`;

    return `
      <div class="card">
        <div class="card__header">
          <h3 class="card__title">${escapeHTML(e.nombre)} ${esFundador ? iconoVisible : ''}</h3>
          <span class="badge badge-estado-completado">${ETIQUETAS_ROL[e.rol] || e.rol}</span>
        </div>
        <p style="color:var(--text-secondary); font-size:var(--fs-sm); min-height:36px;">
          ${escapeHTML(e.descripcion || 'Sin descripción')}
        </p>
        <div style="display:flex; gap:var(--space-2); margin-top:var(--space-4); flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" data-equipo="${e.id}">👥 Equipo</button>
          ${puedeEditar ? `
            <button class="btn btn-tertiary btn-sm"
              data-editar="${e.id}"
              data-nombre="${escapeHTML(e.nombre)}"
              data-descripcion="${escapeHTML(e.descripcion || '')}"
              data-visible="${e.visible}"
              data-es-fundador="${esFundador}">✏️ Editar</button>` : ''}
          ${esAdmin ? `
            <button class="btn btn-tertiary btn-sm" data-eliminar="${e.id}"
              style="color:var(--color-danger)">🗑️ Eliminar</button>` : ''}
        </div>
      </div>`;
  }

  // ── Tarjeta de empresa visible (no miembro) ─────────────
  return `
    <div class="card" style="border-style:dashed; opacity:0.8;">
      <div class="card__header">
        <h3 class="card__title">${escapeHTML(e.nombre)}</h3>
        <span class="badge badge-estado-archivado">Sin acceso</span>
      </div>
      <p style="color:var(--text-secondary); font-size:var(--fs-sm); min-height:36px;">
        ${escapeHTML(e.descripcion || 'Sin descripción')}
      </p>
      <div style="margin-top:var(--space-4);">
        <button class="btn btn-primary btn-sm" data-unirse="${e.id}">🚀 Unirme</button>
      </div>
    </div>`;
}

/* ============================================================
   CARGAR LISTA
   ============================================================ */
async function cargarEmpresas() {
  const cont = $('#lista-empresas');
  const empresas = await listarTodasLasEmpresasConMembresia(AGENTE.id);

  if (!empresas.length) {
    cont.innerHTML = `<div class="empty-state">
      <div class="empty-state__icon">🏢</div>
      <h3>Sin empresas todavía</h3>
      <p>Crea la primera empresa para empezar.</p>
    </div>`;
    return;
  }

  cont.innerHTML = empresas.map(tarjetaEmpresa).join('');

  cont.querySelectorAll('[data-equipo]').forEach((btn) =>
    btn.addEventListener('click', () => abrirEquipo(btn.dataset.equipo)));

  cont.querySelectorAll('[data-editar]').forEach((btn) =>
    btn.addEventListener('click', () =>
      abrirEdicion(btn.dataset.editar, btn.dataset.nombre,
        btn.dataset.descripcion, btn.dataset.visible === 'true',
        btn.dataset.esFundador === 'true')));

  cont.querySelectorAll('[data-eliminar]').forEach((btn) =>
    btn.addEventListener('click', () => onEliminar(btn.dataset.eliminar)));

  cont.querySelectorAll('[data-unirse]').forEach((btn) =>
    btn.addEventListener('click', () => onUnirse(btn.dataset.unirse, btn)));
}

/* ============================================================
   ACCIONES
   ============================================================ */
async function onUnirse(empresaId, btn) {
  btn.disabled = true;
  btn.textContent = 'Uniéndose…';
  try {
    await unirsEaEmpresa(empresaId, AGENTE.id);
    toastExito('¡Te uniste a la empresa exitosamente!');
    await cargarEmpresas();
  } catch (err) {
    toastError(err.message);
    btn.disabled = false;
    btn.textContent = '🚀 Unirme';
  }
}

async function onEliminar(id) {
  const ok = await confirmar({
    titulo: 'Eliminar empresa',
    mensaje: 'Se eliminarán también sus departamentos, proyectos y tareas. Esta acción no se puede deshacer.',
    textoConfirmar: 'Eliminar',
    peligro: true
  });
  if (!ok) return;
  try {
    await eliminarEmpresa(id);
    toastExito('Empresa eliminada.');
    cargarEmpresas();
  } catch (err) { toastError(err.message); }
}

function abrirEdicion(id, nombre, descripcion, visible, esFundador) {
  $('#modal-empresa-titulo').textContent = 'Editar empresa';
  $('#empresa-id').value = id;
  $('#empresa-nombre').value = nombre;
  $('#empresa-descripcion').value = descripcion;

  // El toggle de visibilidad solo aparece para el fundador
  const grupoVisible = $('#grupo-visibilidad');
  if (esFundador) {
    grupoVisible.style.display = 'block';
    $('#empresa-visible').checked = visible;
  } else {
    grupoVisible.style.display = 'none';
  }
  abrirModal('modal-empresa');
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
        <div>
          <div style="font-weight:600;">${escapeHTML(f.agente?.nombre || 'Agente')}</div>
          <div style="font-size:var(--fs-xs); color:var(--text-tertiary);">${escapeHTML(f.agente?.email || '')}</div>
        </div>
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
    </tr>`).join('') ||
    '<tr><td colspan="4" style="text-align:center; color:var(--text-tertiary);">Sin agentes aún.</td></tr>';

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
      try {
        await removerAgenteDeEmpresa(btn.dataset.quitarMembresia);
        toastExito('Agente removido.');
        await refrescarEquipo(empresaId);
      } catch (err) { toastError(err.message); }
    });
  });
}

/* ============================================================
   BIND MODALES
   ============================================================ */
function bindModales() {
  document.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', () => {
    cerrarModal('modal-empresa');
    cerrarModal('modal-equipo');
  }));

  // Nueva empresa: ocultar toggle visibilidad (solo aparece al editar si es fundador)
  $('#btn-nueva-empresa').addEventListener('click', () => {
    $('#modal-empresa-titulo').textContent = 'Nueva empresa';
    $('#empresa-id').value = '';
    $('#empresa-nombre').value = '';
    $('#empresa-descripcion').value = '';
    $('#grupo-visibilidad').style.display = 'none';
    abrirModal('modal-empresa');
  });

  $('#form-empresa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id          = $('#empresa-id').value;
    const nombre      = $('#empresa-nombre').value.trim();
    const descripcion = $('#empresa-descripcion').value.trim();
    if (!nombre) return;

    try {
      if (id) {
        // Edición: incluir visible solo si el grupo está visible (es fundador)
        const cambios = { nombre, descripcion };
        if ($('#grupo-visibilidad').style.display !== 'none') {
          cambios.visible = $('#empresa-visible').checked;
        }
        await actualizarEmpresa(id, cambios);
      } else {
        await crearEmpresa({ nombre, descripcion, creador_id: AGENTE.id });
      }
      toastExito('Empresa guardada.');
      cerrarModal('modal-empresa');
      await cargarEmpresas();
    } catch (err) { toastError(err.message); }
  });

  $('#form-invitar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const empresaId = $('#invitar-empresa-id').value;
    const email     = $('#invitar-email').value.trim();
    const rol       = $('#invitar-rol').value;
    try {
      await invitarAgenteAEmpresa({ email, empresa_id: empresaId, rol });
      toastExito('Agente invitado correctamente.');
      $('#invitar-email').value = '';
      await refrescarEquipo(empresaId);
    } catch (err) { toastError(err.message); }
  });
}

/* ============================================================
   INIT
   ============================================================ */
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
