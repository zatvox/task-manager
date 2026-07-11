import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, confirmar } from './main.js';
import {
  obtenerTarea, actualizarTarea, eliminarTarea, asignarAgentesATarea,
  listarProyectos, listarAgentesDeEmpresa, obtenerEmpresasDelAgente,
  listarComentarios, crearComentario, eliminarComentario, listarHistorialTarea
} from './supabase-data.js';
import { $, $$, qs, escapeHTML, formatearFechaHora, iniciales, tiempoRelativo, ETIQUETAS_ESTADO, ETIQUETAS_PRIORIDAD } from './utils.js';

const ESTADOS = ['nuevo', 'en_progreso', 'en_revision', 'completado', 'archivado'];

/* Recarga proyectos y agentes cuando cambia la empresa */
async function recargarEmpresa(empresaId) {
  const [proyectos, agentes] = await Promise.all([
    listarProyectos(empresaId),
    listarAgentesDeEmpresa(empresaId)
  ]);

  // Proyectos
  $('#f-proyecto').innerHTML =
    '<option value="">Sin proyecto</option>' +
    proyectos.map((p) => `<option value="${p.id}">${escapeHTML(p.nombre)}</option>`).join('');

  // Agentes
  $('#lista-asignados').innerHTML = agentes.map((a) => `
    <label class="checkbox-row" style="margin-bottom:var(--space-2);">
      <input type="checkbox" class="check-asignado" value="${a.agente.id}" />
      <div class="avatar">${iniciales(a.agente.nombre)}</div> ${escapeHTML(a.agente.nombre)}
    </label>`).join('');
}

async function init() {
  renderLayout('tareas');
  const ctx = await inicializarApp();
  if (!ctx) return;
  const { agente } = ctx;
  const tareaId = qs('id');
  const main = document.getElementById('main-content');

  if (!tareaId) { main.innerHTML = '<div class="empty-state"><h3>Tarea no especificada.</h3></div>'; return; }
  const tarea = await obtenerTarea(tareaId);
  if (!tarea) { main.innerHTML = '<div class="empty-state"><h3>Tarea no encontrada.</h3></div>'; return; }

  // Usa la empresa de la tarea, no la del contexto global
  const tareaEmpresaId = tarea.empresa_id;

  const [empresas, proyectos, agentesEmpresa, comentarios, { data: historial }] = await Promise.all([
    obtenerEmpresasDelAgente(agente.id),
    listarProyectos(tareaEmpresaId),
    listarAgentesDeEmpresa(tareaEmpresaId),
    listarComentarios(tareaId),
    listarHistorialTarea(tareaId, 0, 30)
  ]);

  const idsAsignados = new Set((tarea.asignados || []).map((a) => a.agente?.id).filter(Boolean));

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
          <div class="form-group">
            <label class="form-label">Empresa</label>
            <select class="form-control" id="f-empresa">
              ${empresas.map((e) => `<option value="${e.id}" ${e.id === tareaEmpresaId ? 'selected' : ''}>${escapeHTML(e.nombre)}</option>`).join('')}
            </select>
          </div>
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
          <div id="seccion-cronologica" style="margin-bottom:var(--space-3);">
            <label class="checkbox-row" style="margin-bottom:var(--space-3); cursor:pointer;">
              <input type="checkbox" id="f-es-cronologica" ${tarea.es_cronologica ? 'checked' : ''} />
              <span style="font-size:var(--fs-sm); font-weight:600; color:var(--color-accent);">🔁 Tarea cronológica</span>
            </label>
            <div id="bloque-fechas" style="${tarea.es_cronologica ? 'display:none;' : ''}">
              <div class="form-row">
                <div class="form-group"><label class="form-label">Fecha de inicio</label><input class="form-control" type="date" id="f-fecha-inicio" value="${tarea.fecha_inicio ? tarea.fecha_inicio.slice(0,10) : ''}" /></div>
                <div class="form-group"><label class="form-label">Fecha de cierre</label><input class="form-control" type="date" id="f-fecha-cierre" value="${tarea.fecha_cierre ? tarea.fecha_cierre.slice(0,10) : ''}" /></div>
              </div>
            </div>
            <div id="bloque-cronologico" style="${!tarea.es_cronologica ? 'display:none;' : ''}">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Frecuencia</label>
                  <select class="form-control" id="f-frecuencia">
                    ${['diaria','semanal','quincenal','mensual','anual'].map(f => `<option value="${f}" ${tarea.frecuencia === f ? 'selected' : ''}>${f.charAt(0).toUpperCase()+f.slice(1)}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div id="bloque-dias-semana" style="${tarea.frecuencia === 'semanal' ? '' : 'display:none;'}">
                <label class="form-label">Días de la semana</label>
                <div style="display:flex; gap:var(--space-2); flex-wrap:wrap; margin-bottom:var(--space-3);">
                  ${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((d,i) => `<label class="checkbox-row" style="margin:0;"><input type="checkbox" class="check-dia-semana" value="${i+1}" ${(tarea.dias_semana||[]).includes(i+1)?'checked':''}/><span style="font-size:var(--fs-xs);">${d}</span></label>`).join('')}
                </div>
              </div>
              <div id="bloque-dia-mes" style="${['mensual','quincenal'].includes(tarea.frecuencia||'') ? '' : 'display:none;'}">
                <div class="form-group"><label class="form-label">Día del mes</label><input class="form-control" type="number" id="f-dia-mes" min="1" max="31" value="${tarea.dia_mes ?? ''}" /></div>
              </div>
            </div>
          </div>
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
        <p style="font-size:var(--fs-xs); color:var(--text-tertiary); margin-top:var(--space-2);">
          Al cambiar empresa, los agentes y proyectos disponibles se actualizan.
        </p>
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

  // Toggle cronológica ↔ puntual
  $('#f-es-cronologica').addEventListener('change', () => {
    const on = $('#f-es-cronologica').checked;
    $('#bloque-fechas').style.display      = on ? 'none' : '';
    $('#bloque-cronologico').style.display = on ? ''     : 'none';
  });

  // Cambio de frecuencia → mostrar/ocultar campos extra
  $('#f-frecuencia').addEventListener('change', () => {
    const frec = $('#f-frecuencia').value;
    $('#bloque-dias-semana').style.display = frec === 'semanal'                     ? '' : 'none';
    $('#bloque-dia-mes').style.display     = ['mensual','quincenal'].includes(frec) ? '' : 'none';
  });

  // Cambio de empresa → recarga proyectos y agentes
  $('#f-empresa').addEventListener('change', async (e) => {
    await recargarEmpresa(e.target.value);
  });

  $('#form-tarea').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cambios = {
      empresa_id: $('#f-empresa').value || tareaEmpresaId,
      titulo: $('#f-titulo').value.trim(),
      descripcion: $('#f-descripcion').value.trim(),
      proyecto_id: $('#f-proyecto').value || null,
      estado: $('#f-estado').value,
      prioridad: $('#f-prioridad').value,
      etiquetas: $('#f-etiquetas').value.split(',').map((s) => s.trim()).filter(Boolean),
      tiempo_estimado_horas: $('#f-tiempo-estimado').value ? Number($('#f-tiempo-estimado').value) : null,
      tiempo_real_horas: $('#f-tiempo-real').value ? Number($('#f-tiempo-real').value) : null
    };
    const esCronologica = $('#f-es-cronologica').checked;
    cambios.es_cronologica = esCronologica;
    if (esCronologica) {
      cambios.frecuencia   = $('#f-frecuencia').value;
      cambios.fecha_inicio = null;
      cambios.fecha_cierre = null;
      if (cambios.frecuencia === 'semanal') {
        cambios.dias_semana = $$('.check-dia-semana:checked').map(c => Number(c.value));
        cambios.dia_mes     = null;
      } else if (['mensual','quincenal'].includes(cambios.frecuencia)) {
        cambios.dia_mes     = $('#f-dia-mes').value ? Number($('#f-dia-mes').value) : null;
        cambios.dias_semana = null;
      } else {
        cambios.dias_semana = null;
        cambios.dia_mes     = null;
      }
    } else {
      cambios.fecha_inicio = $('#f-fecha-inicio').value || null;
      cambios.fecha_cierre = $('#f-fecha-cierre').value || null;
      cambios.frecuencia   = null;
      cambios.dias_semana  = null;
      cambios.dia_mes      = null;
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
