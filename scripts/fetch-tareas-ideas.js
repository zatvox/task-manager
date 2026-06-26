/**
 * fetch-tareas-ideas.js
 * Consulta las tareas del proyecto "Mejoras y Nuevos proyectos Website Pages"
 * en Supabase y guarda el resultado en data/tareas-ideas.json
 *
 * Uso local:  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/fetch-tareas-ideas.js
 * En Actions: las variables vienen de GitHub Secrets
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_KEY; // service_role key (bypass RLS)
const PROYECTO_NOMBRE   = process.env.PROYECTO_NOMBRE || 'Mejoras y Nuevos proyectos Website Pages';
const OUTPUT_FILE       = join(__dirname, '..', 'data', 'tareas-ideas.json');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan variables: SUPABASE_URL y SUPABASE_SERVICE_KEY son requeridas.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

async function main() {
  console.log(`🔍 Buscando proyecto: "${PROYECTO_NOMBRE}"...`);

  // 1. Buscar el proyecto por nombre exacto
  const { data: proyectos, error: ep } = await supabase
    .from('proyectos')
    .select('id, nombre, descripcion, estado, empresa_id, empresa:empresas(nombre)')
    .ilike('nombre', `%${PROYECTO_NOMBRE}%`)
    .limit(5);

  if (ep) { console.error('❌ Error buscando proyecto:', ep.message); process.exit(1); }
  if (!proyectos?.length) { console.error('❌ Proyecto no encontrado.'); process.exit(1); }

  const proyecto = proyectos[0];
  console.log(`✅ Proyecto encontrado: "${proyecto.nombre}" (${proyecto.empresa?.nombre})`);

  // 2. Obtener todas las tareas del proyecto
  const { data: tareas, error: et } = await supabase
    .from('tareas')
    .select('id, titulo, descripcion, estado, prioridad, fecha_cierre, created_at')
    .eq('proyecto_id', proyecto.id)
    .order('created_at', { ascending: true });

  if (et) { console.error('❌ Error consultando tareas:', et.message); process.exit(1); }

  console.log(`📋 ${tareas?.length ?? 0} tareas encontradas.`);

  // 3. Guardar resultado
  const output = {
    proyecto: {
      id: proyecto.id,
      nombre: proyecto.nombre,
      descripcion: proyecto.descripcion,
      estado: proyecto.estado,
      empresa: proyecto.empresa?.nombre
    },
    tareas: tareas ?? [],
    sync_at: new Date().toISOString()
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`💾 Guardado en: data/tareas-ideas.json`);
  console.log('\n=== TAREAS ===');
  (tareas ?? []).forEach((t, i) => {
    console.log(`\n[${i + 1}] ${t.titulo} (${t.estado} / ${t.prioridad})`);
    if (t.descripcion) console.log(`    ${t.descripcion}`);
  });
}

main().catch((e) => { console.error('❌ Error inesperado:', e.message); process.exit(1); });
