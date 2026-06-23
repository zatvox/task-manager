# ARCHITECTURE — Documentación técnica

## Visión general

ZV Task Manager es una SPA-like multi-página: cada módulo es un `.html` independiente (mejor para SEO, carga inicial y simplicidad en GitHub Pages), pero todos comparten una capa JS común que evita duplicar lógica.

```
┌──────────────────────────────────────────────────────────┐
│  UI LAYER                                                 │
│  layout.js (sidebar/topbar) + main.js (bootstrap, toasts, │
│  modales, tema) + [modulo].js (lógica específica de cada  │
│  página: render de DOM, eventos, validación de formularios)│
└─────────────────────────┬──────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────┐
│  DATA LAYER — supabase-data.js                              │
│  Toda query/mutation pasa por aquí. Devuelve datos ya       │
│  transformados a la UI y centraliza manejo de errores.      │
└─────────────────────────┬──────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────┐
│  CLIENT LAYER — supabase-client.js + config.js               │
│  Singleton del cliente Supabase (vía Proxy con inicialización │
│  perezosa). Único lugar que conoce la URL/API key.            │
└──────────────────────────────────────────────────────────────┘
```

`auth.js` es transversal: gestiona login/registro/sesión y es usado tanto por las páginas públicas como por `main.js`.

## Flujo de arranque de una página protegida

1. El HTML carga el SDK de Supabase por CDN, luego su módulo JS (`type="module"`).
2. El módulo llama `renderLayout('id-de-pagina')` (de `layout.js`) → inyecta sidebar + topbar en `#layout-root`, dejando `#main-content` vacío.
3. Llama `await inicializarApp()` (de `main.js`) → verifica sesión (`protegerPagina`), si no hay sesión redirige a `login.html`; si hay, carga el perfil del agente, pinta nombre/avatar, inicializa selector de empresa activa y campana de notificaciones.
4. El módulo de la página rellena `#main-content` con su propio HTML (vía template strings) y carga sus datos llamando a `supabase-data.js`.

Este patrón evita duplicar ~150 líneas de sidebar/topbar en cada uno de los 16 archivos HTML.

## Modelo de datos (resumen)

Ver diagrama completo en `assets/sql/schema.sql` (comentado tabla por tabla). Relaciones clave:

- Un **agente** puede pertenecer a varias **empresas** (`agentes_empresas`, con rol por empresa).
- Una **empresa** tiene **departamentos** y **proyectos**.
- Un **proyecto** tiene **miembros** (agentes directos o vía departamento) y **tareas**.
- Una **tarea** es puntual (`fecha_cierre` fija) o cronológica (`es_cronologica = true`, genera una **recordatorio_cronologico** + N **instancias_recordatorios** futuras).
- Cada cambio relevante en una tarea se registra automáticamente en `historial_tareas` (vía trigger SQL), no manualmente desde el frontend.
- Las **notificaciones** se generan automáticamente por triggers SQL (asignación, comentario, completado) — el frontend solo las lee y las marca como leídas.

## Seguridad (RLS)

Cada tabla tiene RLS habilitado con la regla "deny by default": sin política explícita, ninguna fila es visible. Las políticas usan funciones `security definer` (`es_admin_empresa`, `es_manager_o_admin_empresa`, `es_miembro_empresa`, `es_miembro_proyecto`) para evitar recursión infinita de RLS y centralizar la lógica de permisos. Ver `assets/sql/rls-policies.sql`.

Jerarquía de permisos por empresa: `admin` > `manager` > `empleado`. Un agente siempre puede ver/editar lo que él mismo creó o le fue asignado, independientemente de su rol.

## Decisiones técnicas relevantes

- **Sin framework ni bundler**: se eligió JS vanilla con ES Modules nativos para que el proyecto funcione en GitHub Pages sin paso de build, cumpliendo el requisito de "listo para producción al abrir index.html".
- **Render vía template strings + innerHTML**: más simple de mantener que un virtual DOM para el tamaño de este proyecto; se mitiga XSS con `escapeHTML()` en todo contenido generado por usuarios.
- **Multiempresa con selector activo en localStorage**: el agente trabaja "dentro" de una empresa a la vez (similar a Slack/Notion), seleccionable desde el topbar. Las queries siempre filtran por `empresa_id` activa.
- **Generación de instancias de recordatorios**: se genera un lote de 90 días hacia adelante al crear/editar el recordatorio (función SQL `generar_instancias_recordatorio`), evitando tener que correr un cron permanentemente; se puede re-invocar manualmente o agendar con `pg_cron` si el plan de Supabase lo permite.
- **Realtime solo para notificaciones**: se limitó el uso de canales Realtime a notificaciones (el caso de mayor valor con menor costo) para no sumar complejidad/cuota innecesaria en otros módulos.
- **Calendario sin librería externa**: implementado con grillas CSS nativas + drag & drop HTML5, evitando dependencias pesadas (FullCalendar, etc.) y manteniendo control total del diseño dark/premium.

## Extender el sistema

- **Nuevo módulo**: crea `pages/nuevo-modulo.html` (copia la estructura mínima de cualquier página existente: `#layout-root` + scripts), `assets/js/nuevo-modulo.js` (importa `renderLayout`, `inicializarApp`, y las funciones de datos que necesites de `supabase-data.js`), agrega el link en `NAV` dentro de `assets/js/layout.js`.
- **Nueva tabla**: agrégala a `schema.sql` siguiendo las convenciones (`uuid` PK, `created_at`/`updated_at`, FKs con `on delete` explícito), añade sus políticas en `rls-policies.sql`, y sus funciones CRUD en `supabase-data.js`.
- **Cambiar la paleta de colores**: edita únicamente `assets/css/variables.css`.

## Roadmap sugerido (no incluido en esta entrega)

- Integración real de envío de email/SMS para notificaciones (Sendgrid/Twilio).
- `pg_cron` en Supabase para regenerar instancias de recordatorios automáticamente cada noche.
- Tests automatizados (Jest para lógica de `utils.js`, Playwright para flujos end-to-end).
- Exportación de reportes a PDF (actualmente solo CSV).
