/**
 * ============================================================================
 * ZV TASK MANAGER · LAYOUT (sidebar + topbar reutilizables)
 * Se inyecta en cada página protegida para evitar duplicar markup.
 * Uso: renderLayout('tareas') al inicio del <script type="module"> de la página.
 * ============================================================================
 */
import { CONFIG } from './config.js';

const NAV = [
  { seccion: 'General', links: [
    { id: 'dashboard', href: '../index.html', icon: '🏠', label: 'Dashboard' },
    { id: 'pendientes', href: 'pendientes.html', icon: '✅', label: 'Mis pendientes' },
    { id: 'calendario', href: 'calendario.html', icon: '📅', label: 'Calendario' },
    { id: 'notificaciones', href: 'notificaciones.html', icon: '🔔', label: 'Notificaciones' }
  ]},
  { seccion: 'Organización', links: [
    { id: 'empresas', href: 'empresas.html', icon: '🏢', label: 'Empresas' },
    { id: 'departamentos', href: 'departamentos.html', icon: '🗂️', label: 'Departamentos' },
    { id: 'proyectos', href: 'proyectos.html', icon: '📁', label: 'Proyectos' },
    { id: 'tareas', href: 'tareas.html', icon: '📋', label: 'Tareas' },
    { id: 'recordatorios', href: 'recordatorios.html', icon: '⏰', label: 'Recordatorios' }
  ]},
  { seccion: 'Gestión', links: [
    { id: 'reportes', href: 'reportes.html', icon: '📊', label: 'Reportes' },
    { id: 'configuracion', href: 'configuracion.html', icon: '⚙️', label: 'Configuración' }
  ]}
];

function rutaDesde(activeId, href) {
  // index.html vive en la raíz; el resto vive en /pages
  if (activeId === 'dashboard') {
    if (href === '../index.html') return './';   // Ya estamos en la raíz
    return 'pages/' + href;                      // Prefijo necesario desde raíz
  }
  return href; // Desde /pages/ los hrefs ya son correctos
}

export function renderLayout(activeId, { mostrarBuscador = true } = {}) {
  const root = document.getElementById('layout-root');
  if (!root) return;

  const navHTML = NAV.map((grupo) => `
    <div class="sidebar__section-title">${grupo.seccion}</div>
    ${grupo.links.map((l) => `
      <a href="${rutaDesde(activeId, l.href)}" class="sidebar__link ${l.id === activeId ? 'active' : ''}" data-nav-id="${l.id}">
        <span class="icon" aria-hidden="true">${l.icon}</span>
        <span>${l.label}</span>
      </a>`).join('')}
  `).join('');

  root.innerHTML = `
    <div class="sidebar-backdrop"></div>
    <aside class="sidebar" aria-label="Navegación principal">
      <div class="sidebar__brand">
        <img src="${activeId === 'dashboard' ? 'assets/images/logo.png' : '../assets/images/logo.png'}" alt="Logo ZV Task Manager" width="34" height="34" />
        <span>${CONFIG.APP_NAME}</span>
      </div>
      <nav class="sidebar__nav">${navHTML}</nav>
      <div class="sidebar__footer">
        <button class="btn btn-tertiary btn-block" data-action="logout">🚪 Cerrar sesión</button>
      </div>
    </aside>
    <div>
      <header class="topbar">
        <button class="btn btn-icon btn-hamburger" aria-label="Abrir menú">☰</button>
        <div class="topbar__search" ${mostrarBuscador ? '' : 'style="visibility:hidden"'}>
          <input type="search" class="form-control" placeholder="Buscar tareas, proyectos…" data-global-search aria-label="Buscar" />
        </div>
        <div class="topbar__actions">
          <select class="form-control" data-empresa-select style="min-width:160px;" aria-label="Empresa activa"></select>
          <button class="btn btn-icon" data-action="toggle-tema" aria-label="Cambiar tema">🌓</button>
          <div class="dropdown">
            <button class="btn btn-icon bell-badge" data-notif-bell aria-label="Notificaciones">
              🔔<span class="bell-badge__count" style="display:none;">0</span>
            </button>
            <div class="dropdown__menu" data-notif-menu style="width:320px; max-height:400px; overflow-y:auto;"></div>
          </div>
          <div class="dropdown">
            <button class="avatar" data-action="toggle-user-menu" aria-label="Menú de usuario">
              <img data-user-photo style="display:none;" alt="" />
              <span data-user-initials>--</span>
            </button>
          </div>
        </div>
      </header>
      <main class="main-content" id="main-content"></main>
    </div>
  `;

  const avatarBtn = root.querySelector('[data-action="toggle-user-menu"]');
  avatarBtn?.querySelector('[data-user-photo]')?.addEventListener('load', (e) => { e.target.style.display = 'block'; e.target.previousElementSibling?.style?.setProperty('display', 'none'); });
}
