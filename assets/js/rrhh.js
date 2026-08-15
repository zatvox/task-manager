/**
 * rrhh.js — Módulo de Recursos Humanos
 * Tabs: Empleados · Planilla · Movimientos · Certificados · Externos RH
 */
import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, abrirModal, cerrarModal, confirmar } from './main.js';
import { supabase } from './supabase-client.js';
import { $, escapeHTML } from './utils.js';

const TABS_RRHH = ['empleados','planilla','movimientos','certificados','externos'];
let AGENTE, EMPRESAS, EMPRESA_ID, TAB_CARGADO = {};

/* ── BOOTSTRAP ────────────────────────────────────────── */
async function init() {
  renderLayout('rrhh');
  const ctx = await inicializarApp();
  AGENTE = ctx.agente;
  EMPRESAS = ctx.empresas ?? [];
  EMPRESA_ID = EMPRESAS[0]?.id ?? null;

  document.getElementById('main-content').innerHTML = plantilla();
  bindTabs();
  cargarTab(hashTab());
  window.addEventListener('hashchange', () => cargarTab(hashTab()));
}

function hashTab() {
  const h = location.hash.replace('#','');
  return TABS_RRHH.includes(h) ? h : 'empleados';
}

function plantilla() {
  return `
    <div class="page-header" style="margin-bottom:0">
      <div><h1>Recursos Humanos</h1></div>
      <div style="display:flex;gap:var(--space-3);align-items:center">
        <select class="form-control" id="rrhh-empresa-sel" style="max-width:200px">
          ${EMPRESAS.map(e => `<option value="${e.id}">${escapeHTML(e.nombre)}</option>`).join('')}
        </select>
        <div id="rrhh-header-action"></div>
      </div>
    </div>
    <nav style="display:flex;gap:4px;border-bottom:1px solid var(--border-subtle);margin-bottom:var(--space-5);padding-top:var(--space-4)">
      ${TABS_RRHH.map(t => `
        <a href="#${t}" class="rrhh-tab" data-tab="${t}"
           style="padding:8px 18px;border-radius:8px 8px 0 0;font-size:var(--fs-sm);font-weight:600;color:var(--text-tertiary);text-decoration:none;border:1px solid transparent;border-bottom:none;transition:all .15s">
          ${{empleados:'Empleados',planilla:'Planilla',movimientos:'Movimientos',certificados:'Certificados',externos:'Externos RH'}[t]}
        </a>`).join('')}
    </nav>
    <div id="rrhh-content"></div>
  `;
}

function bindTabs() {
  document.addEventListener('click', e => {
    const a = e.target.closest('.rrhh-tab');
    if (!a) return;
    e.preventDefault();
    location.hash = a.dataset.tab;
  });
  document.getElementById('rrhh-empresa-sel')?.addEventListener('change', e => {
    EMPRESA_ID = e.target.value;
    TAB_CARGADO = {};
    cargarTab(hashTab());
  });
}

function activarTab(tab) {
  document.querySelectorAll('.rrhh-tab').forEach(el => {
    const ok = el.dataset.tab === tab;
    el.style.color = ok ? 'var(--color-accent)' : 'var(--text-tertiary)';
    el.style.backgroundColor = ok ? 'var(--bg-surface)' : 'transparent';
    el.style.borderColor = ok ? 'var(--border-subtle)' : 'transparent';
  });
}

async function cargarTab(tab) {
  activarTab(tab);
  const el = document.getElementById('rrhh-content');
  const hdr = document.getElementById('rrhh-header-action');
  if (!el) return;
  if (TAB_CARGADO[tab]) return;
  el.innerHTML = '<div class="loading-spinner"></div>';
  hdr.innerHTML = '';
  switch(tab) {
    case 'empleados':    await renderEmpleados(el, hdr);    break;
    case 'planilla':     await renderPlanilla(el, hdr);     break;
    case 'movimientos':  await renderMovimientos(el, hdr);  break;
    case 'certificados': await renderCertificados(el, hdr); break;
    case 'externos':     await renderExternos(el, hdr);     break;
  }
  TAB_CARGADO[tab] = true;
}

function invalidar(tab) { TAB_CARGADO[tab] = false; }

/* ────────────────────────────────────────────────────────
   TAB: EMPLEADOS — contratos de agentes en planilla
   ──────────────────────────────────────────────────────── */
async function renderEmpleados(el, hdr) {
  const { data: contratos } = await supabase
    .from('contratos_empleado')
    .select(`id, sueldo_base, moneda, frecuencia_pago, regimen_pension, activo, fecha_ingreso, fecha_cese,
             tiene_cts, tiene_gratificacion, tiene_vacaciones, tiene_essalud, agentes(nombre, email)`)
    .eq('empresa_id', EMPRESA_ID)
    .order('activo', { ascending: false });

  hdr.innerHTML = `<button class="btn btn-primary" id="btn-nuevo-contrato">+ Nuevo contrato</button>`;

  const agentesEmp = await obtenerAgentesEmpresa();

  el.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>
          <th>Empleado</th><th>Sueldo base</th><th>Moneda</th><th>Pago</th>
          <th>Pensión</th><th>Ingreso</th><th>Estado</th><th></th>
        </tr></thead>
        <tbody>
          ${(contratos ?? []).map(c => `
            <tr>
              <td><strong>${escapeHTML(c.agentes?.nombre ?? '—')}</strong><br>
                <span style="font-size:var(--fs-xs);color:var(--text-tertiary)">${escapeHTML(c.agentes?.email ?? '')}</span></td>
              <td style="font-weight:700">S/ ${Number(c.sueldo_base).toFixed(2)}</td>
              <td>${c.moneda}</td>
              <td style="text-transform:capitalize">${c.frecuencia_pago}</td>
              <td>${c.regimen_pension}</td>
              <td style="font-size:var(--fs-sm)">${c.fecha_ingreso}</td>
              <td>
                <span style="font-size:var(--fs-xs);font-weight:700;color:${c.activo ? 'var(--color-success)' : 'var(--text-tertiary)'}">
                  ${c.activo ? 'Activo' : 'Cesado'}
                </span>
              </td>
              <td>
                <button class="btn btn-sm btn-secondary" data-editar-contrato='${JSON.stringify({id:c.id,agente_id:c.agentes?.id,sueldo:c.sueldo_base,moneda:c.moneda,freq:c.frecuencia_pago,pension:c.regimen_pension,ingreso:c.fecha_ingreso,cese:c.fecha_cese??'',cts:c.tiene_cts,gratifc:c.tiene_gratificacion,vacs:c.tiene_vacaciones,essalud:c.tiene_essalud,activo:c.activo})}'>Editar</button>
              </td>
            </tr>`).join('')}
          ${!contratos?.length ? '<tr><td colspan="8" style="text-align:center;color:var(--text-tertiary)">Sin contratos registrados</td></tr>' : ''}
        </tbody>
      </table>
    </div>

    <!-- Modal contrato -->
    <div class="modal-overlay" id="modal-contrato">
      <div class="modal modal--lg">
        <div class="modal__header">
          <h3 id="modal-contrato-lbl">Nuevo contrato</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <form id="form-contrato">
          <div class="modal__body" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
            <input type="hidden" id="contrato-id">
            <div class="form-group">
              <label class="form-label">Empleado *</label>
              <select class="form-control" id="contrato-agente" required>
                ${agentesEmp.map(a => `<option value="${a.id}">${escapeHTML(a.nombre)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Sueldo base *</label>
              <input class="form-control" id="contrato-sueldo" type="number" step="0.01" min="0" required>
            </div>
            <div class="form-group">
              <label class="form-label">Moneda</label>
              <select class="form-control" id="contrato-moneda">
                <option value="PEN">PEN (Soles)</option>
                <option value="USD">USD (Dólares)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Frecuencia de pago</label>
              <select class="form-control" id="contrato-frecuencia">
                <option value="mensual">Mensual</option>
                <option value="quincenal">Quincenal</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Régimen de pensión</label>
              <select class="form-control" id="contrato-pension">
                <option value="AFP">AFP (~10%)</option>
                <option value="ONP">ONP (13%)</option>
                <option value="ninguno">Ninguno</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Fecha de ingreso *</label>
              <input class="form-control" id="contrato-ingreso" type="date" required>
            </div>
            <div class="form-group">
              <label class="form-label">Fecha de cese</label>
              <input class="form-control" id="contrato-cese" type="date">
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Beneficios</label>
              <div style="display:flex;gap:var(--space-4);flex-wrap:wrap;margin-top:var(--space-2)">
                ${[['contrato-cts','CTS'],['contrato-gratifc','Gratificación'],['contrato-vacs','Vacaciones'],['contrato-essalud','EsSalud']].map(([id,lbl]) => `
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--fs-sm)">
                    <input type="checkbox" id="${id}" checked> ${lbl}
                  </label>`).join('')}
              </div>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:var(--fs-sm)">
                <input type="checkbox" id="contrato-activo" checked> Contrato activo
              </label>
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('btn-nuevo-contrato')?.addEventListener('click', () => {
    $('#contrato-id').value = '';
    $('#modal-contrato-lbl').textContent = 'Nuevo contrato';
    document.getElementById('form-contrato').reset();
    ['contrato-cts','contrato-gratifc','contrato-vacs','contrato-essalud','contrato-activo'].forEach(id => $(id).checked = true);
    abrirModal('modal-contrato');
  });

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-editar-contrato]');
    if (!btn) return;
    const d = JSON.parse(btn.dataset.editarContrato);
    $('#contrato-id').value = d.id;
    $('#contrato-agente').value = d.agente_id;
    $('#contrato-sueldo').value = d.sueldo;
    $('#contrato-moneda').value = d.moneda;
    $('#contrato-frecuencia').value = d.freq;
    $('#contrato-pension').value = d.pension;
    $('#contrato-ingreso').value = d.ingreso;
    $('#contrato-cese').value = d.cese;
    $('#contrato-cts').checked = d.cts;
    $('#contrato-gratifc').checked = d.gratifc;
    $('#contrato-vacs').checked = d.vacs;
    $('#contrato-essalud').checked = d.essalud;
    $('#contrato-activo').checked = d.activo;
    $('#modal-contrato-lbl').textContent = 'Editar contrato';
    abrirModal('modal-contrato');
  });

  document.getElementById('form-contrato')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('#contrato-id').value;
    const payload = {
      agente_id: $('#contrato-agente').value,
      empresa_id: EMPRESA_ID,
      sueldo_base: parseFloat($('#contrato-sueldo').value),
      moneda: $('#contrato-moneda').value,
      frecuencia_pago: $('#contrato-frecuencia').value,
      regimen_pension: $('#contrato-pension').value,
      fecha_ingreso: $('#contrato-ingreso').value,
      fecha_cese: $('#contrato-cese').value || null,
      tiene_cts: $('#contrato-cts').checked,
      tiene_gratificacion: $('#contrato-gratifc').checked,
      tiene_vacaciones: $('#contrato-vacs').checked,
      tiene_essalud: $('#contrato-essalud').checked,
      activo: $('#contrato-activo').checked,
    };
    const { error } = id
      ? await supabase.from('contratos_empleado').update(payload).eq('id', id)
      : await supabase.from('contratos_empleado').insert(payload);
    if (error) { toastError('Error: ' + error.message); return; }
    toastExito('Contrato guardado');
    cerrarModal('modal-contrato');
    invalidar('empleados');
    await cargarTab('empleados');
  });
}

/* ────────────────────────────────────────────────────────
   TAB: PLANILLA — período, cálculo y export PDT PLAME
   ──────────────────────────────────────────────────────── */
async function renderPlanilla(el, hdr) {
  const { data: periodos } = await supabase
    .from('planilla_periodos')
    .select('*')
    .eq('empresa_id', EMPRESA_ID)
    .order('periodo_inicio', { ascending: false });

  hdr.innerHTML = `<button class="btn btn-primary" id="btn-nuevo-periodo">+ Nuevo período</button>`;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:280px 1fr;gap:var(--space-5)">
      <!-- Lista de períodos -->
      <div>
        <h3 style="font-size:var(--fs-sm);font-weight:700;color:var(--text-tertiary);margin-bottom:var(--space-3);text-transform:uppercase;letter-spacing:.05em">Períodos</h3>
        <div id="lista-periodos">
          ${(periodos ?? []).map(p => `
            <div class="card" style="padding:var(--space-3);margin-bottom:var(--space-2);cursor:pointer" data-abrir-periodo="${p.id}">
              <div style="font-weight:700;font-size:var(--fs-sm)">${p.periodo_inicio} → ${p.periodo_fin}</div>
              <div style="font-size:var(--fs-xs);color:var(--text-tertiary);margin-top:2px;text-transform:capitalize">${p.frecuencia} · ${p.estado}</div>
            </div>`).join('')}
          ${!periodos?.length ? '<p style="color:var(--text-tertiary);font-size:var(--fs-sm)">Sin períodos</p>' : ''}
        </div>
      </div>
      <!-- Detalle del período -->
      <div id="detalle-periodo">
        <p style="color:var(--text-tertiary)">Selecciona un período para ver el detalle.</p>
      </div>
    </div>

    <!-- Modal nuevo período -->
    <div class="modal-overlay" id="modal-periodo">
      <div class="modal">
        <div class="modal__header">
          <h3>Nuevo período de planilla</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <form id="form-periodo">
          <div class="modal__body">
            <div class="form-group">
              <label class="form-label">Frecuencia</label>
              <select class="form-control" id="periodo-frecuencia">
                <option value="mensual">Mensual</option>
                <option value="quincenal">Quincenal</option>
              </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
              <div class="form-group">
                <label class="form-label">Inicio *</label>
                <input class="form-control" id="periodo-inicio" type="date" required>
              </div>
              <div class="form-group">
                <label class="form-label">Fin *</label>
                <input class="form-control" id="periodo-fin" type="date" required>
              </div>
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Crear y calcular</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('btn-nuevo-periodo')?.addEventListener('click', () => {
    document.getElementById('form-periodo').reset();
    // Sugerir fechas automáticas del mes actual
    const hoy = new Date();
    const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0);
    $('#periodo-inicio').value = ini.toISOString().slice(0,10);
    $('#periodo-fin').value = fin.toISOString().slice(0,10);
    abrirModal('modal-periodo');
  });

  document.getElementById('form-periodo')?.addEventListener('submit', async e => {
    e.preventDefault();
    const { data: periodo, error } = await supabase.from('planilla_periodos').insert({
      empresa_id: EMPRESA_ID,
      periodo_inicio: $('#periodo-inicio').value,
      periodo_fin: $('#periodo-fin').value,
      frecuencia: $('#periodo-frecuencia').value,
      generado_por: AGENTE.id,
    }).select().single();
    if (error) { toastError('Error: ' + error.message); return; }
    cerrarModal('modal-periodo');
    toastExito('Período creado. Calculando planilla…');
    await calcularPlanilla(periodo.id);
    invalidar('planilla');
    await cargarTab('planilla');
  });

  // Abrir período
  el.addEventListener('click', async e => {
    const card = e.target.closest('[data-abrir-periodo]');
    if (!card) return;
    await mostrarDetallePeriodo(card.dataset.abrirPeriodo);
  });
}

async function calcularPlanilla(periodoId) {
  // Obtener contratos activos de la empresa
  const { data: contratos } = await supabase
    .from('contratos_empleado')
    .select('*')
    .eq('empresa_id', EMPRESA_ID)
    .eq('activo', true);

  const { data: periodo } = await supabase.from('planilla_periodos').select('*').eq('id', periodoId).single();
  const dias = Math.round((new Date(periodo.periodo_fin) - new Date(periodo.periodo_inicio)) / 86400000) + 1;
  const diasBase = periodo.frecuencia === 'mensual' ? 30 : 15;

  for (const c of contratos ?? []) {
    // Calcular adelantos pendientes en este período
    const { data: movs } = await supabase
      .from('movimientos_rrhh')
      .select('monto, tipo')
      .eq('agente_id', c.agente_id)
      .eq('empresa_id', EMPRESA_ID)
      .is('descontado_en_periodo', null)
      .in('tipo', ['adelanto', 'vale']);

    const totalDescuentos = (movs ?? []).reduce((s, m) => s + Number(m.monto), 0);
    const sueldoBruto = Number(c.sueldo_base);
    const pctPension = c.regimen_pension === 'AFP' ? 0.10 : c.regimen_pension === 'ONP' ? 0.13 : 0;
    const descPension = sueldoBruto * pctPension;
    const essalud = c.tiene_essalud ? sueldoBruto * 0.09 : 0;
    const netLegal = sueldoBruto - descPension;
    const netPago = netLegal - totalDescuentos;
    const ctsProv = c.tiene_cts ? (sueldoBruto / 6) * (dias / 30) : 0;
    const gratProv = c.tiene_gratificacion ? sueldoBruto / 6 : 0;
    const vacProv = c.tiene_vacaciones ? sueldoBruto / 12 : 0;

    const item = {
      periodo_id: periodoId,
      agente_id: c.agente_id,
      empresa_id: EMPRESA_ID,
      sueldo_base: sueldoBruto,
      dias_trabajados: diasBase,
      sueldo_bruto: sueldoBruto,
      descuento_pension: descPension,
      sueldo_neto_legal: netLegal,
      descuento_adelantos: totalDescuentos,
      descuento_vales: 0,
      sueldo_neto_pago: Math.max(0, netPago),
      essalud,
      cts_provision: ctsProv,
      gratificacion_provision: gratProv,
      vacaciones_provision: vacProv,
    };
    await supabase.from('planilla_items').upsert(item, { onConflict: 'periodo_id,agente_id' });

    // Marcar adelantos como descontados
    for (const m of movs ?? []) {
      await supabase.from('movimientos_rrhh').update({ descontado_en_periodo: periodoId }).eq('agente_id', c.agente_id).is('descontado_en_periodo', null);
    }
  }
  toastExito('Planilla calculada');
}

async function mostrarDetallePeriodo(periodoId) {
  const { data: periodo } = await supabase.from('planilla_periodos').select('*').eq('id', periodoId).single();
  const { data: items } = await supabase
    .from('planilla_items')
    .select('*, agentes(nombre)')
    .eq('periodo_id', periodoId);

  const det = document.getElementById('detalle-periodo');
  const totBruto = (items??[]).reduce((s,i) => s+Number(i.sueldo_bruto),0);
  const totNeto = (items??[]).reduce((s,i) => s+Number(i.sueldo_neto_pago),0);
  const totEssalud = (items??[]).reduce((s,i) => s+Number(i.essalud),0);

  det.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4)">
      <div>
        <h3 style="margin:0">${periodo.periodo_inicio} → ${periodo.periodo_fin}</h3>
        <span style="font-size:var(--fs-xs);color:var(--text-tertiary);text-transform:capitalize">${periodo.frecuencia} · ${periodo.estado}</span>
      </div>
      <div style="display:flex;gap:var(--space-3)">
        <button class="btn btn-secondary btn-sm" id="btn-recalcular" data-pid="${periodoId}">Recalcular</button>
        <button class="btn btn-primary btn-sm" id="btn-exportar-plame" data-pid="${periodoId}">⬇ PDT PLAME .txt</button>
      </div>
    </div>
    <!-- Resumen -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-3);margin-bottom:var(--space-5)">
      <div class="card" style="padding:var(--space-4);text-align:center">
        <div style="font-size:var(--fs-xs);color:var(--text-tertiary)">Total bruto</div>
        <div style="font-size:var(--fs-xl);font-weight:800;color:var(--color-accent)">S/ ${totBruto.toFixed(2)}</div>
      </div>
      <div class="card" style="padding:var(--space-4);text-align:center">
        <div style="font-size:var(--fs-xs);color:var(--text-tertiary)">Total neto a pagar</div>
        <div style="font-size:var(--fs-xl);font-weight:800;color:var(--color-success)">S/ ${totNeto.toFixed(2)}</div>
      </div>
      <div class="card" style="padding:var(--space-4);text-align:center">
        <div style="font-size:var(--fs-xs);color:var(--text-tertiary)">EsSalud empleador</div>
        <div style="font-size:var(--fs-xl);font-weight:800;color:var(--color-warning)">S/ ${totEssalud.toFixed(2)}</div>
      </div>
    </div>
    <!-- Detalle por empleado -->
    <div class="table-wrapper">
      <table class="data-table" style="font-size:var(--fs-sm)">
        <thead><tr>
          <th>Empleado</th><th>Bruto</th><th>Pensión</th><th>Neto legal</th>
          <th style="color:var(--color-warning)">Desc. internos</th><th>Neto a pagar</th>
          <th>EsSalud</th><th>CTS prov.</th>
        </tr></thead>
        <tbody>
          ${(items??[]).map(i => `<tr>
            <td><strong>${escapeHTML(i.agentes?.nombre ?? '—')}</strong></td>
            <td>S/ ${Number(i.sueldo_bruto).toFixed(2)}</td>
            <td style="color:var(--color-danger)">-S/ ${Number(i.descuento_pension).toFixed(2)}</td>
            <td>S/ ${Number(i.sueldo_neto_legal).toFixed(2)}</td>
            <td style="color:var(--color-warning)">-S/ ${(Number(i.descuento_adelantos)+Number(i.descuento_vales)).toFixed(2)}</td>
            <td style="font-weight:700;color:var(--color-success)">S/ ${Number(i.sueldo_neto_pago).toFixed(2)}</td>
            <td>S/ ${Number(i.essalud).toFixed(2)}</td>
            <td style="color:var(--text-tertiary)">S/ ${Number(i.cts_provision).toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  det.querySelector('#btn-recalcular')?.addEventListener('click', async () => {
    toastExito('Recalculando…');
    await calcularPlanilla(periodoId);
    await mostrarDetallePeriodo(periodoId);
  });

  det.querySelector('#btn-exportar-plame')?.addEventListener('click', () => exportarPlame(periodo, items ?? []));
}

function exportarPlame(periodo, items) {
  // Formato simplificado PDT PLAME SUNAT (T-REGISTRO)
  // Líneas: RUC|período|tipo_reg|doc|sueldo_bruto|pension|essalud|...
  const lines = ['|VERSION|2.0|'];
  lines.push(`|EMPRESA_ID|${EMPRESA_ID}|`);
  lines.push(`|PERIODO|${periodo.periodo_inicio.slice(0,7).replace('-','')}|`);
  items.forEach((i, idx) => {
    lines.push([
      idx + 1,          // correlativo
      '04',             // tipo doc: 04=DNI
      '',               // número doc (no disponible en este sistema)
      i.agentes?.nombre ?? '',
      Number(i.sueldo_bruto).toFixed(2),
      Number(i.descuento_pension).toFixed(2),
      Number(i.essalud).toFixed(2),
      Number(i.cts_provision).toFixed(2),
      Number(i.gratificacion_provision).toFixed(2),
      Number(i.sueldo_neto_pago).toFixed(2),
    ].join('|'));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PDT_PLAME_${periodo.periodo_inicio.slice(0,7)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  toastExito('Archivo descargado');
}

/* ────────────────────────────────────────────────────────
   TAB: MOVIMIENTOS — adelantos, vales, descuentos, bonos
   ──────────────────────────────────────────────────────── */
async function renderMovimientos(el, hdr) {
  const { data: movs } = await supabase
    .from('movimientos_rrhh')
    .select(`id, tipo, monto, moneda, descripcion, fecha, descontado_en_periodo,
             agentes_emp:agente_id(nombre)`)
    .eq('empresa_id', EMPRESA_ID)
    .order('fecha', { ascending: false });

  hdr.innerHTML = `<button class="btn btn-primary" id="btn-nuevo-mov-rrhh">+ Registrar</button>`;
  const agentesEmp = await obtenerAgentesEmpresa();
  const colorTipo = { adelanto:'var(--color-warning)', vale:'var(--color-accent)',
    descuento:'var(--color-danger)', bono:'var(--color-success)' };

  el.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Empleado</th><th>Tipo</th><th>Monto</th><th>Fecha</th><th>Descripción</th><th>Descontado</th><th></th></tr></thead>
        <tbody>
          ${(movs ?? []).map(m => `<tr>
            <td><strong>${escapeHTML(m.agentes_emp?.nombre ?? '—')}</strong></td>
            <td><span style="font-size:var(--fs-xs);font-weight:700;color:${colorTipo[m.tipo]};text-transform:capitalize">${m.tipo}</span></td>
            <td style="font-weight:700">${m.moneda} ${Number(m.monto).toFixed(2)}</td>
            <td style="color:var(--text-tertiary)">${m.fecha}</td>
            <td style="color:var(--text-tertiary);font-size:var(--fs-sm)">${escapeHTML(m.descripcion ?? '—')}</td>
            <td style="text-align:center">${m.descontado_en_periodo ? '<span style="color:var(--color-success);font-size:var(--fs-xs);font-weight:700">✓ Descontado</span>' : '<span style="color:var(--text-tertiary);font-size:var(--fs-xs)">Pendiente</span>'}</td>
            <td>${!m.descontado_en_periodo ? `<button class="btn btn-sm btn-danger" data-eliminar-mov="${m.id}">✕</button>` : ''}</td>
          </tr>`).join('')}
          ${!movs?.length ? '<tr><td colspan="7" style="text-align:center;color:var(--text-tertiary)">Sin movimientos registrados</td></tr>' : ''}
        </tbody>
      </table>
    </div>

    <div class="modal-overlay" id="modal-mov-rrhh">
      <div class="modal">
        <div class="modal__header">
          <h3>Registrar movimiento RRHH</h3>
          <button class="btn-icon" data-close-modal>✕</button>
        </div>
        <form id="form-mov-rrhh">
          <div class="modal__body">
            <div class="form-group">
              <label class="form-label">Empleado *</label>
              <select class="form-control" id="mov-rrhh-agente" required>
                ${agentesEmp.map(a => `<option value="${a.id}">${escapeHTML(a.nombre)}</option>`).join('')}
              </select>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
              <div class="form-group">
                <label class="form-label">Tipo *</label>
                <select class="form-control" id="mov-rrhh-tipo" required>
                  <option value="adelanto">Adelanto</option>
                  <option value="vale">Vale</option>
                  <option value="descuento">Descuento</option>
                  <option value="bono">Bono</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Monto *</label>
                <input class="form-control" id="mov-rrhh-monto" type="number" step="0.01" min="0" required>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Fecha *</label>
              <input class="form-control" id="mov-rrhh-fecha" type="date" value="${new Date().toISOString().slice(0,10)}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Descripción</label>
              <input class="form-control" id="mov-rrhh-desc" placeholder="Detalle opcional">
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('btn-nuevo-mov-rrhh')?.addEventListener('click', () => {
    document.getElementById('form-mov-rrhh').reset();
    $('#mov-rrhh-fecha').value = new Date().toISOString().slice(0,10);
    abrirModal('modal-mov-rrhh');
  });

  el.addEventListener('click', async e => {
    const btn = e.target.closest('[data-eliminar-mov]');
    if (!btn) return;
    if (!await confirmar('¿Eliminar este movimiento?')) return;
    await supabase.from('movimientos_rrhh').delete().eq('id', btn.dataset.eliminarMov);
    toastExito('Eliminado');
    invalidar('movimientos');
    await cargarTab('movimientos');
  });

  document.getElementById('form-mov-rrhh')?.addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await supabase.from('movimientos_rrhh').insert({
      agente_id: $('#mov-rrhh-agente').value,
      empresa_id: EMPRESA_ID,
      tipo: $('#mov-rrhh-tipo').value,
      monto: parseFloat($('#mov-rrhh-monto').value),
      moneda: 'PEN',
      descripcion: $('#mov-rrhh-desc').value || null,
      fecha: $('#mov-rrhh-fecha').value,
      registrado_por: AGENTE.id,
    });
    if (error) { toastError('Error'); return; }
    toastExito('Movimiento registrado');
    cerrarModal('modal-mov-rrhh');
    invalidar('movimientos');
    await cargarTab('movimientos');
  });
}

/* ────────────────────────────────────────────────────────
   TAB: CERTIFICADOS MÉDICOS
   ──────────────────────────────────────────────────────── */
async function renderCertificados(el, hdr) {
  const { data: certs } = await supabase
    .from('certificados_medicos')
    .select(`id, fecha_inicio, fecha_fin, diagnostico, estado,
             agentes_emp:agente_id(nombre), aprobador:aprobado_por(nombre)`)
    .eq('empresa_id', EMPRESA_ID)
    .order('created_at', { ascending: false });

  hdr.innerHTML = '';
  const colorEst = { pendiente:'var(--color-warning)', aprobado:'var(--color-success)', rechazado:'var(--color-danger)' };

  el.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>Empleado</th><th>Período</th><th>Diagnóstico</th><th>Estado</th><th>Aprobado por</th><th></th></tr></thead>
        <tbody>
          ${(certs ?? []).map(c => `<tr>
            <td><strong>${escapeHTML(c.agentes_emp?.nombre ?? '—')}</strong></td>
            <td style="font-size:var(--fs-sm)">${c.fecha_inicio} → ${c.fecha_fin}</td>
            <td style="color:var(--text-tertiary);font-size:var(--fs-sm)">${escapeHTML(c.diagnostico ?? '—')}</td>
            <td><span style="font-size:var(--fs-xs);font-weight:700;color:${colorEst[c.estado]};text-transform:capitalize">${c.estado}</span></td>
            <td style="color:var(--text-tertiary);font-size:var(--fs-sm)">${escapeHTML(c.aprobador?.nombre ?? '—')}</td>
            <td>
              ${c.estado === 'pendiente' ? `
                <button class="btn btn-sm btn-primary" data-aprobar-cert="${c.id}">✓ Aprobar</button>
                <button class="btn btn-sm btn-danger" data-rechazar-cert="${c.id}" style="margin-left:4px">✕ Rechazar</button>` : ''}
            </td>
          </tr>`).join('')}
          ${!certs?.length ? '<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary)">Sin certificados</td></tr>' : ''}
        </tbody>
      </table>
    </div>`;

  el.addEventListener('click', async e => {
    const aprobar = e.target.closest('[data-aprobar-cert]');
    if (aprobar) {
      await supabase.from('certificados_medicos').update({ estado:'aprobado', aprobado_por: AGENTE.id, aprobado_en: new Date().toISOString() }).eq('id', aprobar.dataset.aprobarCert);
      toastExito('Certificado aprobado');
      invalidar('certificados'); await cargarTab('certificados');
    }
    const rechazar = e.target.closest('[data-rechazar-cert]');
    if (rechazar) {
      await supabase.from('certificados_medicos').update({ estado:'rechazado', aprobado_por: AGENTE.id }).eq('id', rechazar.dataset.rechazarCert);
      toastExito('Certificado rechazado');
      invalidar('certificados'); await cargarTab('certificados');
    }
  });
}

/* ────────────────────────────────────────────────────────
   TAB: EXTERNOS RH
   ──────────────────────────────────────────────────────── */
async function renderExternos(el, hdr) {
  const { data: externos } = await supabase
    .from('externos_rh')
    .select('*')
    .eq('activo', true)
    .order('nombre');

  const { data: recibos } = await supabase
    .from('recibos_honorarios')
    .select('*, externos_rh(nombre)')
    .eq('empresa_id', EMPRESA_ID)
    .order('fecha', { ascending: false })
    .limit(50);

  hdr.innerHTML = `
    <div style="display:flex;gap:var(--space-2)">
      <button class="btn btn-secondary" id="btn-nuevo-externo">+ Externo</button>
      <button class="btn btn-primary" id="btn-nuevo-rh">+ Recibo honorarios</button>
    </div>`;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-5)">
      <!-- Externos -->
      <div>
        <h3 style="font-size:var(--fs-sm);font-weight:700;color:var(--text-tertiary);margin-bottom:var(--space-3);text-transform:uppercase">Contratistas externos</h3>
        <div class="table-wrapper">
          <table class="data-table" style="font-size:var(--fs-sm)">
            <thead><tr><th>Nombre</th><th>RUC/DNI</th><th>Email</th></tr></thead>
            <tbody>
              ${(externos ?? []).map(e => `<tr>
                <td><strong>${escapeHTML(e.nombre)}</strong></td>
                <td style="color:var(--text-tertiary)">${escapeHTML(e.ruc ?? e.dni ?? '—')}</td>
                <td style="color:var(--text-tertiary)">${escapeHTML(e.email ?? '—')}</td>
              </tr>`).join('')}
              ${!externos?.length ? '<tr><td colspan="3" style="text-align:center;color:var(--text-tertiary)">Sin externos</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
      <!-- Recibos -->
      <div>
        <h3 style="font-size:var(--fs-sm);font-weight:700;color:var(--text-tertiary);margin-bottom:var(--space-3);text-transform:uppercase">Recibos de honorarios</h3>
        <div class="table-wrapper">
          <table class="data-table" style="font-size:var(--fs-sm)">
            <thead><tr><th>Externo</th><th>Monto</th><th>Fecha</th><th>Estado</th></tr></thead>
            <tbody>
              ${(recibos ?? []).map(r => `<tr>
                <td><strong>${escapeHTML(r.externos_rh?.nombre ?? '—')}</strong><br>
                  <span style="color:var(--text-tertiary)">${escapeHTML(r.concepto)}</span></td>
                <td style="font-weight:700">${r.moneda} ${Number(r.monto).toFixed(2)}</td>
                <td style="color:var(--text-tertiary)">${r.fecha}</td>
                <td>${r.pagado ? '<span style="color:var(--color-success);font-size:var(--fs-xs);font-weight:700">Pagado</span>' : '<span style="color:var(--color-warning);font-size:var(--fs-xs);font-weight:700">Pendiente</span>'}</td>
              </tr>`).join('')}
              ${!recibos?.length ? '<tr><td colspan="4" style="text-align:center;color:var(--text-tertiary)">Sin recibos</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Modal externo -->
    <div class="modal-overlay" id="modal-externo">
      <div class="modal">
        <div class="modal__header"><h3>Nuevo externo RH</h3><button class="btn-icon" data-close-modal>✕</button></div>
        <form id="form-externo">
          <div class="modal__body">
            <div class="form-group"><label class="form-label">Nombre *</label><input class="form-control" id="ext-nombre" required></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
              <div class="form-group"><label class="form-label">RUC</label><input class="form-control" id="ext-ruc"></div>
              <div class="form-group"><label class="form-label">DNI</label><input class="form-control" id="ext-dni"></div>
            </div>
            <div class="form-group"><label class="form-label">Email</label><input class="form-control" id="ext-email" type="email"></div>
            <div class="form-group"><label class="form-label">Teléfono</label><input class="form-control" id="ext-tel"></div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Crear</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal recibo honorarios -->
    <div class="modal-overlay" id="modal-rh">
      <div class="modal">
        <div class="modal__header"><h3>Nuevo recibo de honorarios</h3><button class="btn-icon" data-close-modal>✕</button></div>
        <form id="form-rh">
          <div class="modal__body">
            <div class="form-group">
              <label class="form-label">Contratista externo *</label>
              <select class="form-control" id="rh-externo" required>
                ${(externos ?? []).map(e => `<option value="${e.id}">${escapeHTML(e.nombre)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Concepto *</label><input class="form-control" id="rh-concepto" required></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
              <div class="form-group"><label class="form-label">Monto *</label><input class="form-control" id="rh-monto" type="number" step="0.01" required></div>
              <div class="form-group">
                <label class="form-label">Moneda</label>
                <select class="form-control" id="rh-moneda"><option value="PEN">PEN</option><option value="USD">USD</option></select>
              </div>
            </div>
            <div class="form-group"><label class="form-label">Fecha *</label><input class="form-control" id="rh-fecha" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>
            <div class="form-group"><label class="form-label">N° Recibo</label><input class="form-control" id="rh-numero" placeholder="Ej. RH-2024-001"></div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="btn btn-primary">Registrar</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('btn-nuevo-externo')?.addEventListener('click', () => {
    document.getElementById('form-externo').reset(); abrirModal('modal-externo');
  });
  document.getElementById('btn-nuevo-rh')?.addEventListener('click', () => {
    document.getElementById('form-rh').reset();
    $('#rh-fecha').value = new Date().toISOString().slice(0,10);
    abrirModal('modal-rh');
  });
  document.getElementById('form-externo')?.addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await supabase.from('externos_rh').insert({
      nombre: $('#ext-nombre').value,
      ruc: $('#ext-ruc').value || null,
      dni: $('#ext-dni').value || null,
      email: $('#ext-email').value || null,
      telefono: $('#ext-tel').value || null,
    });
    if (error) { toastError('Error'); return; }
    toastExito('Externo creado');
    cerrarModal('modal-externo');
    invalidar('externos'); await cargarTab('externos');
  });
  document.getElementById('form-rh')?.addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await supabase.from('recibos_honorarios').insert({
      externo_id: $('#rh-externo').value,
      empresa_id: EMPRESA_ID,
      concepto: $('#rh-concepto').value,
      monto: parseFloat($('#rh-monto').value),
      moneda: $('#rh-moneda').value,
      fecha: $('#rh-fecha').value,
      numero_rh: $('#rh-numero').value || null,
    });
    if (error) { toastError('Error'); return; }
    toastExito('Recibo registrado');
    cerrarModal('modal-rh');
    invalidar('externos'); await cargarTab('externos');
  });
}

/* ── HELPERS ────────────────────────────────────────────── */
async function obtenerAgentesEmpresa() {
  const { data } = await supabase
    .from('agentes_empresas')
    .select('agente_id, agentes(id, nombre)')
    .eq('empresa_id', EMPRESA_ID)
    .eq('estado', 'activo');
  return (data ?? []).map(r => r.agentes).filter(Boolean).sort((a,b) => a.nombre.localeCompare(b.nombre));
}

init();
