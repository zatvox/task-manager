import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, confirmar } from './main.js';
import {
  obtenerTarea, actualizarTarea, eliminarTarea, asignarAgentesATarea, desasignarAgenteDeTarea,
  listarProyectos, listarAgentesDeEmpresa, listarComentarios, crearComentario, eliminarComentario, listarHistorialTarea
} from './supabase-data.js';
import { $, $$, qs, escapeHTML, formatearFechaHora, iniciales, tiempoRelativo, ETIQUETAS_ESTADO, ETIQUETAS_PRIORIDAD } from './utils.js';

const ESTADOS = ['nuevo', 'en_progreso', 'en_revision', 'completado', 'archivado'];

async function init() {
  renderLayout('tareas');
  const ctx = await inicializarApp();
  if (!ctx) return;
  const { agente, empresaId } = ctx;
  const tareaId = qs('id');
  const main = document.getElementById('main-content');

  if (!tareaId) { main.innerHTML = '<div class="empty-state"><h3>Tarea no especificada.</h3></div>'; return; }
  const tarea = await obtenerTarea(tareaId);
  if (!tarea) { main.innerHTML = '<div class="empty-state"><h3>Tarea no encontrada.</h3></div>'; return; }

  const [proyectos, agentesEmpresa, comentarios, { data: historial }] = await Promise.all([
    listarProyectos(empresaId), listarAgentesDeEmpresa(empresaId), listarComentarios(tareaId), listarHistorialTarea(tareaId, 0, 30)
  ]);

  const idsAsignados = new Set((tarea.asignados || []).map((a) => a.agente?.id));

  main.innerHTML = `
    <div class="breadcrumbs"><a href="tareas.html">Tareas</a><span class="sep">/</span><span class="current">${escapeHTML(tarea.titulo)}</span></div>
    <div class="page-header">
      <div><h1>${escapeHTML(tarea.titulo)}</h1><p class="page-header__subtitle">Creada el ${formatearFechaHora(tarea.created_at)}</p></div>
      <button class="btn btn-danger" id="btn-eliminar">🗑️ Eliminar tarea</button>
    </div>

    <div style="display:grid; grid-template-columns: 1.6fr 1fr; gap: var(--space-5);">
      <div class="card">
        <h3 style="margin-bottom:var(--space-4);">Información general</h3>
        <form id="form-tarea">
          <div class="form-group"><label class="form-label">Título</label><input class="form-control" id="f-titulo" value="${escapeHTML(tarea.titulo)}" required /></div>
          <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-control" id="f-descripcion">${escapeHTML(tarea.descripcion || '')}</textarea></div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Proyecto</label>
              <select class="form-control" id="f-proyecto"><option value="">Sin proyecto</option>${proyectos.map((p) => `<option value="${p.id}" ${p.id === tarea.proyecto_id ? 'selected' : ''}>${escapeHTML(p.nombre)}</option>`).join('')}</select>
            </div>
            <div class="form-group"><label class="form-label">Estado</label>
              <select class="form-control" id="f-estado">${ESTADOS.map((e) => `<option value="${e}" ${e === tarea.estado ? 'selected' : ''}>${ETIQUETAS_ESTADO[e]}</option>`).join('')}</select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Prioridad</label>
              <select class="form-control" id="f-prioridad">${Object.entries(ETIQUETAS_PRIORIDAD).map(([k, v]) => `<option value="${k}" ${k === tarea.prioridad ? 'selected' : ''}>${v}</option>`).join('')}</select>
            </div>
            <div class="form-group"><label class="form-label">Etiquetas</label><input class="form-control" id="f-etiquetas" value="${(tarea.etiquetas || []).join(', ')}" /></div>
          </div>
          ${!tarea.es_cronologica ? `
          <div class="form-row">
            <div class="form-group"><label class="form-label">Fecha de inicio</label><input class="form-control" type="date" id="f-fecha-inicio" value="${tarea.fecha_inicio ? tarea.fecha_inicio.slice(0,10) : ''}" /></div>
            <div class="form-group"><label class="form-label">Fecha de cierre</label><input class="form-control" type="date" id="f-fecha-cierre" value="${tarea.fecha_cierre ? tarea.fecha_cierre.slice(0,10) : ''}" /></div>
          </div>` : `<p class="badge badge-estado-en_progreso">🔁 Tarea cronológica (${escapeHTML(tarea.frecuencia || '')})</p>`}
          <div class="form-row">
            <div class="form-group"><label class="form-label">Tiempo estimado (h)</label><input class="form-control" type="number" id="f-tiempo-estimado" value="${tarea.tiempo_estimado_horas ?? ''}" /></div>
            <div class="form-group"><label class="form-label">Tiempo real (h)</label><input class="form-control" type="number" step="0.5" id="f-tiempo-real" value="${tarea.tiempo_real_horas ?? ''}" /></div>
          </div>
          <button type="submit" class="btn btn-primary">Guardar cambios</button>
        </form>
      </div>

      <div class="card">
        <h3 style="margin-bottom:var(--space-4);">Agentes asignados</h3>
        <div id="lista-asignados">
          ${agentesEmpresa.map((a) => `
            <label class="checkbox-row" style="margin-bottom:var(--space-2);">
              <input type="checkbox" class="check-asignado" value="${a.agente.id}" ${idsAsignados.has(a.agente.id) ? 'checked' : ''} />
              <div class="avatar">${iniciales(a.agente.nombre)}</div> ${escapeHTML(a.agente.nombre)}
            </label>`).join('')}
        </div>
        <button class="btn btn-secondary btn-block" id="btn-guardar-asignados" style="margin-top:var(--space-3);">Actualizar asignados</button>
      </div>
    </div>

    <div class="card" style="margin-top:var(--space-5);">
      <h3 style="margin-bottom:var(--space-4);">Comentarios</h3>
      <div id="lista-comentarios">
        ${comentarios.length ? comentarios.map((c) => `
          <div style="display:flex; gap:var(--space-3); padding:var(--space-3) 0; border-bottom:1px solid var(--border-subtle);">
            <div class="avatar">${iniciales(c.agente?.nombre || '?')}</div>
            <div style="flex:1;">
              <div style="display:flex; justify-content:space-between;"><strong style="font-size:var(--fs-sm);">${escapeHTML(c.agente?.nombre || '')}</strong><span style="font-size:var(--fs-xs); color:var(--text-tertiary);">${tiempoRelativo(c.created_at)}</span></div>
              <p style="font-size:var(--fs-sm);">${escapeHTML(c.texto)}</p>
            </div>
            ${c.agente_id === agente.id ? `<button class="btn-icon" data-borrar-comentario="${c.id}">🗑️</button>` : ''}
          </div>`).join('') : '<p style="color:var(--text-tertiary);">Sin comentarios todavía.</p>'}
      </div>
      <form id="form-comentario" style="display:flex; gap:var(--space-3); margin-top:var(--space-4);">
        <input class="form-control" id="input-comentario" placeholder="Escribe un comentario…" />
        <button class="btn btn-primary">Comentar</button>
      </form>
    </div>

    <div class="card" style="margin-top:var(--space-5);">
      <h3 style="margin-bottom:var(--space-4);">Historial de cambios</h3>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Campo</th><th>Antes</th><th>Ahora</th><th>Agente</th><th>Fecha</th></tr></thead>
        <tbody>${historial.length ? historial.map((h) => `
          <tr><td>${escapeHTML(h.campo_modificado)}</td><td>${escapeHTML(h.valor_antiguo || '—')}</td><td>${escapeHTML(h.valor_nuevo || '—')}</td><td>${escapeHTML(h.agente?.nombre || 'Sistema')}</td><td>${formatearFechaHora(h.created_at)}</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center; color:var(--text-tertiary);">Sin cambios registrados.</td></tr>'}</tbody>
      </table></div>
    </div>
  `;

  $('#form-tarea').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cambios = {
      titulo: $('#f-titulo').value.trim(),
      descripcion: $('#f-descripcion').value.trim(),
      proyecto_id: $('#f-proyecto').value || null,
      estado: $('#f-estado').value,
      prioridad: $('#f-prioridad').value,
      etiquetas: $('#f-etiquetas').value.split(',').map((s) => s.trim()).filter(Boolean),
      tiempo_estimado_horas: $('#f-tiempo-estimado').value ? Number($('#f-tiempo-estimado').value) : null,
      tiempo_real_horas: $('#f-tiempo-real').value ? Number($('#f-tiempo-real').value) : null
    };
    if (!tarea.es_cronologica) {
      cambios.fecha_inicio = $('#f-fecha-inicio').value || null;
      cambios.fecha_cierre = $('#f-fecha-cierre').value || null;
    }
    if (cambios.estado === 'completado') cambios.completado_por = agente.id;
    try { await actualizarTarea(tareaId, cambios); toastExito('Tarea actualizada.'); }
    catch (err) { toastError(err.message); }
  });

  $('#btn-guardar-asignados').addEventListener('click', async () => {
    const seleccionados = $$('.check-asignado:checked').map((c) => c.value);
    try { await asignarAgentesATarea(tareaId, seleccionados); toastExito('Asignaciones actualizadas.'); }
    catch (err) { toastError(err.message); }
  });

  $('#btn-eliminar').addEventListener('click', async () => {
    const ok = await confirmar({ titulo: 'Eliminar tarea', mensaje: 'Esta acción no se puede deshacer.', peligro: true, textoConfirmar: 'Eliminar' });
    if (!ok) return;
    try { await eliminarTarea(tareaId); toastExito('Tarea eliminada.'); window.location.href = 'tareas.html'; }
    catch (err) { toastError(err.message); }
  });

  $('#form-comentario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = $('#input-comentario').value.trim();
    if (!texto) return;
    try { await crearComentario({ tarea_id: tareaId, agente_id: agente.id, texto }); window.location.reload(); }
    catch (err) { toastError(err.message); }
  });

  $$('[data-borrar-comentario]').forEach((b) => b.addEventListener('click', async () => {
    try { await eliminarComentario(b.dataset.borrarComentario); window.location.reload(); }
    catch (err) { toastError(err.message); }
  }));
}

init();
