# Cambios en Supabase — ZV Task Manager
## Documento de referencia para el proyecto ERP en el mismo proyecto Supabase

---

## Contexto del problema

Ambos proyectos (ZV Task Manager y ERP Contable) comparten el **mismo proyecto Supabase** (proyecto `ishwabioqxdpbldcxpwc`). Al ejecutar los SQL del Task Manager se crearon nuevos tipos ENUM, tablas, funciones, triggers y políticas RLS en el schema `public`. Esto puede haber causado que el cache de esquema de PostgREST se invalide, o que políticas RLS activas ahora bloqueen tablas del ERP que antes no las tenían.

**El error del ERP** `Could not find the table 'public.purchase_orders' in the schema cache` puede tener dos causas:
1. PostgREST necesita recargar su cache de esquema (solución rápida: ir a Supabase Dashboard → Settings → API → "Reload schema cache" o simplemente esperar ~30s).
2. La tabla `purchase_orders` del ERP no tiene políticas RLS habilitadas y el cliente JS del ERP usa el rol `authenticated` (no `service_role`), por lo que PostgREST ahora la oculta del cache si no tiene al menos una política.

---

## 1. Tablas creadas en `public` por el Task Manager

Todas las tablas siguientes son del proyecto Task Manager. **El ERP no debe tener tablas con estos nombres** para evitar conflictos:

| Tabla | Descripción |
|---|---|
| `agentes` | Perfil de usuario. `id` referencia `auth.users(id)` con CASCADE. |
| `empresas` | Organización/empresa. Tiene columna `visible boolean` (agregada en migración 004). |
| `agentes_empresas` | Membresías agente↔empresa (junction). Unique en `(agente_id, empresa_id)`. |
| `departamentos` | Departamento dentro de una empresa. |
| `agentes_departamentos` | Membresías agente↔departamento. Unique en `(agente_id, departamento_id)`. |
| `proyectos` | Proyecto dentro de una empresa/departamento. |
| `miembros_proyectos` | Membresías agente↔proyecto. |
| `departamentos_proyectos` | Relación departamento↔proyecto. |
| `tareas` | Tarea asignada a un proyecto/departamento. |
| `agentes_tareas` | Asignación agente↔tarea con estado individual. |
| `comentarios_tareas` | Comentarios en tareas. |
| `historial_tareas` | Log de cambios de estado de tareas. |
| `recordatorios_cronologicos` | Recordatorios recurrentes (diario/semanal/mensual). |
| `instancias_recordatorios` | Instancias individuales de un recordatorio. |
| `notificaciones` | Notificaciones del sistema. |

---

## 2. Tipos ENUM creados en `public`

El Task Manager crea los siguientes tipos en el schema `public`. Si el ERP tiene tipos con el mismo nombre, habrá conflicto:

```sql
estado_agente         -- 'activo', 'inactivo', 'suspendido'
rol_empresa           -- 'admin', 'manager', 'empleado'
estado_membresia      -- 'activo', 'inactivo'
estado_proyecto       -- 'activo', 'pausado', 'completado', 'archivado'
rol_proyecto          -- 'owner', 'manager', 'miembro'
estado_tarea          -- 'nuevo', 'en_progreso', 'en_revision', 'completado', 'archivado'
prioridad_tarea       -- 'baja', 'normal', 'alta', 'critica'
frecuencia_recordatorio -- 'diaria', 'semanal', 'mensual'
estado_agente_tarea   -- 'pendiente', 'en_progreso', 'completado', 'rechazada'
estado_recordatorio   -- 'activo', 'pausado', 'inactivo'
estado_instancia      -- 'pendiente', 'completado', 'omitido'
tipo_notificacion     -- 'tarea_asignada', 'tarea_comentada', 'vencimiento', ...
```

---

## 3. Trigger en `auth.users` — IMPACTO CRÍTICO

El Task Manager registra un **trigger AFTER INSERT** en la tabla `auth.users`:

```sql
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.agentes (id, email, nombre)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
```

**⚠️ Impacto para el ERP:** Cada vez que se crea un usuario en el ERP (via `supabase.auth.signUp`), este trigger se dispara e inserta un registro en `public.agentes`. Esto es transparente (usa `ON CONFLICT DO NOTHING`), pero si el ERP valida que `auth.users` sea la única fuente de usuarios, debe saber que ahora cada nuevo usuario también se crea en `agentes`.

---

## 4. Funciones RLS creadas en `public`

Las siguientes funciones `SECURITY DEFINER` existen en el schema `public` y son utilizadas por las políticas RLS. El ERP NO las necesita pero deben coexistir:

```sql
es_admin_empresa(uuid)           -- true si el usuario es admin en agentes_empresas
es_manager_o_admin_empresa(uuid) -- true si es admin o manager
es_miembro_empresa(uuid)         -- true si tiene membresía activa
es_miembro_proyecto(uuid)        -- true si está en miembros_proyectos o agentes_departamentos
es_primera_membresia(uuid)       -- true si no hay ningún miembro en esa empresa aún
set_updated_at()                 -- trigger function para updated_at automático
handle_new_auth_user()           -- trigger function para crear agente al registrarse
```

---

## 5. Row Level Security (RLS) — Estado actual

El Task Manager habilitó RLS en TODAS sus tablas. Las tablas del ERP que NO tienen RLS habilitada deberían seguir funcionando normalmente con el `service_role` key.

**⚠️ Problema potencial:** Si el ERP usa la `anon` key o la `authenticated` key (JWT de usuario) para consultar tablas **sin RLS habilitada**, Supabase permite el acceso. Pero si la tabla tiene RLS habilitada sin ninguna política permisiva, el acceso es denegado a todos salvo al `service_role`.

**Solución para el ERP si `purchase_orders` tiene RLS:** Verificar en Supabase Dashboard → Authentication → Policies si `purchase_orders` aparece con RLS habilitada. Si lo está y no tiene políticas, agregar:

```sql
-- Opción A: acceso total a autenticados (igual que el ERP hacía antes)
CREATE POLICY "erp_purchase_orders_todos" ON purchase_orders
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Opción B: usar service_role key en el cliente JS del ERP (bypasea RLS)
-- En supabase-client.js del ERP: usar SUPABASE_SERVICE_KEY en vez de SUPABASE_ANON_KEY
```

---

## 6. Migraciones ejecutadas (cronológico)

| Archivo | Qué hace |
|---|---|
| `schema.sql` | Crea todos los tipos, tablas, índices, triggers |
| `rls-policies.sql` | Habilita RLS en todas las tablas del Task Manager y crea todas las políticas |
| `002_grants.sql` | `GRANT SELECT, INSERT, UPDATE, DELETE` en todas las tablas TM al rol `authenticated`. `GRANT EXECUTE` en todas las funciones RLS helper. |
| `003_empresas_visibles.sql` | Reemplaza política SELECT en `empresas` para que cualquier usuario autenticado pueda ver empresas (no solo miembros) |
| `004_empresa_visible_autounion.sql` | Agrega columna `visible boolean DEFAULT true` a `empresas`. Permite auto-unión. Reemplaza políticas SELECT e INSERT en `empresas` y `agentes_empresas`. |
| `005_grants_funciones.sql` | Garantiza `GRANT EXECUTE` en todas las funciones helper (idempotente) |

---

## 7. Cómo interactúa el Task Manager con Supabase

### `supabase-client.js`
```javascript
// Inicialización estándar con anon key
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```
El cliente usa la `anon key` + JWT del usuario autenticado. **Nunca usa la service_role key**. Todas las queries pasan por RLS.

### `auth.js`
- `supabase.auth.signUp({ email, password, options: { data: { nombre, telefono }, emailRedirectTo: LOGIN_URL } })`
  - Crea usuario en `auth.users` → trigger auto-crea registro en `public.agentes`
  - `emailRedirectTo` apunta a `https://zatvox.github.io/task-manager/pages/login.html`
- `supabase.auth.signInWithPassword({ email, password })`
- `supabase.auth.signOut()`
- `supabase.auth.resetPasswordForEmail(email, { redirectTo: LOGIN_URL })`
- `supabase.auth.getSession()` — para verificar sesión activa
- `supabase.auth.onAuthStateChange(callback)` — para escuchar cambios de sesión

### `supabase-data.js` — Patrones de query

**SELECT simple:**
```javascript
supabase.from('tareas').select('*, proyecto:proyectos(nombre)').eq('empresa_id', id)
```

**INSERT sin RETURNING (patrón para evitar RLS en RETURNING):**
```javascript
// No usar .select() después de insert cuando el usuario no tiene SELECT en la fila recién creada
const { error } = await supabase.from('empresas').insert({ id: uuid, ... })
// Luego SELECT separado:
const { data } = await supabase.from('empresas').select('*').eq('id', uuid).single()
```

**UPDATE sin RETURNING:**
```javascript
const { error } = await supabase.from('departamentos').update(cambios).eq('id', id)
// Luego SELECT separado si se necesita la fila actualizada
```

**JOIN via PostgREST embed:**
```javascript
// Relación directa:
.select('*, agente:agentes(id, nombre, email)')
// Relación inversa o con alias:
.select('*, empresa:empresas!inner(*)')
```

---

## 8. Recomendación inmediata para el ERP

El error `Could not find the table 'public.purchase_orders' in the schema cache` normalmente se resuelve con:

1. **Recargar el cache PostgREST:** Supabase Dashboard → Settings → API → botón "Reload schema cache" (o reiniciar el API desde el Dashboard).

2. **Verificar que `purchase_orders` exista en `public`:** En el SQL Editor ejecutar:
   ```sql
   SELECT table_schema, table_name FROM information_schema.tables
   WHERE table_name = 'purchase_orders';
   ```

3. **Si tiene RLS habilitada sin políticas:** Agregar una política permisiva para el rol `authenticated` (ver sección 5).

4. **Si el ERP usa `auth.users` directamente (sin `public.agentes`):** El trigger `handle_new_auth_user` NO interfiere con el acceso a `auth.users` desde el cliente; solo inserta en `agentes` que es una tabla pública del Task Manager.

5. **Separación futura recomendada:** Si ambos proyectos crecen, considerar moverlos a proyectos Supabase separados o usar schemas diferentes (`task_manager.tablas` vs `erp.tablas`) para evitar colisiones de nombres.
