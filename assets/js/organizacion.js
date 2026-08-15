/**
 * organizacion.js — Módulo unificado de Organización
 * Tabs: Tareas · Empresas · Departamentos · Proyectos · Recordatorios
 * URL hash controla el tab activo: #tareas (default), #empresas, etc.
 */
import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import { supabase } from './supabase-client.js';
import {
  obtenerTareas, crearTarea, actualizarTarea, eliminarTarea, asignarAgentesATarea,
  listarTodasLasEmpresasConMembresia, crearEmpresa, actualizarEmpresa, eliminarEmpresa,
  listarDepartamentos, crearDepartamento, actualizarDepartamento, eliminarDepartamento,
  listarProyectos, crearProyecto, actualizarProyecto, eliminarProyecto,
  listarRecordatorios, obtenerEmpresasDelAgente, listarAgentesDeEmpresa,
} from './supabase-data.js';
import { $, escapeHTML, iniciales, tiempoRelativo } from './utils.js';

const TABS = ['tareas', 'empresas', 'departamentos', 'proyectos', 'recordatorios'];

let AGENTE = null;
let EMPRESA_ACTIVA_ID = null;
let EMPRESAS = [];
let TAB_CARGADO = {};

/* ====================================================
   BOOTSTRAP
   ==================================================== */
async function init() {
  renderLayout('organizacion');
  const ctx = await inicializarApp();
  AGENTE = ctx.agente;
  EMPRESAS = ctx.empresas ?? [];
  EMPRESA_ACTIVA_ID = EMPRESAS[0]?.id ?? null;

  const main = document.getElementById('main-content');
  main.innerHTML = plantilla();
  bindTabs();
  cargarTab(hashTab());

  window.addEventListener('hashchange', () => cargarTab(hashTab()));
}

function hashTab() {
  const h = location.hash.replace('#', '');
  return TABS.includes(h) ? h : 'tareas';
}

function plantilla() {
  return `
    <div class="page-header" style="margin-bottom:0">
      <div><h1>Organización</h1></div>
      <div id="org-header-action"></div>
    </div>
    <nav class="org-tabs" style="display:flex;gap:4px;border-bottom:1px solid var(--border-subtle);margin-bottom:var(--space-5);padding-top:var(--space-4);">
      ${TABS.map(t => `
        <a href="#${t}" class="org-tab" data-tab="${t}"
           style="padding:8px 18px;border-radius:8px 8px 0 0;font-size:var(--fs-sm);font-weight:600;color:var(--text-tertiary);text-decoration:none;border:1px solid transparent;border-bottom:none;transition:all .15s">
          ${labelTab(t)}
        </a>`).join('')}
    </nav>
    <div id="org-content"></div>
  `;
}

function labelTab(t) {
  return { tareas:'Tareas', empresas:'Empresas', departamentos:'Departamentos',
           proyectos:'Proyectos', recordatorios:'Recordatorios' }[t];
}

function bindTabs() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('.org-tab');
    if (!a) return;
    e.preventDefault();
    location.hash = a.dataset.tab;
  });
}

function activarTab(tab) {
  document.querySelectorAll('.org-tab').forEach(el => {
    const activo = el.dataset.tab === tab;
    el.style.color = activo ? 'var(--color-accent)' : 'var(--text-tertiary)';
    el.style.backgroundColor = activo ? 'var(--bg-surface)' : 'transparent';
    el.style.borderColor = activo ? 'var(--border-subtle)' : 'transparent';
  });
}

async function cargarTab(tab) {
  activarTab(tab);
  const contenedor = document.getElementById('org-content');
  const headerAction = document.getElementById('org-header-action');
  if (!contenedor) return;

  if (!TAB_CARGADO[tab]) {
    contenedor.innerHTML = '<div class="loading-spinner"></div>';
    headerAction.innerHTML = '';
    switch (tab) {
      case 'tareas':        await renderTareas(contenedor, headerAction); break;
      case 'empresas':      await renderEmpresas(contenedor, headerAction); break;
      case 'departamentos': await renderDepartamentos(contenedor, headerAction); break;
      case 'proyectos':     await renderProyectos(contenedor, headerAction); break;
      case 'recordatorios': await renderRecordatorios(contenedor, headerAction); break;
    }
    TAB_CARGADO[tab] = true;
  }
}

function invalidarTab(tab) { TAB_CARGADO[tab] = false; }

/* ====================================================
   TAB: TAREAS
   ==================================================== */
async function renderTareas(el, hdr) {
  const empresaIds = EMPRESAS.map(e => e.id);
  const { data: tareas } = await supabase
    .from('tareas')
    .select(`id, titulo, estado, prioridad, fecha_cierre, empresa_id,
             empresas(nombre), proyectos(nombre), agentes_tareas(agentes(nombre))`)
    .in('empresa_id', empresaIds.length ? empresaIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false })
    .limit(100);

  hdr.innerHTML = `<button class="btn btn-primary" id="btn-nueva-tarea">+ Nueva tarea</button>`;

  const colorEstado = { nuevo:'var(--color-warning)', en_progreso:'var(--color-accent)',
    en_revision:'#b88cff', completado:'var(--color-success)', archivado:'var(--text-tertiary)' };
  const colorPrio = { baja:'var(--text-tertiary)', normal:'var(--color-info)',
    alta:'var(--color-warning)', critica:'var(--color-danger)' };

  el.innerHTML = `
    <div style="display:flex;gap:var(--space-3);margin-bottom:var(--space-4);flex-wrap:wrap;">
      <input class="form-control" id="tarea-buscar" placeholder="Buscar tarea…" style="max-width:240px">
      <select class="form-control" id="tarea-filtro-estado" style="max-width:180px">
        <option value="">Todos los estados</option>
        <option>nuevo</option><option>en_progreso</option>
        <option>en_revision</option><option>completado</option><option>archivado</option>
      </select>
    </div>
    <div class="table-wrapper">
      <table class="data-table" id="tabla-tareas">
        <thead><tr>
          <th>Título</th><th>Empresa</th><th>Estado</th><th>Prioridad</th>
          <th>Cierre</th><th>Asignados</th><th></th>
        </tr></thead>
        <tbody>
          ${(tareas ?? []).map(t => `
            <tr data-titulo="${escapeHTML(t.titulo).toLowerCase()}" data-estado="${t.estado}">
              <td><strong>${escapeHTML(t.titulo)}</strong></td>
              <td style="color:var(--text-tertiary)">${escapeHTML(t.empresas?.nombre ?? '')}</td>
              <td><span style="font-size:var(--fs-xs);font-weight:700;color:${colorEstado[t.estado]}">${t.estado}</span></td>
              <td><span style="font-size:var(--fs-xs);font-weight:700;color:${colorPrio[t.prioridad]}">${t.prioridad}</span></td>
              <td style="font-size:var(--fs-sm);color:var(--text-tertiary)">${t.fecha_cierre ? new Date(t.fecha_cierre).toLocaleDateString('es-PE') : '—'}</td>
              <td style="font-size:var(--fs-xs);color:var(--text-tertiary)">${(t.agentes_tareas ?? []).map(a => a.agentes?.nombre?.split(' ')[0]).filter(Boolean).join(', ') || '—'}</td>
              <td>
                <button class="btn btn-sm btn-secondary" data-editar-tarea="${t.id}">Editar</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <!-- Modal tarea -->
    <div class="modal-overlay" id="modal-tarea-org">
      <div class="modal modal--lg">
        <div class="modal__header">
          <h3 id="modal-tarea-titulo-lbl">Nueva tarea</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <form id="form-tarea-org">
          <div class="modal__body" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
            <input type="hidden" id="tarea-org-id">
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Título *</label>
              <input class="form-control" id="tarea-org-titulo" required placeholder="Título de la tarea">
            </div>
            <div class="form-group">
              <label class="form-label">Empresa *</label>
              <select class="form-control" id="tarea-org-empresa" required>
                ${EMPRESAS.map(e => `<option value="${e.id}">${escapeHTML(e.nombre)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Estado</label>
              <select class="form-control" id="tarea-org-estado">
                <option>nuevo</option><option>en_progreso</option>
                <option>en_revision</option><option>completado</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Prioridad</label>
              <select class="form-control" id="tarea-org-prioridad">
                <option>baja</option><option value="normal" selected>normal</option>
                <option>alta</option><option>critica</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Fecha cierre</label>
              <input class="form-control" id="tarea-org-cierre" type="date">
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Descripción</label>
              <textarea class="form-control" id="tarea-org-desc" rows="3"></textarea>
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Filtros
  $('#tarea-buscar')?.addEventListener('input', () => filtrarFilas('tabla-tareas', 'tarea-buscar', 'tarea-filtro-estado'));
  $('#tarea-filtro-estado')?.addEventListener('change', () => filtrarFilas('tabla-tareas', 'tarea-buscar', 'tarea-filtro-estado'));

  // Nueva tarea
  document.getElementById('btn-nueva-tarea')?.addEventListener('click', () => {
    $('#tarea-org-id').value = '';
    $('#modal-tarea-titulo-lbl').textContent = 'Nueva tarea';
    document.getElementById('form-tarea-org').reset();
    abrirModal('modal-tarea-org');
  });

  // Editar tarea
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-editar-tarea]');
    if (!btn) return;
    const { data: t } = await supabase.from('tareas').select('*').eq('id', btn.dataset.editarTarea).single();
    if (!t) return;
    $('#tarea-org-id').value = t.id;
    $('#tarea-org-titulo').value = t.titulo;
    $('#tarea-org-empresa').value = t.empresa_id;
    $('#tarea-org-estado').value = t.estado;
    $('#tarea-org-prioridad').value = t.prioridad;
    $('#tarea-org-cierre').value = t.fecha_cierre ? t.fecha_cierre.slice(0,10) : '';
    $('#tarea-org-desc').value = t.descripcion ?? '';
    $('#modal-tarea-titulo-lbl').textContent = 'Editar tarea';
    abrirModal('modal-tarea-org');
  });

  // Guardar tarea
  document.getElementById('form-tarea-org')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#tarea-org-id').value;
    const payload = {
      titulo: $('#tarea-org-titulo').value,
      empresa_id: $('#tarea-org-empresa').value,
      estado: $('#tarea-org-estado').value,
      prioridad: $('#tarea-org-prioridad').value,
      fecha_cierre: $('#tarea-org-cierre').value || null,
      descripcion: $('#tarea-org-desc').value || null,
    };
    const { error } = id
      ? await supabase.from('tareas').update(payload).eq('id', id)
      : await supabase.from('tareas').insert({ ...payload, creador_id: AGENTE.id });
    if (error) { toastError('Error al guardar tarea'); return; }
    toastExito('Tarea guardada');
    cerrarModal('modal-tarea-org');
    invalidarTab('tareas');
    await cargarTab('tareas');
  });
}

function filtrarFilas(tablaId, buscadorId, estadoId) {
  const texto = ($(buscadorId)?.value ?? '').toLowerCase();
  const estado = $(estadoId)?.value ?? '';
  document.querySelectorAll(`#${tablaId} tbody tr`).forEach(tr => {
    const matchTexto = !texto || (tr.dataset.titulo ?? '').includes(texto);
    const matchEstado = !estado || tr.dataset.estado === estado;
    tr.style.display = matchTexto && matchEstado ? '' : 'none';
  });
}

/* ====================================================
   TAB: EMPRESAS
   ==================================================== */
async function renderEmpresas(el, hdr) {
  const empresas = await listarTodasLasEmpresasConMembresia(AGENTE.id);
  hdr.innerHTML = `<button class="btn btn-primary" id="btn-nueva-empresa-org">+ Nueva empresa</button>`;
  el.innerHTML = `
    <div class="grid-cards" id="grid-empresas-org">
      ${(empresas ?? []).map(e => `
        <div class="card" style="position:relative">
          <div class="card__body">
            <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3)">
              <div class="avatar" style="width:44px;height:44px;font-size:var(--fs-lg);background:var(--bg-elevated)">
                ${e.logo_url ? `<img src="${e.logo_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : iniciales(e.nombre)}
              </div>
              <div>
                <div style="font-weight:700;font-size:var(--fs-base)">${escapeHTML(e.nombre)}</div>
                <div style="font-size:var(--fs-xs);color:var(--text-tertiary)">${escapeHTML(e.descripcion ?? '')}</div>
              </div>
            </div>
            <div style="font-size:var(--fs-xs);color:var(--text-tertiary)">Rol: <strong>${e.rol ?? '—'}</strong></div>
          </div>
        </div>`).join('')}
    </div>
    <!-- Modal empresa -->
    <div class="modal-overlay" id="modal-empresa-org">
      <div class="modal">
        <div class="modal__header">
          <h3>Nueva empresa</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <form id="form-empresa-org">
          <div class="modal__body">
            <div class="form-group">
              <label class="form-label">Nombre *</label>
              <input class="form-control" id="empresa-org-nombre" required>
            </div>
            <div class="form-group">
              <label class="form-label">Descripción</label>
              <textarea class="form-control" id="empresa-org-desc" rows="2"></textarea>
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Crear</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('btn-nueva-empresa-org')?.addEventListener('click', () => {
    document.getElementById('form-empresa-org').reset();
    abrirModal('modal-empresa-org');
  });
  document.getElementById('form-empresa-org')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await crearEmpresa({
      nombre: $('#empresa-org-nombre').value,
      descripcion: $('#empresa-org-desc').value || null,
      creador_id: AGENTE.id,
    });
    if (error) { toastError('Error al crear empresa'); return; }
    toastExito('Empresa creada');
    cerrarModal('modal-empresa-org');
    invalidarTab('empresas');
    await cargarTab('empresas');
  });
}

/* ====================================================
   TAB: DEPARTAMENTOS
   ==================================================== */
async function renderDepartamentos(el, hdr) {
  const todos = [];
  for (const emp of EMPRESAS) {
    const lista = await listarDepartamentos(emp.id);
    (lista ?? []).forEach(d => todos.push({ ...d, empresa_nombre: emp.nombre }));
  }
  hdr.innerHTML = `<button class="btn btn-primary" id="btn-nuevo-depto">+ Nuevo departamento</button>`;
  el.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Nombre</th><th>Empresa</th><th>Descripción</th><th></th></tr></thead>
        <tbody>
          ${todos.map(d => `
            <tr>
              <td><strong>${escapeHTML(d.nombre)}</strong></td>
              <td style="color:var(--text-tertiary)">${escapeHTML(d.empresa_nombre ?? '')}</td>
              <td style="color:var(--text-tertiary);font-size:var(--fs-sm)">${escapeHTML(d.descripcion ?? '—')}</td>
              <td>
                <button class="btn btn-sm btn-secondary" data-editar-depto="${d.id}" data-nombre="${escapeHTML(d.nombre)}" data-desc="${escapeHTML(d.descripcion ?? '')}" data-emp="${d.empresa_id}">Editar</button>
                <button class="btn btn-sm btn-danger" data-eliminar-depto="${d.id}" style="margin-left:4px">Eliminar</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="modal-overlay" id="modal-depto-org">
      <div class="modal">
        <div class="modal__header">
          <h3 id="modal-depto-lbl">Nuevo departamento</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <form id="form-depto-org">
          <div class="modal__body">
            <input type="hidden" id="depto-org-id">
            <div class="form-group">
              <label class="form-label">Empresa *</label>
              <select class="form-control" id="depto-org-empresa" required>
                ${EMPRESAS.map(e => `<option value="${e.id}">${escapeHTML(e.nombre)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Nombre *</label>
              <input class="form-control" id="depto-org-nombre" required>
            </div>
            <div class="form-group">
              <label class="form-label">Descripción</label>
              <textarea class="form-control" id="depto-org-desc" rows="2"></textarea>
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('btn-nuevo-depto')?.addEventListener('click', () => {
    $('#depto-org-id').value = '';
    $('#modal-depto-lbl').textContent = 'Nuevo departamento';
    document.getElementById('form-depto-org').reset();
    abrirModal('modal-depto-org');
  });

  el.addEventListener('click', async (e) => {
    const editar = e.target.closest('[data-editar-depto]');
    if (editar) {
      $('#depto-org-id').value = editar.dataset.editarDepto;
      $('#depto-org-nombre').value = editar.dataset.nombre;
      $('#depto-org-desc').value = editar.dataset.desc;
      $('#depto-org-empresa').value = editar.dataset.emp;
      $('#modal-depto-lbl').textContent = 'Editar departamento';
      abrirModal('modal-depto-org');
    }
    const eliminar = e.target.closest('[data-eliminar-depto]');
    if (eliminar) {
      if (!await confirmar('¿Eliminar este departamento?')) return;
      const { error } = await eliminarDepartamento(eliminar.dataset.eliminarDepto);
      if (error) { toastError('Error'); return; }
      toastExito('Eliminado');
      invalidarTab('departamentos');
      await cargarTab('departamentos');
    }
  });

  document.getElementById('form-depto-org')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#depto-org-id').value;
    const payload = {
      empresa_id: $('#depto-org-empresa').value,
      nombre: $('#depto-org-nombre').value,
      descripcion: $('#depto-org-desc').value || null,
    };
    const { error } = id
      ? await actualizarDepartamento(id, payload)
      : await crearDepartamento(payload);
    if (error) { toastError('Error'); return; }
    toastExito('Guardado');
    cerrarModal('modal-depto-org');
    invalidarTab('departamentos');
    await cargarTab('departamentos');
  });
}

/* ====================================================
   TAB: PROYECTOS
   ==================================================== */
async function renderProyectos(el, hdr) {
  const todos = [];
  for (const emp of EMPRESAS) {
    const lista = await listarProyectos(emp.id);
    (lista ?? []).forEach(p => todos.push({ ...p, empresa_nombre: emp.nombre }));
  }
  hdr.innerHTML = `<button class="btn btn-primary" id="btn-nuevo-proyecto-org">+ Nuevo proyecto</button>`;

  const colorEstado = { activo:'var(--color-success)', pausado:'var(--color-warning)',
    completado:'var(--color-accent)', archivado:'var(--text-tertiary)' };

  el.innerHTML = `
    <div class="grid-cards">
      ${todos.map(p => `
        <div class="card" style="border-left:3px solid ${p.color_etiqueta ?? 'var(--color-accent)'}">
          <div class="card__body">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-2)">
              <strong style="font-size:var(--fs-base)">${escapeHTML(p.nombre)}</strong>
              <span style="font-size:var(--fs-xs);font-weight:700;color:${colorEstado[p.estado]}">${p.estado}</span>
            </div>
            <div style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-bottom:var(--space-3)">${escapeHTML(p.empresa_nombre ?? '')}</div>
            <div style="font-size:var(--fs-sm);color:var(--text-secondary)">${escapeHTML(p.descripcion ?? '—')}</div>
          </div>
        </div>`).join('')}
    </div>
    <div class="modal-overlay" id="modal-proyecto-org">
      <div class="modal">
        <div class="modal__header">
          <h3>Nuevo proyecto</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <form id="form-proyecto-org">
          <div class="modal__body">
            <div class="form-group">
              <label class="form-label">Empresa *</label>
              <select class="form-control" id="proy-org-empresa" required>
                ${EMPRESAS.map(e => `<option value="${e.id}">${escapeHTML(e.nombre)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Nombre *</label>
              <input class="form-control" id="proy-org-nombre" required>
            </div>
            <div class="form-group">
              <label class="form-label">Descripción</label>
              <textarea class="form-control" id="proy-org-desc" rows="2"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Color</label>
              <input type="color" id="proy-org-color" value="#00d4ff" class="form-control" style="height:40px">
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Crear</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('btn-nuevo-proyecto-org')?.addEventListener('click', () => {
    document.getElementById('form-proyecto-org').reset();
    abrirModal('modal-proyecto-org');
  });
  document.getElementById('form-proyecto-org')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await crearProyecto({
      empresa_id: $('#proy-org-empresa').value,
      nombre: $('#proy-org-nombre').value,
      descripcion: $('#proy-org-desc').value || null,
      color_etiqueta: $('#proy-org-color').value,
      creador_id: AGENTE.id,
    });
    if (error) { toastError('Error'); return; }
    toastExito('Proyecto creado');
    cerrarModal('modal-proyecto-org');
    invalidarTab('proyectos');
    await cargarTab('proyectos');
  });
}

/* ====================================================
   TAB: RECORDATORIOS
   ==================================================== */
async function renderRecordatorios(el, hdr) {
  const { data: recs } = await supabase
    .from('recordatorios_cronologicos')
    .select(`id, titulo, frecuencia, estado, hora_recordatorio, empresa_id, empresas(nombre)`)
    .eq('agente_id', AGENTE.id)
    .order('created_at', { ascending: false });

  hdr.innerHTML = '';
  el.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Título</th><th>Empresa</th><th>Frecuencia</th><th>Hora</th><th>Estado</th></tr></thead>
        <tbody>
          ${(recs ?? []).map(r => `
            <tr>
              <td><strong>${escapeHTML(r.titulo)}</strong></td>
              <td style="color:var(--text-tertiary)">${escapeHTML(r.empresas?.nombre ?? '—')}</td>
              <td style="text-transform:capitalize">${r.frecuencia}</td>
              <td>${r.hora_recordatorio ? r.hora_recordatorio.slice(0,5) : '—'}</td>
              <td><span style="font-size:var(--fs-xs);font-weight:700;color:${r.estado==='activo'?'var(--color-success)':'var(--text-tertiary)'}">${r.estado}</span></td>
            </tr>`).join('')}
          ${!recs?.length ? '<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary)">Sin recordatorios</td></tr>' : ''}
        </tbody>
      </table>
    </div>`;
}

init();
