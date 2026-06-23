/**
 * ============================================================================
 * ZV TASK MANAGER · LÓGICA GLOBAL (UI LAYER)
 * Se importa en todas las páginas protegidas. Maneja shell, toasts, modales,
 * tema, sidebar responsive y campana de notificaciones.
 * ============================================================================
 */
import { CONFIG } from './config.js';
import { protegerPagina, obtenerAgenteActual, cerrarSesion } from './auth.js';
import { obtenerEmpresasDelAgente, contarNotificacionesNoLeidas, suscribirseANotificaciones, listarNotificaciones, marcarNotificacionLeida } from './supabase-data.js';
import { cacheLocal, iniciales, tiempoRelativo, escapeHTML } from './utils.js';

/* ============================================================================
   TOASTS
   ============================================================================ */

function getToastContainer() {
  let el = document.querySelector('.toast-container');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast-container';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

export function mostrarToast(mensaje, { titulo = '', tipo = 'info', duracion = 4000 } = {}) {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.innerHTML = `
    <div>
      ${titulo ? `<div class="toast__title">${escapeHTML(titulo)}</div>` : ''}
      <div class="toast__message">${escapeHTML(mensaje)}</div>
    </div>
    <button class="toast__close" aria-label="Cerrar notificación">✕</button>
  `;
  toast.querySelector('.toast__close').addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  if (duracion) setTimeout(() => toast.remove(), duracion);
  return toast;
}

export const toastExito = (msg, titulo = 'Éxito') => mostrarToast(msg, { titulo, tipo: 'success' });
export const toastError = (msg, titulo = 'Error') => mostrarToast(msg, { titulo, tipo: 'error' });
export const toastInfo = (msg, titulo = '') => mostrarToast(msg, { titulo, tipo: 'info' });

/* ============================================================================
   MODALES
   ============================================================================ */

export function abrirModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function cerrarModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

export function confirmar({ titulo = '¿Confirmar acción?', mensaje, textoConfirmar = 'Confirmar', peligro = false }) {
  return new Promise((resolve) => {
    let overlay = document.getElementById('modal-confirm-global');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-confirm-global';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="modal" role="alertdialog" aria-modal="true">
        <div class="modal__header"><h3>${escapeHTML(titulo)}</h3></div>
        <div class="modal__body"><p>${escapeHTML(mensaje || '')}</p></div>
        <div class="modal__footer">
          <button class="btn btn-secondary" data-action="cancelar">Cancelar</button>
          <button class="btn ${peligro ? 'btn-danger' : 'btn-primary'}" data-action="confirmar">${escapeHTML(textoConfirmar)}</button>
        </div>
      </div>`;
    overlay.classList.add('open');
    const limpiar = (valor) => {
      overlay.classList.remove('open');
      resolve(valor);
    };
    overlay.querySelector('[data-action="cancelar"]').onclick = () => limpiar(false);
    overlay.querySelector('[data-action="confirmar"]').onclick = () => limpiar(true);
    overlay.onclick = (e) => { if (e.target === overlay) limpiar(false); };
  });
}

// Cerrar modales al hacer click fuera o tecla Escape
document.addEventListener('click', (e) => {
  if (e.target.classList?.contains('modal-overlay')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach((m) => m.classList.remove('open'));
    document.querySelectorAll('.side-panel.open').forEach((p) => p.classList.remove('open'));
    document.querySelectorAll('.side-panel-overlay.open').forEach((p) => p.classList.remove('open'));
  }
});

/* ============================================================================
   TEMA (dark/light)
   ============================================================================ */

export function aplicarTemaGuardado() {
  const tema = cacheLocal.get(CONFIG.STORAGE_KEYS.TEMA) || 'dark';
  document.documentElement.setAttribute('data-theme', tema);
}

export function alternarTema() {
  const actual = document.documentElement.getAttribute('data-theme') || 'dark';
  const nuevo = actual === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nuevo);
  cacheLocal.set(CONFIG.STORAGE_KEYS.TEMA, nuevo, 365 * 24 * 60 * 60 * 1000);
}

/* ============================================================================
   SIDEBAR RESPONSIVE
   ============================================================================ */

export function inicializarSidebarResponsive() {
  const sidebar = document.querySelector('.sidebar');
  const hamburger = document.querySelector('.btn-hamburger');
  const backdrop = document.querySelector('.sidebar-backdrop');
  if (!sidebar || !hamburger) return;

  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    backdrop?.classList.toggle('open');
  });
  backdrop?.addEventListener('click', () => {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
  });
}

export function marcarLinkActivo() {
  const pagina = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar__link').forEach((link) => {
    const href = link.getAttribute('href')?.split('/').pop();
    link.classList.toggle('active', href === pagina);
  });
}

/* ============================================================================
   CAMPANA DE NOTIFICACIONES
   ============================================================================ */

export async function inicializarCampanaNotificaciones(agenteId) {
  const bell = document.querySelector('[data-notif-bell]');
  if (!bell) return;
  const countEl = bell.querySelector('.bell-badge__count');
  const menu = document.querySelector('[data-notif-menu]');

  async function refrescarContador() {
    const n = await contarNotificacionesNoLeidas(agenteId);
    if (countEl) {
      countEl.textContent = n > 9 ? '9+' : n;
      countEl.style.display = n > 0 ? 'flex' : 'none';
    }
  }

  async function refrescarLista() {
    if (!menu) return;
    const { data } = await listarNotificaciones(agenteId, 0, 8);
    menu.innerHTML = data.length
      ? data.map((n) => `
          <div class="dropdown__item" data-notif-id="${n.id}" style="align-items:flex-start; cursor:pointer; ${n.leida ? 'opacity:.6' : ''}">
            <div>
              <div style="font-weight:600; font-size:var(--fs-xs); color:var(--text-primary);">${escapeHTML(n.titulo)}</div>
              <div style="font-size:var(--fs-xs); color:var(--text-tertiary);">${escapeHTML(n.mensaje)}</div>
              <div style="font-size:10px; color:var(--text-tertiary); margin-top:2px;">${tiempoRelativo(n.created_at)}</div>
            </div>
          </div>`).join('')
      : '<div class="empty-state" style="padding:var(--space-4);">Sin notificaciones</div>';

    menu.querySelectorAll('[data-notif-id]').forEach((item) => {
      item.addEventListener('click', async () => {
        await marcarNotificacionLeida(item.dataset.notifId);
        await refrescarContador();
        await refrescarLista();
      });
    });
  }

  bell.addEventListener('click', async (e) => {
    e.stopPropagation();
    menu?.classList.toggle('open');
    if (menu?.classList.contains('open')) await refrescarLista();
  });
  document.addEventListener('click', () => menu?.classList.remove('open'));

  await refrescarContador();
  suscribirseANotificaciones(agenteId, async () => {
    await refrescarContador();
    mostrarToast('Tienes una nueva notificación', { titulo: '🔔 Notificación', tipo: 'info' });
  });
}

/* ============================================================================
   SELECTOR DE EMPRESA ACTIVA
   ============================================================================ */

export async function inicializarSelectorEmpresa(agenteId) {
  const select = document.querySelector('[data-empresa-select]');
  if (!select) return null;

  const empresas = await obtenerEmpresasDelAgente(agenteId);
  select.innerHTML = empresas.map((e) => `<option value="${e.id}">${escapeHTML(e.nombre)}</option>`).join('');

  let activa = cacheLocal.get(CONFIG.STORAGE_KEYS.EMPRESA_ACTIVA);
  if (!activa || !empresas.find((e) => e.id === activa)) {
    activa = empresas[0]?.id;
  }
  if (activa) {
    select.value = activa;
    cacheLocal.set(CONFIG.STORAGE_KEYS.EMPRESA_ACTIVA, activa, CONFIG.CACHE_TTL_EMPRESA);
  }

  select.addEventListener('change', () => {
    cacheLocal.set(CONFIG.STORAGE_KEYS.EMPRESA_ACTIVA, select.value, CONFIG.CACHE_TTL_EMPRESA);
    window.location.reload();
  });

  return activa;
}

export function obtenerEmpresaActivaId() {
  return cacheLocal.get(CONFIG.STORAGE_KEYS.EMPRESA_ACTIVA);
}

/* ============================================================================
   BOOTSTRAP DE PÁGINA PROTEGIDA
   Llamar en cada página del sistema (excepto login/registro):
   const { agente, empresaId } = await inicializarApp();
   ============================================================================ */

export async function inicializarApp() {
  aplicarTemaGuardado();
  const sesion = await protegerPagina();
  if (!sesion) return null;

  const agente = await obtenerAgenteActual();
  if (!agente) {
    await cerrarSesion();
    return null;
  }

  document.querySelectorAll('[data-user-name]').forEach((el) => (el.textContent = agente.nombre));
  document.querySelectorAll('[data-user-initials]').forEach((el) => (el.textContent = iniciales(agente.nombre)));
  document.querySelectorAll('[data-user-photo]').forEach((el) => { if (agente.foto_url) el.src = agente.foto_url; });

  inicializarSidebarResponsive();
  marcarLinkActivo();

  let empresaId = null;
  try {
    empresaId = await inicializarSelectorEmpresa(agente.id);
  } catch (err) {
    console.error('[main] Error inicializando selector de empresa:', err.message);
  }
  await inicializarCampanaNotificaciones(agente.id);

  document.querySelectorAll('[data-action="logout"]').forEach((btn) => btn.addEventListener('click', cerrarSesion));
  document.querySelectorAll('[data-action="toggle-tema"]').forEach((btn) => btn.addEventListener('click', alternarTema));

  return { agente, empresaId };
}
