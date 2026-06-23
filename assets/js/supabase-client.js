/**
 * ============================================================================
 * ZV TASK MANAGER · CLIENT LAYER
 * Inicialización Supabase (singleton). Toda la app importa desde aquí.
 * ============================================================================
 */
import { CONFIG } from './config.js';

// El SDK de Supabase se carga vía CDN en cada HTML:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
// Esto expone window.supabase con el método createClient.

let _client = null;

export function getSupabaseClient() {
  if (_client) return _client;

  if (typeof window === 'undefined' || !window.supabase) {
    throw new Error(
      'El SDK de Supabase no está cargado. Verifica que el <script> de @supabase/supabase-js esté antes de tus módulos JS.'
    );
  }

  _client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: CONFIG.STORAGE_KEYS.SESSION
    }
  });

  return _client;
}

export const supabase = new Proxy({}, {
  get(_target, prop) {
    return getSupabaseClient()[prop];
  }
});
