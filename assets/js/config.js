/**
 * ============================================================================
 * ZV TASK MANAGER · CONFIGURACIÓN
 * ============================================================================
 * Reemplaza estos valores por los de tu proyecto Supabase real.
 * Estas claves son seguras para exponer en frontend público (GitHub Pages)
 * SIEMPRE que uses la "anon key" (NUNCA la service_role key).
 * Ver SETUP.md para instrucciones paso a paso.
 */

export const CONFIG = {
  SUPABASE_URL: 'https://ishwabioqxdpbldcxpwc.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzaHdhYmlvcXhkcGJsZGN4cHdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NjExMTQsImV4cCI6MjA5NDMzNzExNH0.TtzSkl4_O9rU69vckQhtpZOFtL_LxqdQX0DhBHddBDU',

  APP_NAME: 'ZV Task Manager',
  APP_VERSION: '1.0.0',

  // Paginación
  PAGE_SIZE_TAREAS: 25,
  PAGE_SIZE_HISTORIAL: 20,
  PAGE_SIZE_NOTIFICACIONES: 30,

  // Caché local (ms)
  CACHE_TTL_TAREAS: 5 * 60 * 1000,
  CACHE_TTL_EMPRESA: 30 * 60 * 1000,
  CACHE_TTL_AGENTES: 30 * 60 * 1000,

  // Generación de instancias de recordatorios (días hacia adelante)
  DIAS_GENERACION_RECORDATORIOS: 90,

  // Claves de localStorage
  STORAGE_KEYS: {
    SESSION: 'zv_session',
    EMPRESA_ACTIVA: 'zv_empresa_activa',
    TEMA: 'zv_tema',
    SIDEBAR_COLLAPSED: 'zv_sidebar_collapsed',
    INDICADOR_CALENDARIO: 'zv_indicador_calendario'
  }
};
