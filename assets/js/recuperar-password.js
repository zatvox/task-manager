import { solicitarRecuperacionPassword } from './auth.js';
import { $, validarEmail } from './utils.js';

$('#form-recuperar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim();
  const grupo = $('#email').closest('.form-group');
  if (!validarEmail(email)) { grupo.classList.add('has-error'); return; }
  grupo.classList.remove('has-error');

  try {
    await solicitarRecuperacionPassword(email);
    alert('Si el correo existe, te enviamos un enlace para restablecer tu contraseña.');
  } catch (err) {
    alert('Ocurrió un error: ' + (err.message || ''));
  }
});
