import { registrarAgente } from './auth.js';
import { $, validarEmail } from './utils.js';

// ============================================================
// Tiempo de espera hasta la próxima hora en punto
// ============================================================
function minutosHastaProximaHora() {
  const ahora = new Date();
  return 60 - ahora.getMinutes();
}

function mensajeRateLimit() {
  const minutos = minutosHastaProximaHora();
  return (
    '⚠️ Límite de registros alcanzado.\n\n' +
    'Supabase permite solo 2 registros por hora con el proveedor de email integrado (plan gratuito).\n\n' +
    `⏳ Tiempo estimado de espera: ~${minutos} minuto${minutos !== 1 ? 's' : ''} (hasta la próxima hora).\n\n` +
    'Para eliminar este límite: configura un SMTP propio en Supabase Dashboard → Authentication → SMTP Settings.'
  );
}

function setError(input, mostrar) {
  input.closest('.form-group').classList.toggle('has-error', mostrar);
}

// Mostrar un banner de error en la página en lugar de solo un alert
function mostrarBannerError(mensaje) {
  let banner = document.getElementById('registro-error-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'registro-error-banner';
    banner.style.cssText = [
      'background: rgba(255,51,102,0.12)',
      'border: 1px solid var(--color-danger)',
      'border-radius: var(--radius-md)',
      'color: var(--color-danger)',
      'font-size: var(--fs-sm)',
      'line-height: 1.6',
      'padding: var(--space-4)',
      'margin-bottom: var(--space-4)',
      'white-space: pre-line'
    ].join(';');
    const form = $('#form-registro');
    form.parentNode.insertBefore(banner, form);
  }
  banner.textContent = mensaje;
  banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function ocultarBannerError() {
  const banner = document.getElementById('registro-error-banner');
  if (banner) banner.remove();
}

const form = $('#form-registro');
const btn = $('#btn-registro');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  ocultarBannerError();

  const nombre = $('#nombre').value.trim();
  const email = $('#email').value.trim();
  const telefono = $('#telefono').value.trim();
  const password = $('#password').value;
  let valido = true;

  if (!nombre) { setError($('#nombre'), true); valido = false; } else setError($('#nombre'), false);
  if (!validarEmail(email)) { setError($('#email'), true); valido = false; } else setError($('#email'), false);
  if (password.length < 6) { setError($('#password'), true); valido = false; } else setError($('#password'), false);
  if (!valido) return;

  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Creando cuenta…';
  try {
    await registrarAgente({ email, password, nombre, telefono });
    alert('Cuenta creada. Revisa tu correo si se requiere confirmación, luego inicia sesión.');
    window.location.href = 'login.html';
  } catch (err) {
    const esRateLimit =
      err.message?.toLowerCase().includes('rate limit') ||
      err.message?.toLowerCase().includes('email rate limit') ||
      err.status === 429;

    const mensaje = esRateLimit
      ? mensajeRateLimit()
      : 'No se pudo crear la cuenta: ' + (err.message || 'Error desconocido.');

    mostrarBannerError(mensaje);
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Crear cuenta';
  }
});
