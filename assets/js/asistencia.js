/**
 * asistencia.js — Módulo web de Asistencia
 * Vista admin: ver marcaciones por empresa / agente / fecha
 * Editar y agregar marcaciones retroactivas con audit log
 */
import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import { supabase } from './supabase-client.js';
import { $, escapeHTML } from './utils.js';

const TIPO_LABEL = {
  inicio_labores:  'Inicio labores',
  salida_almuerzo: 'Salida almuerzo',
  regreso_almuerzo:'Regreso almuerzo',
  break_inicio:    'Inicio break',
  break_fin:       'Fin break',
  salida_labores:  'Salida labores',
};
const TIPO_COLOR = {
  inicio_labores:  '#00cc88',
  salida_almuerzo: '#ffaa00',
  regreso_almuerzo:'#00d4ff',
  break_inicio:    '#b88cff',
  break_fin:       '#b88cff',
  salida_labores:  '#ff3366',
};

let AGENTE, EMPRESAS, EMPRESA_ID, FECHA_SEL, AGENTES = [];

async function init() {
  renderLayout('asistencia');
  const ctx = await inicializarApp();
  AGENTE = ctx.agente;
  EMPRESAS = ctx.empresas ?? [];
  EMPRESA_ID = EMPRESAS[0]?.id ?? null;
  FECHA_SEL = new Date().toISOString().slice(0,10);

  const main = document.getElementById('main-content');
  main.innerHTML = plantilla();
  await cargarAgentes();
  await cargarResumen();
  bindEvents();
}

/* ── PLANTILLA ──────────────────────────────────────────── */
function plantilla() {
  const hoy = new Date().toISOString().slice(0,10);
  return `
    <div class="page-header">
      <div>
        <h1>Asistencia</h1>
        <p class="page-header__subtitle">Control de marcaciones por empresa y fecha.</p>
      </div>
      <button class="btn btn-primary" id="btn-nueva-marcacion">+ Registrar marcación</button>
    </div>

    <!-- Filtros -->
    <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-5);align-items:center">
      <select class="form-control" id="fil-empresa" style="max-width:200px">
        ${EMPRESAS.map(e => `<option value="${e.id}">${escapeHTML(e.nombre)}</option>`).join('')}
      </select>
      <select class="form-control" id="fil-agente" style="max-width:200px">
        <option value="">Todos los agentes</option>
      </select>
      <input type="date" class="form-control" id="fil-fecha" value="${hoy}" style="max-width:160px">
      <button class="btn btn-secondary" id="btn-aplicar-filtros">Buscar</button>
    </div>

    <!-- Resumen del día -->
    <div id="resumen-dia" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:var(--space-4);margin-bottom:var(--space-5)"></div>

    <!-- Tabla de marcaciones -->
    <div class="table-wrapper">
      <table class="data-table" id="tabla-marcaciones">
        <thead><tr>
          <th>Agente</th><th>Tipo</th><th>Hora</th><th>GPS</th><th>Retro</th><th>Nota</th><th></th>
        </tr></thead>
        <tbody id="body-marcaciones">
          <tr><td colspan="7" style="text-align:center;color:var(--text-tertiary)">Selecciona empresa y fecha para ver marcaciones</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Historial ediciones (collapsible) -->
    <details style="margin-top:var(--space-5)">
      <summary style="cursor:pointer;font-weight:600;color:var(--text-secondary);padding:var(--space-3)">🕓 Historial de ediciones</summary>
      <div id="historial-ediciones" style="margin-top:var(--space-3)">
        <div class="loading-spinner"></div>
      </div>
    </details>

    <!-- Modal: nueva / editar marcación -->
    <div class="modal-overlay" id="modal-marcacion">
      <div class="modal">
        <div class="modal__header">
          <h3 id="modal-marc-titulo">Registrar marcación</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <form id="form-marcacion">
          <div class="modal__body">
            <input type="hidden" id="marc-id">
            <div class="form-group">
              <label class="form-label">Agente *</label>
              <select class="form-control" id="marc-agente" required></select>
            </div>
            <div class="form-group">
              <label class="form-label">Tipo *</label>
              <select class="form-control" id="marc-tipo" required>
                ${Object.entries(TIPO_LABEL).map(([v,l]) => `<option value="${v}">${l}</option>`).join('')}
              </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
              <div class="form-group">
                <label class="form-label">Fecha *</label>
                <input class="form-control" id="marc-fecha" type="date" required>
              </div>
              <div class="form-group">
                <label class="form-label">Hora *</label>
                <input class="form-control" id="marc-hora" type="time" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="marc-retroactivo">
                Marcación retroactiva
              </label>
            </div>
            <div class="form-group" id="marc-motivo-grp" style="display:none">
              <label class="form-label">Motivo de la edición</label>
              <textarea class="form-control" id="marc-motivo" rows="2" placeholder="Explica por qué se edita esta marcación"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Nota (opcional)</label>
              <input class="form-control" id="marc-nota" placeholder="Ej. Ingresó tarde por emergencia">
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
}

/* ── CARGA DE DATOS ────────────────────────────────────── */
async function cargarAgentes() {
  if (!EMPRESA_ID) return;
  const { data } = await supabase
    .from('agentes_empresas')
    .select('agente_id, agentes(id, nombre)')
    .eq('empresa_id', EMPRESA_ID)
    .eq('estado', 'activo');
  AGENTES = (data ?? []).map(r => r.agentes).filter(Boolean).sort((a,b) => a.nombre.localeCompare(b.nombre));

  // Poblar select del filtro y del modal
  const opts = AGENTES.map(a => `<option value="${a.id}">${escapeHTML(a.nombre)}</option>`).join('');
  const filAg = document.getElementById('fil-agente');
  if (filAg) filAg.innerHTML = '<option value="">Todos los agentes</option>' + opts;
  const marcAg = document.getElementById('marc-agente');
  if (marcAg) marcAg.innerHTML = opts;
}

async function cargarResumen() {
  if (!EMPRESA_ID) return;
  FECHA_SEL = document.getElementById('fil-fecha')?.value ?? FECHA_SEL;
  const agenteId = document.getElementById('fil-agente')?.value ?? '';

  let query = supabase
    .from('marcaciones_asistencia')
    .select('agente_id, tipo, hora, agentes(nombre)', { count: 'exact' })
    .eq('empresa_id', EMPRESA_ID)
    .eq('fecha', FECHA_SEL)
    .order('hora', { ascending: true });
  if (agenteId) query = query.eq('agente_id', agenteId);

  const { data: marcaciones } = await query;
  renderResumen(marcaciones ?? []);
  renderTabla(marcaciones ?? []);
  cargarHistorial();
}

function renderResumen(marcaciones) {
  const resumen = document.getElementById('resumen-dia');
  if (!resumen) return;

  const porAgente = {};
  for (const m of marcaciones) {
    const nombre = m.agentes?.nombre ?? m.agente_id;
    if (!porAgente[m.agente_id]) porAgente[m.agente_id] = { nombre, tipos: [] };
    porAgente[m.agente_id].tipos.push(m.tipo);
  }

  const cards = Object.values(porAgente).map(ag => {
    const tieneSalida = ag.tipos.includes('salida_labores');
    const tieneInicio = ag.tipos.includes('inicio_labores');
    const estado = !tieneInicio ? '⚪ Sin marcar' : tieneSalida ? '✅ Completo' : '🟡 En curso';
    const color = !tieneInicio ? 'var(--text-tertiary)' : tieneSalida ? 'var(--color-success)' : 'var(--color-warning)';
    return `
      <div class="card" style="padding:var(--space-4);border-top:3px solid ${color}">
        <div style="font-weight:700;font-size:var(--fs-sm);margin-bottom:4px">${escapeHTML(ag.nombre.split(' ')[0])}</div>
        <div style="font-size:var(--fs-xs);color:${color}">${estado}</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">${ag.tipos.length} marcación${ag.tipos.length!==1?'es':''}</div>
      </div>`;
  });

  // Agentes sin ninguna marcación
  const conMarcacion = new Set(Object.keys(porAgente));
  AGENTES.forEach(a => {
    if (!conMarcacion.has(a.id)) {
      cards.push(`
        <div class="card" style="padding:var(--space-4);border-top:3px solid var(--text-tertiary);opacity:.6">
          <div style="font-weight:700;font-size:var(--fs-sm);margin-bottom:4px">${escapeHTML(a.nombre.split(' ')[0])}</div>
          <div style="font-size:var(--fs-xs);color:var(--text-tertiary)">⚪ Sin marcar</div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">0 marcaciones</div>
        </div>`);
    }
  });

  resumen.innerHTML = cards.join('') || '<p style="color:var(--text-tertiary)">Sin datos para esta fecha.</p>';
}

function renderTabla(marcaciones) {
  const tbody = document.getElementById('body-marcaciones');
  if (!tbody) return;
  if (!marcaciones.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-tertiary)">Sin marcaciones para esta fecha</td></tr>';
    return;
  }
  tbody.innerHTML = marcaciones.map(m => `
    <tr>
      <td><strong>${escapeHTML(m.agentes?.nombre ?? '—')}</strong></td>
      <td>
        <span style="font-size:var(--fs-xs);font-weight:700;color:${TIPO_COLOR[m.tipo]};padding:2px 8px;border-radius:4px;background:${TIPO_COLOR[m.tipo]}22">
          ${TIPO_LABEL[m.tipo]}
        </span>
      </td>
      <td style="font-size:var(--fs-base);font-weight:700">${m.hora?.slice(0,5) ?? '—'}</td>
      <td style="font-size:var(--fs-xs);color:var(--text-tertiary)">${m.lat != null ? `${Number(m.lat).toFixed(4)}, ${Number(m.lng).toFixed(4)}` : '—'}</td>
      <td style="text-align:center">${m.retroactivo ? '<span style="color:var(--color-warning);font-size:var(--fs-xs);font-weight:700">RETRO</span>' : '—'}</td>
      <td style="font-size:var(--fs-sm);color:var(--text-tertiary)">${escapeHTML(m.nota ?? '—')}</td>
      <td>
        <button class="btn btn-sm btn-secondary" data-editar-marc='${JSON.stringify({id:m.id,agente_id:m.agente_id,tipo:m.tipo,fecha:m.fecha,hora:m.hora?.slice(0,5),nota:m.nota??'',retroactivo:m.retroactivo})}'>Editar</button>
        <button class="btn btn-sm btn-danger" data-eliminar-marc="${m.id}" style="margin-left:4px">✕</button>
      </td>
    </tr>`).join('');
}

async function cargarHistorial() {
  const cont = document.getElementById('historial-ediciones');
  if (!cont) return;
  const { data } = await supabase
    .from('historial_asistencia')
    .select(`campo_modificado, valor_antiguo, valor_nuevo, motivo, created_at,
             agentes_editor:agente_editor_id(nombre),
             marcaciones_asistencia(tipo, fecha, hora, agentes(nombre))`)
    .order('created_at', { ascending: false })
    .limit(30);

  if (!data?.length) {
    cont.innerHTML = '<p style="color:var(--text-tertiary);padding:var(--space-3)">Sin ediciones registradas.</p>';
    return;
  }
  cont.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table" style="font-size:var(--fs-sm)">
        <thead><tr><th>Agente</th><th>Marcación</th><th>Campo</th><th>Antes</th><th>Después</th><th>Motivo</th><th>Cuándo</th></tr></thead>
        <tbody>
          ${data.map(h => `<tr>
            <td>${escapeHTML(h.agentes_editor?.nombre ?? '—')}</td>
            <td>${escapeHTML(h.marcaciones_asistencia?.agentes?.nombre ?? '—')} · ${TIPO_LABEL[h.marcaciones_asistencia?.tipo] ?? h.marcaciones_asistencia?.tipo ?? '—'}</td>
            <td>${escapeHTML(h.campo_modificado)}</td>
            <td style="color:var(--color-danger)">${escapeHTML(h.valor_antiguo ?? '—')}</td>
            <td style="color:var(--color-success)">${escapeHTML(h.valor_nuevo ?? '—')}</td>
            <td style="color:var(--text-tertiary)">${escapeHTML(h.motivo ?? '—')}</td>
            <td style="color:var(--text-tertiary)">${new Date(h.created_at).toLocaleString('es-PE')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ── EVENTOS ───────────────────────────────────────────── */
function bindEvents() {
  // Filtros
  document.getElementById('btn-aplicar-filtros')?.addEventListener('click', async () => {
    const nuevaEmp = document.getElementById('fil-empresa')?.value;
    if (nuevaEmp !== EMPRESA_ID) {
      EMPRESA_ID = nuevaEmp;
      await cargarAgentes();
    }
    await cargarResumen();
  });

  document.getElementById('fil-empresa')?.addEventListener('change', async () => {
    EMPRESA_ID = document.getElementById('fil-empresa').value;
    await cargarAgentes();
  });

  // Mostrar/ocultar campo motivo cuando es edición (id presente)
  document.getElementById('marc-id')?.addEventListener('change', (e) => {
    document.getElementById('marc-motivo-grp').style.display = e.target.value ? '' : 'none';
  });

  // Nueva marcación
  document.getElementById('btn-nueva-marcacion')?.addEventListener('click', () => {
    document.getElementById('marc-id').value = '';
    document.getElementById('form-marcacion').reset();
    document.getElementById('marc-fecha').value = FECHA_SEL;
    document.getElementById('marc-hora').value = new Date().toTimeString().slice(0,5);
    document.getElementById('marc-motivo-grp').style.display = 'none';
    document.getElementById('modal-marc-titulo').textContent = 'Registrar marcación';
    abrirModal('modal-marcacion');
  });

  // Click en tabla: editar / eliminar
  document.getElementById('tabla-marcaciones')?.addEventListener('click', async (e) => {
    const editarBtn = e.target.closest('[data-editar-marc]');
    if (editarBtn) {
      const d = JSON.parse(editarBtn.dataset.editarMarc);
      document.getElementById('marc-id').value = d.id;
      document.getElementById('marc-agente').value = d.agente_id;
      document.getElementById('marc-tipo').value = d.tipo;
      document.getElementById('marc-fecha').value = d.fecha;
      document.getElementById('marc-hora').value = d.hora;
      document.getElementById('marc-nota').value = d.nota;
      document.getElementById('marc-retroactivo').checked = d.retroactivo;
      document.getElementById('marc-motivo-grp').style.display = '';
      document.getElementById('modal-marc-titulo').textContent = 'Editar marcación';
      abrirModal('modal-marcacion');
    }
    const eliminarBtn = e.target.closest('[data-eliminar-marc]');
    if (eliminarBtn) {
      if (!await confirmar('¿Eliminar esta marcación? Se registrará en el historial.')) return;
      const id = eliminarBtn.dataset.eliminarMarc;
      // Log de eliminación en historial
      await supabase.from('historial_asistencia').insert({
        marcacion_id: id,
        agente_editor_id: AGENTE.id,
        campo_modificado: 'eliminado',
        valor_antiguo: 'existia',
        valor_nuevo: null,
        motivo: 'Eliminado por admin',
      });
      await supabase.from('marcaciones_asistencia').delete().eq('id', id);
      toastExito('Marcación eliminada');
      await cargarResumen();
    }
  });

  // Guardar marcación
  document.getElementById('form-marcacion')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('marc-id').value;
    const payload = {
      agente_id: document.getElementById('marc-agente').value,
      empresa_id: EMPRESA_ID,
      tipo: document.getElementById('marc-tipo').value,
      fecha: document.getElementById('marc-fecha').value,
      hora: document.getElementById('marc-hora').value + ':00',
      timestamp_exacto: new Date().toISOString(),
      retroactivo: document.getElementById('marc-retroactivo').checked,
      nota: document.getElementById('marc-nota').value || null,
    };

    if (id) {
      // Obtener valor anterior para historial
      const { data: prev } = await supabase.from('marcaciones_asistencia').select('hora,tipo').eq('id', id).single();
      await supabase.from('marcaciones_asistencia').update(payload).eq('id', id);
      // Registrar en historial
      const motivo = document.getElementById('marc-motivo').value || null;
      if (prev?.hora !== payload.hora) {
        await supabase.from('historial_asistencia').insert({
          marcacion_id: id, agente_editor_id: AGENTE.id,
          campo_modificado: 'hora', valor_antiguo: prev?.hora, valor_nuevo: payload.hora, motivo,
        });
      }
      if (prev?.tipo !== payload.tipo) {
        await supabase.from('historial_asistencia').insert({
          marcacion_id: id, agente_editor_id: AGENTE.id,
          campo_modificado: 'tipo', valor_antiguo: prev?.tipo, valor_nuevo: payload.tipo, motivo,
        });
      }
    } else {
      const { error } = await supabase.from('marcaciones_asistencia').insert(payload);
      if (error) { toastError('Error al guardar'); return; }
    }
    toastExito('Marcación guardada');
    cerrarModal('modal-marcacion');
    await cargarResumen();
  });

  // Mostrar historial al abrir el details
  document.querySelector('details')?.addEventListener('toggle', (e) => {
    if (e.target.open) cargarHistorial();
  });
}

init();
