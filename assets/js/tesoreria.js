/**
 * tesoreria.js — Módulo de Tesorería
 * Tabs: Cajas · Movimientos · Facturas
 *
 * Flujo cajas chicas: ingreso/egreso actualiza saldo automáticamente (trigger DB).
 * Conversión PEN↔USD: sale de caja origen, entra a caja destino con tipo de cambio.
 * Facturas: gastos con comprobante pendientes de reembolso a caja.
 */
import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import { supabase } from './supabase-client.js';
import { $, escapeHTML } from './utils.js';

const TABS_TES = ['cajas', 'movimientos', 'facturas'];
let AGENTE, EMPRESAS, EMPRESA_ID, CAJAS = [], TAB_CARGADO = {};

/* ── BOOTSTRAP ─────────────────────────────────────────── */
async function init() {
  renderLayout('tesoreria');
  const ctx = await inicializarApp();
  AGENTE = ctx.agente;
  EMPRESAS = ctx.empresas ?? [];
  EMPRESA_ID = EMPRESAS[0]?.id ?? null;

  document.getElementById('main-content').innerHTML = plantilla();
  bindTabs();
  await cargarTab(hashTab());
  window.addEventListener('hashchange', () => cargarTab(hashTab()));
}

function hashTab() {
  const h = location.hash.replace('#','');
  return TABS_TES.includes(h) ? h : 'cajas';
}

function plantilla() {
  return `
    <div class="page-header" style="margin-bottom:0">
      <div><h1>Tesorería</h1></div>
      <div style="display:flex;gap:var(--space-3);align-items:center">
        <select class="form-control" id="tes-empresa-sel" style="max-width:200px">
          ${EMPRESAS.map(e => `<option value="${e.id}">${escapeHTML(e.nombre)}</option>`).join('')}
        </select>
        <div id="tes-header-action"></div>
      </div>
    </div>
    <nav style="display:flex;gap:4px;border-bottom:1px solid var(--border-subtle);margin-bottom:var(--space-5);padding-top:var(--space-4)">
      ${TABS_TES.map(t => `
        <a href="#${t}" class="tes-tab" data-tab="${t}"
           style="padding:8px 18px;border-radius:8px 8px 0 0;font-size:var(--fs-sm);font-weight:600;color:var(--text-tertiary);text-decoration:none;border:1px solid transparent;border-bottom:none;transition:all .15s">
          ${{cajas:'Cajas chicas',movimientos:'Movimientos',facturas:'Facturas'}[t]}
        </a>`).join('')}
    </nav>
    <div id="tes-content"></div>
  `;
}

function bindTabs() {
  document.addEventListener('click', e => {
    const a = e.target.closest('.tes-tab');
    if (!a) return;
    e.preventDefault();
    location.hash = a.dataset.tab;
  });
  document.getElementById('tes-empresa-sel')?.addEventListener('change', e => {
    EMPRESA_ID = e.target.value;
    CAJAS = [];
    TAB_CARGADO = {};
    cargarTab(hashTab());
  });
}

function activarTab(tab) {
  document.querySelectorAll('.tes-tab').forEach(el => {
    const ok = el.dataset.tab === tab;
    el.style.color = ok ? 'var(--color-accent)' : 'var(--text-tertiary)';
    el.style.backgroundColor = ok ? 'var(--bg-surface)' : 'transparent';
    el.style.borderColor = ok ? 'var(--border-subtle)' : 'transparent';
  });
}

async function cargarTab(tab) {
  activarTab(tab);
  const el = document.getElementById('tes-content');
  const hdr = document.getElementById('tes-header-action');
  if (!el) return;
  if (TAB_CARGADO[tab]) return;
  el.innerHTML = '<div class="loading-spinner"></div>';
  hdr.innerHTML = '';
  // Siempre refrescar cajas
  await cargarCajas();
  switch(tab) {
    case 'cajas':       await renderCajas(el, hdr);       break;
    case 'movimientos': await renderMovimientos(el, hdr);  break;
    case 'facturas':    await renderFacturas(el, hdr);     break;
  }
  TAB_CARGADO[tab] = true;
}

function invalidar(tab) { TAB_CARGADO[tab] = false; }

async function cargarCajas() {
  const { data } = await supabase
    .from('cajas_chicas')
    .select('*')
    .eq('empresa_id', EMPRESA_ID)
    .eq('activa', true)
    .order('nombre');
  CAJAS = data ?? [];
}

/* ────────────────────────────────────────────────────────
   TAB: CAJAS CHICAS
   ──────────────────────────────────────────────────────── */
async function renderCajas(el, hdr) {
  hdr.innerHTML = `<button class="btn btn-primary" id="btn-nueva-caja">+ Nueva caja</button>`;

  el.innerHTML = `
    <!-- Cards de saldo -->
    <div id="grid-cajas" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-4);margin-bottom:var(--space-6)">
      ${CAJAS.map(c => cajaCard(c)).join('')}
      ${!CAJAS.length ? '<p style="color:var(--text-tertiary)">Sin cajas registradas. Crea una para empezar.</p>' : ''}
    </div>

    <!-- Modal nueva caja -->
    <div class="modal-overlay" id="modal-caja">
      <div class="modal">
        <div class="modal__header">
          <h3 id="modal-caja-lbl">Nueva caja</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <form id="form-caja">
          <div class="modal__body">
            <input type="hidden" id="caja-id">
            <div class="form-group">
              <label class="form-label">Nombre *</label>
              <input class="form-control" id="caja-nombre" required placeholder="Ej. Yape Raul, Caja efectivo, Interbank Karlo">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
              <div class="form-group">
                <label class="form-label">Moneda</label>
                <select class="form-control" id="caja-moneda">
                  <option value="PEN">PEN (Soles)</option>
                  <option value="USD">USD (Dólares)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Saldo inicial</label>
                <input class="form-control" id="caja-saldo" type="number" step="0.01" min="0" value="0">
              </div>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
                <input type="checkbox" id="caja-es-banco"> Es cuenta bancaria (solo referencia, no gestiona saldo)
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
  `;

  document.getElementById('btn-nueva-caja')?.addEventListener('click', () => {
    $('#caja-id').value = '';
    $('#modal-caja-lbl').textContent = 'Nueva caja';
    document.getElementById('form-caja').reset();
    $('#caja-saldo').value = '0';
    abrirModal('modal-caja');
  });

  el.addEventListener('click', e => {
    const editarBtn = e.target.closest('[data-editar-caja]');
    if (editarBtn) {
      const c = CAJAS.find(x => x.id === editarBtn.dataset.editarCaja);
      if (!c) return;
      $('#caja-id').value = c.id;
      $('#caja-nombre').value = c.nombre;
      $('#caja-moneda').value = c.moneda;
      $('#caja-saldo').value = c.saldo_inicial;
      $('#caja-es-banco').checked = c.es_banco;
      $('#modal-caja-lbl').textContent = 'Editar caja';
      abrirModal('modal-caja');
    }
  });

  document.getElementById('form-caja')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('#caja-id').value;
    const saldoInicial = parseFloat($('#caja-saldo').value);
    const payload = {
      empresa_id: EMPRESA_ID,
      nombre: $('#caja-nombre').value,
      moneda: $('#caja-moneda').value,
      saldo_inicial: saldoInicial,
      saldo_actual: saldoInicial,
      es_banco: $('#caja-es-banco').checked,
    };
    const { error } = id
      ? await supabase.from('cajas_chicas').update({ nombre: payload.nombre, es_banco: payload.es_banco }).eq('id', id)
      : await supabase.from('cajas_chicas').insert(payload);
    if (error) { toastError('Error: ' + error.message); return; }
    toastExito('Caja guardada');
    cerrarModal('modal-caja');
    await cargarCajas();
    invalidar('cajas'); await cargarTab('cajas');
  });
}

function cajaCard(c) {
  const saldo = Number(c.saldo_actual);
  const color = c.es_banco ? 'var(--color-info)' : saldo >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
  return `
    <div class="card" style="padding:var(--space-5);border-top:3px solid ${color}">
      <div style="font-weight:700;font-size:var(--fs-base);margin-bottom:var(--space-1)">${escapeHTML(c.nombre)}</div>
      ${c.es_banco ? '<div style="font-size:var(--fs-xs);color:var(--color-info);margin-bottom:var(--space-3)">Cuenta bancaria</div>' :
        `<div style="font-size:var(--fs-xl);font-weight:800;color:${color};margin-bottom:var(--space-3)">${c.moneda} ${saldo.toFixed(2)}</div>`}
      <div style="display:flex;gap:var(--space-2)">
        <button class="btn btn-sm btn-secondary" data-editar-caja="${c.id}">Editar</button>
      </div>
    </div>`;
}

/* ────────────────────────────────────────────────────────
   TAB: MOVIMIENTOS — ingresos, egresos, transferencias
   ──────────────────────────────────────────────────────── */
async function renderMovimientos(el, hdr) {
  const { data: movs } = await supabase
    .from('movimientos_caja')
    .select(`id, tipo, monto, moneda, tipo_cambio_usado, monto_convertido, concepto, categoria, fecha,
             referencia_tipo, comprobante_url,
             cajas_chicas(nombre), caja_dest:caja_destino_id(nombre), agentes(nombre)`)
    .eq('empresa_id', EMPRESA_ID)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  hdr.innerHTML = `<button class="btn btn-primary" id="btn-nuevo-mov-caja">+ Movimiento</button>`;

  const colorTipo = { ingreso:'var(--color-success)', egreso:'var(--color-danger)', transferencia:'var(--color-accent)' };
  const totalPEN = (movs??[]).filter(m=>m.moneda==='PEN').reduce((s,m)=>s+(m.tipo==='ingreso'?Number(m.monto):m.tipo==='egreso'?-Number(m.monto):0),0);
  const totalUSD = (movs??[]).filter(m=>m.moneda==='USD').reduce((s,m)=>s+(m.tipo==='ingreso'?Number(m.monto):m.tipo==='egreso'?-Number(m.monto):0),0);

  // Build agentes list for modal
  const { data: agentesData } = await supabase
    .from('agentes_empresas')
    .select('agente_id, agentes(id, nombre)')
    .eq('empresa_id', EMPRESA_ID)
    .eq('estado', 'activo');
  const agentesEmp = (agentesData ?? []).map(r => r.agentes).filter(Boolean);

  el.innerHTML = `
    <!-- Resumen -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:var(--space-4);margin-bottom:var(--space-5)">
      ${CAJAS.map(c => `
        <div class="card" style="padding:var(--space-4)">
          <div style="font-size:var(--fs-xs);color:var(--text-tertiary)">${escapeHTML(c.nombre)}</div>
          <div style="font-size:var(--fs-lg);font-weight:800;color:${Number(c.saldo_actual)>=0?'var(--color-success)':'var(--color-danger)'}">
            ${c.moneda} ${Number(c.saldo_actual).toFixed(2)}
          </div>
        </div>`).join('')}
    </div>
    <!-- Filtros -->
    <div style="display:flex;gap:var(--space-3);flex-wrap:wrap;margin-bottom:var(--space-4)">
      <select class="form-control" id="mov-fil-caja" style="max-width:180px">
        <option value="">Todas las cajas</option>
        ${CAJAS.map(c => `<option value="${c.id}">${escapeHTML(c.nombre)}</option>`).join('')}
      </select>
      <select class="form-control" id="mov-fil-tipo" style="max-width:160px">
        <option value="">Todos los tipos</option>
        <option value="ingreso">Ingreso</option>
        <option value="egreso">Egreso</option>
        <option value="transferencia">Transferencia</option>
      </select>
      <input type="date" class="form-control" id="mov-fil-desde" style="max-width:150px">
      <input type="date" class="form-control" id="mov-fil-hasta" style="max-width:150px">
    </div>
    <!-- Tabla -->
    <div class="table-wrapper">
      <table class="data-table" id="tabla-movs">
        <thead><tr>
          <th>Fecha</th><th>Caja</th><th>Tipo</th><th>Monto</th>
          <th>Concepto</th><th>Categoría</th><th>Conversión</th><th>Registrado por</th>
        </tr></thead>
        <tbody id="body-movs">
          ${(movs ?? []).map(m => filaMov(m, colorTipo)).join('')}
          ${!movs?.length ? '<tr><td colspan="8" style="text-align:center;color:var(--text-tertiary)">Sin movimientos</td></tr>' : ''}
        </tbody>
      </table>
    </div>

    <!-- Modal nuevo movimiento -->
    <div class="modal-overlay" id="modal-mov-caja">
      <div class="modal modal--lg">
        <div class="modal__header">
          <h3>Nuevo movimiento de caja</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <form id="form-mov-caja">
          <div class="modal__body" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
            <div class="form-group">
              <label class="form-label">Tipo *</label>
              <select class="form-control" id="movc-tipo" required>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
                <option value="transferencia">Transferencia (conversión PEN↔USD)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Caja origen *</label>
              <select class="form-control" id="movc-caja" required>
                ${CAJAS.map(c => `<option value="${c.id}">${escapeHTML(c.nombre)} (${c.moneda})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Monto *</label>
              <input class="form-control" id="movc-monto" type="number" step="0.01" min="0.01" required>
            </div>
            <div class="form-group">
              <label class="form-label">Moneda</label>
              <select class="form-control" id="movc-moneda">
                <option value="PEN">PEN</option><option value="USD">USD</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Fecha *</label>
              <input class="form-control" id="movc-fecha" type="date" value="${new Date().toISOString().slice(0,10)}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Categoría</label>
              <input class="form-control" id="movc-categoria" list="categorias-list" placeholder="Ej. Servicios, Compras, Planilla">
              <datalist id="categorias-list">
                <option>Planilla</option><option>Servicios</option><option>Compras</option>
                <option>Honorarios</option><option>Viáticos</option><option>Otros</option>
              </datalist>
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Concepto *</label>
              <input class="form-control" id="movc-concepto" required placeholder="Descripción del movimiento">
            </div>
            <!-- Sección transferencia (solo visible si tipo = transferencia) -->
            <div id="seccion-transferencia" style="grid-column:1/-1;display:none;background:var(--bg-elevated);border-radius:8px;padding:var(--space-4);display:none">
              <div style="font-size:var(--fs-sm);font-weight:700;color:var(--text-secondary);margin-bottom:var(--space-3)">Datos de conversión</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-3)">
                <div class="form-group">
                  <label class="form-label">Caja destino</label>
                  <select class="form-control" id="movc-caja-dest">
                    <option value="">— Seleccionar —</option>
                    ${CAJAS.map(c => `<option value="${c.id}">${escapeHTML(c.nombre)} (${c.moneda})</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Tipo de cambio</label>
                  <input class="form-control" id="movc-tc" type="number" step="0.001" placeholder="Ej. 3.750">
                </div>
                <div class="form-group">
                  <label class="form-label">Monto a recibir</label>
                  <input class="form-control" id="movc-monto-conv" type="number" step="0.01" placeholder="Calculado">
                </div>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Registrado por</label>
              <select class="form-control" id="movc-agente">
                <option value="">— Nadie —</option>
                ${agentesEmp.map(a => `<option value="${a.id}">${escapeHTML(a.nombre)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Referencia (tipo)</label>
              <select class="form-control" id="movc-ref-tipo">
                <option value="">— Ninguna —</option>
                <option value="planilla">Planilla</option>
                <option value="honorario">Honorario</option>
                <option value="factura">Factura</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Registrar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Mostrar sección conversión si tipo = transferencia
  document.getElementById('movc-tipo')?.addEventListener('change', e => {
    const sec = document.getElementById('seccion-transferencia');
    sec.style.display = e.target.value === 'transferencia' ? 'block' : 'none';
  });

  // Calcular monto convertido automáticamente
  ['movc-monto','movc-tc'].forEach(id => {
    $(id)?.addEventListener('input', () => {
      const monto = parseFloat($('#movc-monto').value) || 0;
      const tc    = parseFloat($('#movc-tc').value) || 0;
      if (monto && tc) {
        const cajaOrigenMoneda = CAJAS.find(c => c.id === $('#movc-caja').value)?.moneda ?? 'PEN';
        $('#movc-monto-conv').value = cajaOrigenMoneda === 'PEN' ? (monto / tc).toFixed(2) : (monto * tc).toFixed(2);
      }
    });
  });

  // Filtros de tabla (solo visual, no reconsulta)
  ['mov-fil-caja','mov-fil-tipo','mov-fil-desde','mov-fil-hasta'].forEach(id => {
    $(id)?.addEventListener('change', aplicarFiltroMovs);
  });

  document.getElementById('btn-nuevo-mov-caja')?.addEventListener('click', () => {
    document.getElementById('form-mov-caja').reset();
    $('#movc-fecha').value = new Date().toISOString().slice(0,10);
    document.getElementById('seccion-transferencia').style.display = 'none';
    abrirModal('modal-mov-caja');
  });

  document.getElementById('form-mov-caja')?.addEventListener('submit', async e => {
    e.preventDefault();
    const tipo = $('#movc-tipo').value;
    const cajaId = $('#movc-caja').value;
    const moneda = CAJAS.find(c=>c.id===cajaId)?.moneda ?? $('#movc-moneda').value;
    const monto = parseFloat($('#movc-monto').value);

    const payload = {
      caja_id: cajaId,
      empresa_id: EMPRESA_ID,
      tipo,
      monto,
      moneda,
      concepto: $('#movc-concepto').value,
      categoria: $('#movc-categoria').value || null,
      fecha: $('#movc-fecha').value,
      agente_id: $('#movc-agente').value || null,
      referencia_tipo: $('#movc-ref-tipo').value || null,
    };

    if (tipo === 'transferencia') {
      payload.caja_destino_id = $('#movc-caja-dest').value || null;
      payload.tipo_cambio_usado = parseFloat($('#movc-tc').value) || null;
      payload.monto_convertido = parseFloat($('#movc-monto-conv').value) || null;
    }

    const { error } = await supabase.from('movimientos_caja').insert(payload);
    if (error) { toastError('Error: ' + error.message); return; }
    toastExito('Movimiento registrado');
    cerrarModal('modal-mov-caja');
    CAJAS = [];
    invalidar('movimientos'); invalidar('cajas');
    await cargarTab('movimientos');
  });
}

function filaMov(m, colorTipo) {
  const esConversion = m.tipo === 'transferencia' && m.monto_convertido;
  const signo = m.tipo === 'ingreso' ? '+' : m.tipo === 'egreso' ? '-' : '↔';
  return `<tr>
    <td style="color:var(--text-tertiary);font-size:var(--fs-sm)">${m.fecha}</td>
    <td>${escapeHTML(m.cajas_chicas?.nombre ?? '—')}</td>
    <td><span style="font-size:var(--fs-xs);font-weight:700;color:${colorTipo[m.tipo] ?? 'var(--text-secondary)'};text-transform:capitalize">${signo} ${m.tipo}</span></td>
    <td style="font-weight:700;color:${colorTipo[m.tipo] ?? 'var(--text-primary)'}">${m.moneda} ${Number(m.monto).toFixed(2)}</td>
    <td>${escapeHTML(m.concepto)}</td>
    <td style="color:var(--text-tertiary);font-size:var(--fs-xs)">${escapeHTML(m.categoria ?? '—')}</td>
    <td style="font-size:var(--fs-xs);color:var(--text-tertiary)">${esConversion ? `TC ${m.tipo_cambio_usado} → ${m.caja_dest?.nombre ?? ''}: ${Number(m.monto_convertido).toFixed(2)}` : '—'}</td>
    <td style="color:var(--text-tertiary);font-size:var(--fs-xs)">${escapeHTML(m.agentes?.nombre ?? '—')}</td>
  </tr>`;
}

function aplicarFiltroMovs() {
  const filtCaja  = $('#mov-fil-caja')?.value ?? '';
  const filtTipo  = $('#mov-fil-tipo')?.value ?? '';
  const filtDesde = $('#mov-fil-desde')?.value ?? '';
  const filtHasta = $('#mov-fil-hasta')?.value ?? '';
  document.querySelectorAll('#body-movs tr').forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (!cells.length) return;
    // Filtros simples sobre el texto de las celdas
    const fecha = cells[0]?.textContent?.trim() ?? '';
    const caja  = cells[1]?.textContent?.trim() ?? '';
    const tipo  = cells[2]?.textContent?.trim().toLowerCase() ?? '';
    const ok = (!filtCaja || caja.toLowerCase().includes(filtCaja.toLowerCase())) &&
               (!filtTipo || tipo.includes(filtTipo)) &&
               (!filtDesde || fecha >= filtDesde) &&
               (!filtHasta || fecha <= filtHasta);
    tr.style.display = ok ? '' : 'none';
  });
}

/* ────────────────────────────────────────────────────────
   TAB: FACTURAS — gastos con comprobante → reembolso a caja
   ──────────────────────────────────────────────────────── */
async function renderFacturas(el, hdr) {
  const { data: facturas } = await supabase
    .from('facturas_caja')
    .select(`id, proveedor, numero_factura, monto, moneda, fecha, concepto, estado,
             cajas_chicas(nombre), agentes(nombre)`)
    .eq('empresa_id', EMPRESA_ID)
    .order('fecha', { ascending: false });

  hdr.innerHTML = `<button class="btn btn-primary" id="btn-nueva-factura">+ Nueva factura</button>`;

  const colorEst = { pendiente:'var(--color-warning)', reembolsada:'var(--color-success)', cancelada:'var(--text-tertiary)' };
  const totalPendiente = (facturas??[]).filter(f=>f.estado==='pendiente').reduce((s,f)=>s+Number(f.monto),0);

  el.innerHTML = `
    ${totalPendiente > 0 ? `
      <div class="card" style="padding:var(--space-4);margin-bottom:var(--space-5);border-left:3px solid var(--color-warning);display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:var(--fs-xs);color:var(--color-warning);font-weight:700">FACTURAS PENDIENTES DE REEMBOLSO</div>
          <div style="font-size:var(--fs-xl);font-weight:800">S/ ${totalPendiente.toFixed(2)}</div>
        </div>
        <span style="color:var(--text-tertiary);font-size:var(--fs-sm)">${(facturas??[]).filter(f=>f.estado==='pendiente').length} facturas</span>
      </div>` : ''}

    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>
          <th>Proveedor</th><th>N° Factura</th><th>Monto</th><th>Fecha</th>
          <th>Concepto</th><th>Caja destino</th><th>Estado</th><th>Registrado por</th><th></th>
        </tr></thead>
        <tbody>
          ${(facturas ?? []).map(f => `<tr>
            <td><strong>${escapeHTML(f.proveedor)}</strong></td>
            <td style="color:var(--text-tertiary);font-size:var(--fs-sm)">${escapeHTML(f.numero_factura ?? '—')}</td>
            <td style="font-weight:700">${f.moneda} ${Number(f.monto).toFixed(2)}</td>
            <td style="color:var(--text-tertiary)">${f.fecha}</td>
            <td style="color:var(--text-tertiary);font-size:var(--fs-sm)">${escapeHTML(f.concepto ?? '—')}</td>
            <td style="color:var(--text-tertiary);font-size:var(--fs-sm)">${escapeHTML(f.cajas_chicas?.nombre ?? '—')}</td>
            <td><span style="font-size:var(--fs-xs);font-weight:700;color:${colorEst[f.estado]};text-transform:capitalize">${f.estado}</span></td>
            <td style="color:var(--text-tertiary);font-size:var(--fs-xs)">${escapeHTML(f.agentes?.nombre ?? '—')}</td>
            <td style="white-space:nowrap">
              ${f.estado === 'pendiente' ? `
                <button class="btn btn-sm btn-primary" data-reembolsar-fact='${JSON.stringify({id:f.id,monto:f.monto,moneda:f.moneda,proveedor:f.proveedor})}'>Reembolsar</button>
                <button class="btn btn-sm btn-secondary" data-cancelar-fact="${f.id}" style="margin-left:4px">Cancelar</button>` : ''}
            </td>
          </tr>`).join('')}
          ${!facturas?.length ? '<tr><td colspan="9" style="text-align:center;color:var(--text-tertiary)">Sin facturas registradas</td></tr>' : ''}
        </tbody>
      </table>
    </div>

    <!-- Modal nueva factura -->
    <div class="modal-overlay" id="modal-factura">
      <div class="modal modal--lg">
        <div class="modal__header">
          <h3>Nueva factura</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <form id="form-factura">
          <div class="modal__body" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
            <div class="form-group">
              <label class="form-label">Proveedor *</label>
              <input class="form-control" id="fact-proveedor" required>
            </div>
            <div class="form-group">
              <label class="form-label">N° Factura</label>
              <input class="form-control" id="fact-numero" placeholder="Ej. F001-0001234">
            </div>
            <div class="form-group">
              <label class="form-label">Monto *</label>
              <input class="form-control" id="fact-monto" type="number" step="0.01" required>
            </div>
            <div class="form-group">
              <label class="form-label">Moneda</label>
              <select class="form-control" id="fact-moneda">
                <option value="PEN">PEN</option><option value="USD">USD</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Fecha *</label>
              <input class="form-control" id="fact-fecha" type="date" value="${new Date().toISOString().slice(0,10)}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Caja destino del reembolso</label>
              <select class="form-control" id="fact-caja">
                <option value="">— Por definir —</option>
                ${CAJAS.filter(c=>!c.es_banco).map(c => `<option value="${c.id}">${escapeHTML(c.nombre)} (${c.moneda})</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Concepto</label>
              <input class="form-control" id="fact-concepto" placeholder="Descripción del gasto">
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Registrar factura</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal reembolso -->
    <div class="modal-overlay" id="modal-reembolso">
      <div class="modal">
        <div class="modal__header">
          <h3>Reembolsar factura</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <form id="form-reembolso">
          <div class="modal__body">
            <input type="hidden" id="reemb-fact-id">
            <p id="reemb-desc" style="margin-bottom:var(--space-4);color:var(--text-secondary)"></p>
            <div class="form-group">
              <label class="form-label">Caja de la que sale el reembolso *</label>
              <select class="form-control" id="reemb-caja" required>
                ${CAJAS.map(c => `<option value="${c.id}">${escapeHTML(c.nombre)} (${c.moneda}) — Saldo: ${Number(c.saldo_actual).toFixed(2)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Confirmar reembolso</button>
          </div>
        </form>
      </div>
    </div>`;

  // Nueva factura
  document.getElementById('btn-nueva-factura')?.addEventListener('click', () => {
    document.getElementById('form-factura').reset();
    $('#fact-fecha').value = new Date().toISOString().slice(0,10);
    abrirModal('modal-factura');
  });

  document.getElementById('form-factura')?.addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await supabase.from('facturas_caja').insert({
      empresa_id: EMPRESA_ID,
      proveedor: $('#fact-proveedor').value,
      numero_factura: $('#fact-numero').value || null,
      monto: parseFloat($('#fact-monto').value),
      moneda: $('#fact-moneda').value,
      fecha: $('#fact-fecha').value,
      concepto: $('#fact-concepto').value || null,
      caja_destino_id: $('#fact-caja').value || null,
      agente_id: AGENTE.id,
    });
    if (error) { toastError('Error: ' + error.message); return; }
    toastExito('Factura registrada');
    cerrarModal('modal-factura');
    invalidar('facturas'); await cargarTab('facturas');
  });

  // Reembolsar / cancelar
  el.addEventListener('click', async e => {
    const reemb = e.target.closest('[data-reembolsar-fact]');
    if (reemb) {
      const d = JSON.parse(reemb.dataset.reembolsarFact);
      $('#reemb-fact-id').value = d.id;
      $('#reemb-desc').textContent = `Factura: ${d.proveedor} — ${d.moneda} ${Number(d.monto).toFixed(2)}`;
      abrirModal('modal-reembolso');
    }
    const cancel = e.target.closest('[data-cancelar-fact]');
    if (cancel) {
      if (!await confirmar('¿Cancelar esta factura?')) return;
      await supabase.from('facturas_caja').update({ estado:'cancelada' }).eq('id', cancel.dataset.cancelarFact);
      toastExito('Factura cancelada');
      invalidar('facturas'); await cargarTab('facturas');
    }
  });

  document.getElementById('form-reembolso')?.addEventListener('submit', async e => {
    e.preventDefault();
    const factId = $('#reemb-fact-id').value;
    const cajaId = $('#reemb-caja').value;

    // Obtener datos de la factura
    const { data: fact } = await supabase.from('facturas_caja').select('*').eq('id', factId).single();
    if (!fact) { toastError('Factura no encontrada'); return; }

    // Registrar movimiento de egreso en caja
    const { data: mov, error: movErr } = await supabase.from('movimientos_caja').insert({
      caja_id: cajaId,
      empresa_id: EMPRESA_ID,
      tipo: 'ingreso',  // ingreso a la caja = reembolso del gasto
      monto: Number(fact.monto),
      moneda: fact.moneda,
      concepto: `Reembolso factura ${fact.numero_factura ?? fact.proveedor}`,
      categoria: 'Reembolso',
      fecha: new Date().toISOString().slice(0,10),
      agente_id: AGENTE.id,
      referencia_tipo: 'factura',
      referencia_id: factId,
    }).select().single();

    if (movErr) { toastError('Error al registrar movimiento: ' + movErr.message); return; }

    // Marcar factura como reembolsada
    await supabase.from('facturas_caja').update({
      estado: 'reembolsada',
      movimiento_reembolso_id: mov.id,
      caja_destino_id: cajaId,
    }).eq('id', factId);

    toastExito('Factura reembolsada. El saldo de la caja fue actualizado.');
    cerrarModal('modal-reembolso');
    CAJAS = [];
    invalidar('facturas'); invalidar('movimientos'); invalidar('cajas');
    await cargarTab('facturas');
  });
}

init();
