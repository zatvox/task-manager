import { renderLayout } from './layout.js';
import { inicializarApp, toastExito, toastError, confirmar, alternarTema } from './main.js';
import { obtenerEmpresa, actualizarEmpresa, eliminarEmpresa, actualizarPerfilAgente, subirFotoPerfil } from './supabase-data.js';
import { actualizarPassword } from './auth.js';
import { $, escapeHTML, iniciales } from './utils.js';

let AGENTE, EMPRESA_ID;

function plantilla(empresa) {
  return `
    <div class="page-header"><div><h1>Configuración</h1><p class="page-header__subtitle">Administra tu empresa, tu perfil y tus preferencias.</p></div></div>

    <div class="tabs">
      <div class="tab active" data-tab="perfil">Mi perfil</div>
      <div class="tab" data-tab="empresa">Empresa</div>
      <div class="tab" data-tab="preferencias">Preferencias</div>
    </div>

    <div id="tab-perfil" class="card" style="max-width:560px;">
      <div style="display:flex; align-items:center; gap:var(--space-4); margin-bottom:var(--space-5);">
        <div class="avatar" style="width:64px;height:64px;font-size:var(--fs-lg);" id="avatar-preview">${AGENTE.foto_url ? `<img src="${AGENTE.foto_url}" alt="" />` : iniciales(AGENTE.nombre)}</div>
        <div>
          <input type="file" id="input-foto" accept="image/*" style="display:none;" />
          <button class="btn btn-secondary btn-sm" id="btn-subir-foto">Cambiar foto</button>
        </div>
      </div>
      <form id="form-perfil">
        <div class="form-group"><label class="form-label">Nombre</label><input class="form-control" id="p-nombre" value="${escapeHTML(AGENTE.nombre)}" required /></div>
        <div class="form-group"><label class="form-label">Correo</label><input class="form-control" value="${escapeHTML(AGENTE.email)}" disabled /></div>
        <div class="form-group"><label class="form-label">Teléfono</label><input class="form-control" id="p-telefono" value="${escapeHTML(AGENTE.telefono || '')}" /></div>
        <button type="submit" class="btn btn-primary">Guardar perfil</button>
      </form>
      <hr style="border-color:var(--border-subtle); margin:var(--space-5) 0;" />
      <form id="form-password">
        <div class="form-group"><label class="form-label">Nueva contraseña</label><input class="form-control" type="password" id="p-password" minlength="6" placeholder="Mínimo 6 caracteres" /></div>
        <button type="submit" class="btn btn-secondary">Actualizar contraseña</button>
      </form>
    </div>

    <div id="tab-empresa" class="card" style="display:none; max-width:560px;">
      ${empresa ? `
      <form id="form-empresa-config">
        <div class="form-group"><label class="form-label">Nombre de la empresa</label><input class="form-control" id="e-nombre" value="${escapeHTML(empresa.nombre)}" required /></div>
        <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-control" id="e-descripcion">${escapeHTML(empresa.descripcion || '')}</textarea></div>
        <button type="submit" class="btn btn-primary">Guardar cambios</button>
      </form>
      <hr style="border-color:var(--border-subtle); margin:var(--space-5) 0;" />
      <p style="font-size:var(--fs-sm); color:var(--text-secondary); margin-bottom:var(--space-3);">Eliminar la empresa borrará también todos sus departamentos, proyectos y tareas.</p>
      <button class="btn btn-danger" id="btn-eliminar-empresa">Eliminar empresa</button>
      ` : '<p style="color:var(--text-tertiary);">Selecciona una empresa donde seas admin para editarla.</p>'}
    </div>

    <div id="tab-preferencias" class="card" style="display:none; max-width:560px;">
      <div class="form-group">
        <label class="form-label">Tema de la interfaz</label>
        <button class="btn btn-secondary" id="btn-cambiar-tema">🌓 Alternar tema claro / oscuro</button>
      </div>
      <div class="form-group">
        <label class="form-label">Notificaciones</label>
        <label class="checkbox-row" style="margin-bottom:var(--space-2);"><input type="checkbox" id="pref-toast" checked /> Mostrar notificaciones tipo toast en la app</label>
        <label class="checkbox-row" style="margin-bottom:var(--space-2);"><input type="checkbox" id="pref-email" checked /> Recibir notificaciones por correo (próximamente)</label>
      </div>
      <button class="btn btn-primary" id="btn-guardar-prefs">Guardar preferencias</button>
    </div>
  `;
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    ['perfil', 'empresa', 'preferencias'].forEach((id) => { document.getElementById('tab-' + id).style.display = id === tab.dataset.tab ? 'block' : 'none'; });
  }));
}

async function init() {
  renderLayout('configuracion');
  const ctx = await inicializarApp();
  if (!ctx) return;
  AGENTE = ctx.agente; EMPRESA_ID = ctx.empresaId;
  const empresa = EMPRESA_ID ? await obtenerEmpresa(EMPRESA_ID) : null;
  document.getElementById('main-content').innerHTML = plantilla(empresa);
  bindTabs();

  $('#btn-subir-foto').addEventListener('click', () => $('#input-foto').click());
  $('#input-foto').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { const url = await subirFotoPerfil(AGENTE.id, file); $('#avatar-preview').innerHTML = `<img src="${url}" alt="" />`; toastExito('Foto actualizada.'); }
    catch (err) { toastError('No se pudo subir la foto. Verifica que el bucket "avatares" exista en Supabase Storage.'); }
  });

  $('#form-perfil').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await actualizarPerfilAgente(AGENTE.id, { nombre: $('#p-nombre').value.trim(), telefono: $('#p-telefono').value.trim() }); toastExito('Perfil actualizado.'); }
    catch (err) { toastError(err.message); }
  });

  $('#form-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = $('#p-password').value;
    if (pass.length < 6) return toastError('La contraseña debe tener al menos 6 caracteres.');
    try { await actualizarPassword(pass); toastExito('Contraseña actualizada.'); $('#p-password').value = ''; }
    catch (err) { toastError(err.message); }
  });

  $('#form-empresa-config')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await actualizarEmpresa(EMPRESA_ID, { nombre: $('#e-nombre').value.trim(), descripcion: $('#e-descripcion').value.trim() }); toastExito('Empresa actualizada.'); }
    catch (err) { toastError(err.message); }
  });

  $('#btn-eliminar-empresa')?.addEventListener('click', async () => {
    const ok = await confirmar({ titulo: 'Eliminar empresa', mensaje: 'Esta acción eliminará TODOS los datos asociados. No se puede deshacer.', peligro: true, textoConfirmar: 'Eliminar definitivamente' });
    if (!ok) return;
    try { await eliminarEmpresa(EMPRESA_ID); toastExito('Empresa eliminada.'); window.location.href = 'empresas.html'; }
    catch (err) { toastError(err.message); }
  });

  $('#btn-cambiar-tema').addEventListener('click', alternarTema);
  $('#btn-guardar-prefs').addEventListener('click', async () => {
    try {
      await actualizarPerfilAgente(AGENTE.id, { preferencias_notificaciones: { toast: $('#pref-toast').checked, email: $('#pref-email').checked } });
      toastExito('Preferencias guardadas.');
    } catch (err) { toastError(err.message); }
  });
}

init();
