import { iniciarSesion, obtenerSesionActual } from './auth.js';
import { $, validarEmail } from './utils.js';

function setError(input, mostrar) {
  input.closest('.form-group').classList.toggle('has-error', mostrar);
}

async function init() {
  const sesion = await obtenerSesionActual();
  if (sesion) { window.location.href = '../index.html'; return; }

  const form = $('#form-login');
  const btn = $('#btn-login');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim();
    const password = $('#password').value;
    let valido = true;

    if (!validarEmail(email)) { setError($('#email'), true); valido = false; } else setError($('#email'), false);
    if (password.length < 6) { setError($('#password'), true); valido = false; } else setError($('#password'), false);
    if (!valido) return;

    btn.disabled = true;
    btn.querySelector('.btn-text').textContent = 'Ingresando…';
    try {
      await iniciarSesion({ email, password });
      window.location.href = '../index.html';
    } catch (err) {
      alert('No se pudo iniciar sesión: ' + (err.message || 'verifica tus credenciales.'));
      btn.disabled = false;
      btn.querySelector('.btn-text').textContent = 'Iniciar sesión';
    }
  });
}

init();
