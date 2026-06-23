import { renderLayout } from './layout.js';
import { inicializarApp, toastExito } from './main.js';
import { listarNotificaciones, marcarNotificacionLeida, marcarTodasLeidas } from './supabase-data.js';
import { $, $$, escapeHTML, formatearFechaHora } from './utils.js';

const ICONOS = {
  tarea_asignada: '📌', tarea_comentada: '💬', vencimiento: '⏰', completada: '✅',
  recordatorio_hoy: '🔁', mencion: '📣', invitacion_empresa: '🏢', cambio_estado: '🔄'
};

let PAGINA = 0;

function plantilla() {
  return `
    <div class="page-header">
      <div><h1>Notificaciones</h1><p class="page-header__subtitle">Historial de eventos relevantes para ti.</p></div>
      <button class="btn btn-secondary" id="btn-marcar-todas">Marcar todas como leídas</button>
    </div>
    <div id="lista-notificaciones"><div class="loading-spinner"></div></div>
    <div class="pagination" id="paginacion"></div>
  `;
}

async function cargar(agenteId) {
  const { data, total } = await listarNotificaciones(agenteId, PAGINA, 30);
  $('#lista-notificaciones').innerHTML = data.length
    ? data.map((n) => `
      <div class="card ${n.leida ? '' : 'card-clickable'}" data-id="${n.id}" style="display:flex; gap:var(--space-3); margin-bottom:var(--space-3); ${n.leida ? 'opacity:.6' : ''} border-left:3px solid ${n.leida ? 'var(--border-strong)' : 'var(--color-accent)'};">
        <div style="font-size:1.5rem;">${ICONOS[n.tipo] || '🔔'}</div>
        <div style="flex:1;">
          <div style="font-weight:600;">${escapeHTML(n.titulo)}</div>
          <div style="font-size:var(--fs-sm); color:var(--text-secondary);">${escapeHTML(n.mensaje)}</div>
          <div style="font-size:var(--fs-xs); color:var(--text-tertiary); margin-top:var(--space-1);">${formatearFechaHora(n.created_at)}</div>
        </div>
        ${!n.leida ? '<span class="badge badge-prioridad-normal">Nueva</span>' : ''}
      </div>`).join('')
    : '<div class="empty-state"><div class="empty-state__icon">🔔</div><h3>Sin notificaciones</h3></div>';

  $$('[data-id]').forEach((card) => card.addEventListener('click', async () => {
    await marcarNotificacionLeida(card.dataset.id);
    cargar(agenteId);
  }));

  const totalPaginas = Math.max(1, Math.ceil(total / 30));
  $('#paginacion').innerHTML = `
    <span style="color:var(--text-tertiary); font-size:var(--fs-sm);">${total} notificación(es) · página ${PAGINA + 1} de ${totalPaginas}</span>
    <div class="pagination__pages">
      <button class="btn btn-secondary btn-sm" id="btn-prev" ${PAGINA === 0 ? 'disabled' : ''}>← Anterior</button>
      <button class="btn btn-secondary btn-sm" id="btn-next" ${PAGINA >= totalPaginas - 1 ? 'disabled' : ''}>Siguiente →</button>
    </div>`;
  $('#btn-prev')?.addEventListener('click', () => { PAGINA--; cargar(agenteId); });
  $('#btn-next')?.addEventListener('click', () => { PAGINA++; cargar(agenteId); });
}

async function init() {
  renderLayout('notificaciones');
  const ctx = await inicializarApp();
  if (!ctx) return;
  document.getElementById('main-content').innerHTML = plantilla();
  $('#btn-marcar-todas').addEventListener('click', async () => { await marcarTodasLeidas(ctx.agente.id); toastExito('Todas marcadas como leídas.'); cargar(ctx.agente.id); });
  await cargar(ctx.agente.id);
}

init();
