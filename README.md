# ZV Task Manager

Sistema gestor de pendientes y actividades, multiempresa, multiusuario. Construido con HTML5 + CSS modular + JavaScript vanilla (ES Modules) y Supabase (PostgreSQL + Auth + Storage + Realtime). Pensado para desplegarse gratis en GitHub Pages.

![Estado](https://img.shields.io/badge/estado-listo%20para%20producción-00cc88) ![Stack](https://img.shields.io/badge/stack-HTML%2FCSS%2FJS%20%2B%20Supabase-00d4ff)

## ¿Qué incluye?

- **Multiempresa real**: un agente puede pertenecer a varias empresas con roles distintos en cada una (admin, manager, empleado).
- **Departamentos y proyectos** con miembros, progreso automático y actividad reciente.
- **Tareas** en dos modalidades: puntuales (fecha de cierre) y cronológicas (recordatorios recurrentes diarios/semanales/mensuales), con comentarios, historial de cambios automático y asignación múltiple.
- **Calendario** con vista mensual, semanal y diaria, indicadores de color por prioridad/estado, arrastrar y soltar para reprogramar, y panel de detalle lateral.
- **Mis pendientes**: tablero kanban personal por agente.
- **Notificaciones** en tiempo real (Supabase Realtime) con campana, badge y centro de notificaciones.
- **Reportes**: dashboard ejecutivo, reporte por proyecto y reporte personal, con exportación a CSV.
- **Configuración**: perfil de agente, administración de empresa, tema claro/oscuro, preferencias de notificación.
- **Seguridad**: Row-Level Security en todas las tablas, validación en cliente y servidor.

## Requisitos

- Un proyecto [Supabase](https://supabase.com) (capa gratuita es suficiente para empezar).
- Navegador moderno (Chrome, Edge, Firefox, Safari — últimas 2 versiones).
- Para desarrollo local: cualquier servidor estático (los módulos ES requieren `http://`, no `file://`). Ejemplos: `npx serve`, extensión "Live Server" de VS Code, o `python3 -m http.server`.
- No requiere Node.js, build step ni `npm install` para funcionar — es HTML/CSS/JS puro.

## Estructura de carpetas

```
zv-task-manager/
├── index.html                  # Dashboard principal (post-login)
├── pages/                      # Resto de páginas del sistema
│   ├── login.html / registro.html / recuperar-password.html
│   ├── empresas.html / departamentos.html
│   ├── proyectos.html / proyecto-detalle.html
│   ├── tareas.html / tarea-detalle.html
│   ├── calendario.html / pendientes.html / recordatorios.html
│   ├── notificaciones.html / reportes.html / configuracion.html
├── assets/
│   ├── css/        (variables, styles, components, responsive)
│   ├── js/         (config, supabase-client, supabase-data, auth, main, layout, utils + 1 archivo por módulo)
│   ├── images/      (logo y favicons generados desde logo-zv.jpeg)
│   └── sql/         (schema.sql, rls-policies.sql, seed.sql, migrations/)
├── favicon.ico, site.webmanifest
├── .env.example, README.md, SETUP.md, ARCHITECTURE.md
```

## Inicio rápido

1. Sigue **SETUP.md** para crear el proyecto Supabase, ejecutar el SQL y obtener tu URL + anon key.
2. Pega esas credenciales en `assets/js/config.js`.
3. Sirve la carpeta con un servidor estático local y abre `index.html`.
4. Regístrate desde `pages/registro.html`, crea tu primera empresa y empieza a trabajar.
5. Cuando esté listo, sube la carpeta a un repositorio de GitHub y activa GitHub Pages (ver SETUP.md).

## Convenciones de código

- Patrón de tres capas: UI (`[modulo].js`) → Datos (`supabase-data.js`) → Cliente (`supabase-client.js`).
- Nombres de tablas y columnas en `snake_case`, en español, según las especificaciones funcionales del sistema.
- Todas las páginas protegidas llaman a `inicializarApp()` (de `main.js`) al cargar, que verifica sesión, pinta el layout y carga datos del usuario.
- Estilos con variables CSS (`assets/css/variables.css`) — cambia la paleta editando solo ese archivo.

## Soporte

Ver la sección "Problemas comunes" en `ARCHITECTURE.md` y `SETUP.md`. Para dudas puntuales sobre RLS o estructura de datos, revisa los comentarios dentro de `assets/sql/schema.sql` y `assets/sql/rls-policies.sql`.

## Licencia

MIT — libre para usar y modificar. Construido para Jhiro Perú S.A.C. / Luis Developers.
