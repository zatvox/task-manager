/**
 * ============================================================================
 * ZV TASK MANAGER · GESTIÓN DE AUTENTICACIÓN
 * ============================================================================
 */
import { supabase } from './supabase-client.js';
import { CONFIG } from './config.js';

// URL de login en producción — destino de los emails de confirmación y recovery.
// Siempre apunta a GitHub Pages para que cualquier usuario (en cualquier red)
// pueda hacer clic en el link y llegar al sistema real.
const LOGIN_URL = `${CONFIG.APP_URL}/pages/login.html`;
import { cacheLocal } from './utils.js';

export async function registrarAgente({ email, password, nombre, telefono }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nombre, telefono },
      // Siempre redirigir a producción — así el link funciona para cualquier
      // usuario desde cualquier dispositivo/red, no solo desde localhost.
      emailRedirectTo: LOGIN_URL
    }
  });
  if (error) throw error;
  return data;
}

export async function iniciarSesion({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function cerrarSesion() {
  const { error } = await supabase.auth.signOut();
  cacheLocal.clear(CONFIG.STORAGE_KEYS.EMPRESA_ACTIVA);
  if (error) throw error;
  
  // Navegar a login: detecta si estamos en /pages/ o en raíz
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const isInPages = pathSegments[pathSegments.length - 1] !== 'index.html' && 
                    pathSegments.some(s => s === 'pages');
  
  window.location.href = isInPages ? './login.html' : './pages/login.html';
}

export async function solicitarRecuperacionPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: LOGIN_URL
  });
  if (error) throw error;
}

export async function actualizarPassword(nuevaPassword) {
  const { error } = await supabase.auth.updateUser({ password: nuevaPassword });
  if (error) throw error;
}

export async function obtenerSesionActual() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function obtenerAgenteActual() {
  const sesion = await obtenerSesionActual();
  if (!sesion) return null;
  const { data, error } = await supabase
    .from('agentes')
    .select('*')
    .eq('id', sesion.user.id)
    .single();
  if (error) {
    console.error('Error obteniendo perfil de agente:', error);
    return null;
  }
  return data;
}

/**
 * Protege una página: redirige a login.html si no hay sesión activa.
 * Llamar al inicio de cada página protegida.
 */
export async function protegerPagina() {
  const sesion = await obtenerSesionActual();
  if (!sesion) {
    const base = window.location.pathname.includes('/pages/') ? '' : 'pages/';
    window.location.href = base + 'login.html';
    return null;
  }
  return sesion;
}

export function escucharCambiosAuth(callback) {
  return supabase.auth.onAuthStateChange((event, session) => callback(event, session));
}
