/**
 * ============================================================================
 * ZV TASK MANAGER · UTILIDADES
 * ============================================================================
 */

/** Formatea fecha ISO a "dd MMM yyyy" en español */
export function formatearFecha(iso, opts = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', ...opts });
}

export function formatearFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatearHora(time) {
  if (!time) return '';
  const [h, m] = time.split(':');
  const d = new Date();
  d.setHours(+h, +m);
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

export function tiempoRelativo(iso) {
  if (!iso) return '—';
  const ahora = new Date();
  const fecha = new Date(iso);
  const diffMs = fecha - ahora;
  const diffMin = Math.round(diffMs / 60000);
  const diffH = Math.round(diffMs / 3600000);
  const diffD = Math.round(diffMs / 86400000);
  if (Math.abs(diffMin) < 60) return diffMin === 0 ? 'ahora' : (diffMin > 0 ? `en ${diffMin} min` : `hace ${-diffMin} min`);
  if (Math.abs(diffH) < 24) return diffH > 0 ? `en ${diffH} h` : `hace ${-diffH} h`;
  return diffD > 0 ? `en ${diffD} días` : `hace ${-diffD} días`;
}

export function esVencida(fechaCierre, estado) {
  if (!fechaCierre || estado === 'completado' || estado === 'archivado') return false;
  return new Date(fechaCierre) < new Date();
}

export function iniciales(nombre = '') {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

/** Escapa HTML para prevenir XSS al insertar texto de usuario */
export function escapeHTML(str = '') {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function generarColorDesdeTexto(texto = '') {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = (hash << 5) - hash + texto.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

export function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function $(selector, scope = document) { return scope.querySelector(selector); }
export function $$(selector, scope = document) { return Array.from(scope.querySelectorAll(selector)); }

export function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/** Cache local simple con TTL, respaldado en localStorage */
export const cacheLocal = {
  set(key, value, ttlMs) {
    const payload = { value, expires: Date.now() + ttlMs };
    try { localStorage.setItem(key, JSON.stringify(payload)); } catch (_) { /* storage lleno o bloqueado */ }
  },
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { value, expires } = JSON.parse(raw);
      if (Date.now() > expires) { localStorage.removeItem(key); return null; }
      return value;
    } catch (_) { return null; }
  },
  clear(key) { try { localStorage.removeItem(key); } catch (_) {} }
};

export function descargarCSV(filename, rows) {
  if (!rows || !rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const COLORES_PRIORIDAD = {
  critica: 'var(--prioridad-critica)',
  alta: 'var(--prioridad-alta)',
  normal: 'var(--prioridad-normal)',
  baja: 'var(--prioridad-baja)'
};

export const COLORES_ESTADO = {
  nuevo: 'var(--estado-nuevo)',
  en_progreso: 'var(--estado-en-progreso)',
  en_revision: 'var(--estado-en-revision)',
  completado: 'var(--estado-completado)',
  archivado: 'var(--estado-archivado)'
};

export const ETIQUETAS_ESTADO = {
  nuevo: 'Nuevo',
  en_progreso: 'En progreso',
  en_revision: 'En revisión',
  completado: 'Completado',
  archivado: 'Archivado'
};

export const ETIQUETAS_PRIORIDAD = {
  critica: 'Crítica',
  alta: 'Alta',
  normal: 'Normal',
  baja: 'Baja'
};

/**
 * Crea un dropdown de selección múltiple reutilizable.
 *
 * @param {object} config
 * @param {string}   config.placeholder  Texto del botón cuando no hay selección
 * @param {Array}    config.options       [{value, label}] opciones iniciales
 * @param {Function} config.onChange      Callback(selectedValues: string[]) al cambiar selección
 *
 * @returns {{ el: HTMLElement, getSelected(): string[], setOptions(opts): void, setSelected(vals): void, clear(): void }}
 */
export function crearMultiSelect({ placeholder = 'Seleccionar', options = [], onChange } = {}) {
  const selected = new Set();

  /* ── Estructura DOM ── */
  const wrap = document.createElement('div');
  wrap.className = 'multiselect';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary btn-sm multiselect__btn';

  const menu = document.createElement('div');
  menu.className = 'multiselect__menu';

  wrap.append(btn, menu);

  /* ── Helpers ── */
  function updateBtn() {
    btn.textContent = selected.size
      ? `${placeholder} (${selected.size}) ▾`
      : `${placeholder} ▾`;
  }

  function buildMenu(opts) {
    menu.innerHTML = '';

    if (opts.length) {
      const hdr = document.createElement('div');
      hdr.className = 'multiselect__header';
      const title = document.createElement('span');
      title.style.cssText = 'font-size:var(--fs-xs); color:var(--text-tertiary); font-weight:600;';
      title.textContent = placeholder.toUpperCase();
      const clearBtn = document.createElement('button');
      clearBtn.className = 'multiselect__clear';
      clearBtn.type = 'button';
      clearBtn.textContent = 'Limpiar';
      clearBtn.addEventListener('click', (e) => { e.stopPropagation(); clearAll(); });
      hdr.append(title, clearBtn);
      menu.appendChild(hdr);
    } else {
      const empty = document.createElement('div');
      empty.className = 'multiselect__empty';
      empty.textContent = 'Sin opciones disponibles';
      menu.appendChild(empty);
      return;
    }

    opts.forEach(({ value, label }) => {
      const item = document.createElement('label');
      item.className = 'multiselect__item';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.value = value;
      chk.checked = selected.has(value);
      chk.addEventListener('change', () => {
        chk.checked ? selected.add(value) : selected.delete(value);
        updateBtn();
        onChange?.([...selected]);
      });

      const lbl = document.createElement('span');
      lbl.textContent = label;

      item.append(chk, lbl);
      menu.appendChild(item);
    });
  }

  function clearAll() {
    selected.clear();
    updateBtn();
    buildMenu(currentOptions);
    onChange?.([]);
  }

  let currentOptions = options;

  /* ── Toggle menu ── */
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Cierra otros multiselects abiertos
    document.querySelectorAll('.multiselect__menu.open').forEach((m) => {
      if (m !== menu) m.classList.remove('open');
    });
    menu.classList.toggle('open');
  });

  document.addEventListener('click', () => menu.classList.remove('open'));

  /* ── Init ── */
  updateBtn();
  buildMenu(options);

  return {
    el: wrap,
    getSelected: () => [...selected],
    setOptions(opts) {
      currentOptions = opts;
      // Mantener selección válida
      for (const v of selected) {
        if (!opts.find((o) => o.value === v)) selected.delete(v);
      }
      updateBtn();
      buildMenu(opts);
      onChange?.([...selected]);
    },
    setSelected(vals = []) {
      selected.clear();
      vals.forEach((v) => selected.add(v));
      updateBtn();
      buildMenu(currentOptions);
      // Sin llamar a onChange para evitar disparo en init
    },
    clear: clearAll
  };
}
