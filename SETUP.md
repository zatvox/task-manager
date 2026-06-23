# SETUP — Guía de configuración inicial

Sigue estos pasos en orden. Tiempo estimado: 15-20 minutos.

## 1. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta (gratis).
2. Click en **New Project**. Elige nombre (ej. `zv-task-manager`), contraseña de base de datos (guárdala) y región más cercana (ej. `South America (São Paulo)`).
3. Espera 1-2 minutos a que el proyecto termine de aprovisionarse.

## 2. Ejecutar el SQL del sistema

1. En el panel de Supabase, ve a **SQL Editor** → **New query**.
2. Copia y pega el contenido completo de `assets/sql/schema.sql`. Ejecuta (▶ Run).
3. Repite el paso anterior con `assets/sql/rls-policies.sql`.
4. (Opcional, solo para pruebas) Crea al menos un usuario real desde **Authentication → Users → Add user** o regístrate desde la app. Luego edita `assets/sql/seed.sql`, reemplaza los UUID de ejemplo por IDs reales (`select id, email from auth.users;`), y ejecútalo si quieres datos de prueba.

> ⚠️ Ejecuta los archivos en este orden exacto: `schema.sql` → `rls-policies.sql` → (opcional) `seed.sql`. El orden importa porque las políticas RLS dependen de que las tablas ya existan.

## 3. Crear el bucket de Storage para fotos de perfil

1. Ve a **Storage** → **New bucket**.
2. Nombre: `avatares`. Marca como **Public bucket** (para que las fotos se vean sin firmar URLs).
3. Click **Create bucket**.

## 4. Obtener tus credenciales

1. Ve a **Project Settings** (ícono de engranaje) → **API**.
2. Copia el **Project URL** y la clave **anon public**.
3. Abre `assets/js/config.js` en este proyecto y reemplaza:
   ```js
   SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
   SUPABASE_ANON_KEY: 'TU_SUPABASE_ANON_KEY_AQUI',
   ```
   por tus valores reales.

> 🔒 La "anon key" es segura de publicar en un repositorio público porque las políticas RLS controlan exactamente qué puede leer/escribir cada usuario. **Nunca** uses la `service_role` key en el frontend.

## 5. Probar localmente

Los módulos ES (`type="module"`) no funcionan abriendo el HTML directo con `file://`. Usa un servidor estático:

```bash
# Opción A — con Node (sin instalar nada globalmente)
npx serve .

# Opción B — con Python
python3 -m http.server 8080

# Opción C — extensión "Live Server" de VS Code (click derecho > Open with Live Server)
```

Abre la URL que te indique (ej. `http://localhost:8080`) y deberías ver la pantalla de login.

## 6. Primer uso

1. Entra a `pages/registro.html` y crea tu cuenta de agente.
2. Inicia sesión.
3. Crea tu primera empresa desde el dashboard o `pages/empresas.html`.
4. Crea departamentos, proyectos y tareas. Invita a otros agentes por correo desde el módulo de Empresas (deben registrarse primero para poder ser invitados).

## 7. Subir a GitHub Pages

1. Crea un repositorio nuevo en GitHub (público o privado con GitHub Pro para Pages).
2. Sube **todo el contenido de esta carpeta** (no la carpeta contenedora) a la raíz del repositorio:
   ```bash
   git init
   git add .
   git commit -m "Despliegue inicial ZV Task Manager"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: main / (root)**.
4. Espera 1-2 minutos. Tu sistema quedará disponible en `https://TU-USUARIO.github.io/TU-REPO/`.
5. En Supabase, ve a **Authentication → URL Configuration** y agrega esa URL a "Site URL" y "Redirect URLs" (necesario para recuperación de contraseña y links de confirmación de email).

## Problemas comunes

**"El SDK de Supabase no está cargado"**
Verifica que cada HTML tenga el `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/...">` ANTES del `<script type="module" src=".../assets/js/...">`.

**Las políticas RLS rechazan una consulta que debería funcionar**
Revisa que el usuario tenga una fila en `agentes` (se crea automáticamente al registrarse, vía trigger `trg_on_auth_user_created`) y una fila en `agentes_empresas` para la empresa que intenta usar.

**Error de CORS al llamar a Supabase**
Verifica que `SUPABASE_URL` no tenga `/` al final y que estés usando la `anon key`, no la `service_role`.

**Las páginas no cargan estilos/imágenes en GitHub Pages**
Asegúrate de subir la carpeta tal cual (con `assets/`, `pages/`, etc. en la raíz del repo) y no dentro de una subcarpeta adicional.
