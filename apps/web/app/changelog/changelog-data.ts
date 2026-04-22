export type ProjectId = "atlas" | "panel" | "agents" | "tools";

export interface Attachment {
  name: string;
  url: string;
  type: "image" | "video" | "document";
  uploadedAt: string;
}

export interface Collaborator {
  name: string;
  email: string;
}

export interface DbChangelogEntry {
  id: string;
  projectId: Exclude<ProjectId, "atlas">;
  registerDate: string;
  implementationDate: string;
  version: string;
  author: Collaborator;
  collaborators: Collaborator[];
  description: string;
  changes: {
    added?: string[];
    changed?: string[];
    fixed?: string[];
    removed?: string[];
    improved?: string[];
  };
  attachments: Attachment[];
  ticketUrl?: string;
  createTicket: boolean;
  tags?: string[];
  status: "draft" | "published";
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  /** Better Auth user id del creador (si existía al crear). */
  createdByUserId?: string | null;
  /** Oculta la entrada en listas y detalle para no-admins. */
  hidden?: boolean;
  hiddenAt?: string;
  hiddenByUserId?: string | null;
}

export interface ChangelogEntry {
  date: string;
  description: string;
  changes: {
    added?: string[];
    changed?: string[];
    fixed?: string[];
    removed?: string[];
    improved?: string[];
  };
}

export const PROJECTS: { id: ProjectId; name: string; description: string }[] =
  [
    {
      id: "atlas",
      name: "Atlas",
      description: "BackOffice - Sistema de gestión operativa",
    },
    { id: "panel", name: "Panel Web", description: "Panel Web / CRM de kAI" },
    { id: "agents", name: "kAI Agents", description: "Core de agentes IA" },
    { id: "tools", name: "Tools MCP", description: "Herramientas MCP" },
  ];

export const changelogData: Record<string, ChangelogEntry> = {
  "2.5.0": {
    date: "2026-04-21",
    description:
      "Refactorización de frontend: reorganización de arquitectura, consolidación de componentes y eliminación de código duplicado",
    changes: {
      added: [
        "Nuevo directorio `services/` para centralizar todas las llamadas al backend API; separa responsabilidades de `lib/` (SDKs) vs `services/` (API calls).",
        "Hook genérico `useApiResource<T>()` para eliminar boilerplate en patrones fetch-on-mount: gestiona loading, error, y refetch automáticamente.",
        "Helper `parseJsonResponse<T>()` en `utils/api-helpers.ts` para parsear respuestas JSON sin try-catch repetido.",
        "Componentes compartidos `ChangelogListPage` y `ChangelogVersionPage` para consolidar 6 páginas de changelog duplicadas (panel/tools/agents).",
        "5 nuevas funciones en `services/agents-api.ts`: `fetchFavorites()`, `toggleFavorite()`, `fetchAgentProperties()`, `patchAgentPropertyDoc()`, `fetchTestingProperties()`.",
      ],
      changed: [
        "Moví `agents-api.ts`, `organization-api.ts`, `blog-api.ts` de `lib/` a nuevo directorio `services/`; actualicé 40+ imports en todo el proyecto.",
        "Refactoricé 3 hooks (`useProductionPrompt`, `useTestingDiff`, `useToolsCatalog`) para usar `useApiResource`, reduciendo boilerplate de estado.",
        "Reduje 6 páginas de changelog (panel, tools, agents × [list, detail]) a wrappers de 5-9 LOC cada una (era 150 LOC por página).",
        "Componentes que hacen fetch directo ahora usan funciones del service (`operations-dashboard.tsx`, `agent-tools-panel.tsx`, `layout.tsx`).",
      ],
      improved: [
        "Separación clara de responsabilidades: `lib/` = SDKs/tipos/helpers puros; `services/` = API calls; `utils/` = helpers reutilizables.",
        "Mantenibilidad: cambios en lógica de API se hacen en un único lugar (`services/`).",
        "Escalabilidad: agregar nuevo changelog project ahora requiere solo 2 archivos de 5-10 LOC.",
        "Reducción de código: ~650 líneas de duplicación eliminadas (changelog + hooks + fetch patterns).",
      ],
      fixed: [
        "Solucionó error de HTML validation «<a> cannot be a descendant of <a>» en previsualizaciones de blog markdown dentro de `Link` wrapper.",
      ],
    },
  },
  "2.4.24": {
    date: "2026-04-21",
    description:
      "Atlas: paso opcional «Manual de herramientas» en el builder, con generación/actualización IA y traducción al prompt final",
    changes: {
      added: [
        "En el constructor de agentes (`agent-form-builder`), nuevo subpaso opcional «Manual de herramientas» después de «Herramientas», con diálogo inicial Sí/No al pulsar Siguiente.",
        "Editor markdown para el manual con `PromptMarkdownEditor` + `PromptMarkdownViewToggle`, pensado para iterar flujos de uso de tools en español.",
        "Botones «Regenerar» y «Actualizar» para el manual con confirmación mediante `AlertDialog` antes de ejecutar la acción.",
        "Nueva API `POST /api/agents/builder/tool-flows-markdown` (Hono + proxy Next + cliente en `agents-api`) para generar/actualizar markdown de flujos con IA.",
      ],
      changed: [
        "El payload del paso `tools` ahora también puede persistir `toolFlowsMarkdownEs` junto con `selected_tools` en el borrador del agente.",
        "El submit final del builder envía `toolFlowsMarkdownEs` en el PATCH de `tools` para que el contenido quede disponible antes de `step: complete`.",
      ],
      improved: [
        "La generación multi-fase del system prompt ahora integra `draftRoot.toolFlowsMarkdownEs`: usa esa guía en español para construir instrucciones en inglés, evitando dejar instrucciones internas en español en el prompt final.",
      ],
    },
  },
  "2.4.23": {
    date: "2026-04-21",
    description:
      "Builder de agentes: paso opcional Manual de herramientas, contexto reforzado y generación en streaming",
    changes: {
      added: [
        "E2E del form builder actualizado para el modal opcional tras «Herramientas»: ruta rápida (No, continuar) y ruta opcional con `FORM_BUILDER_TOOL_MANUAL=1` para entrar a «Manual de herramientas».",
        "Nueva variable documentada `FORM_BUILDER_TOOL_MANUAL=1` en README de `apps/web`.",
        "Generación del manual de herramientas en tiempo real (SSE): backend emite `delta/done/error`, proxy Next reenvía stream y el editor muestra texto incremental durante «Generando con IA…».",
        "Campo `supplemental_context` para enriquecer la generación de flujos con contexto de Avanzado + racional de recomendación por herramienta.",
      ],
      changed: [
        "El payload del manual ahora incluye personalidad/estilo configurados (tono, rasgos, emojis, acento, firma, longitud, estilo conversacional), además de políticas y frases requeridas.",
        "El prompt del generador de manual de tools exige ejemplos conversacionales más específicos y alineados a negocio/contexto/persona.",
        "Ancho del subpaso «Manual de herramientas» ajustado a `max-w-4xl` (más espacio que el formulario base, sin llegar a full-width).",
      ],
      fixed: [
        "El test E2E ya no pisa el contenido del manual con texto de prueba (`# E2E ...`) al recorrer la ruta opcional.",
        "Reglas endurecidas en el diseñador de prompt y en el diseñador de flujos para evitar narración de acciones internas al usuario (ej. “voy a buscar...”) y priorizar respuesta final útil.",
      ],
    },
  },
  "2.4.22": {
    date: "2026-04-20",
    description:
      "Atlas: diseño de prompt — conmutador Markdown/Raw y toggle en cabecera de cada bloque",
    changes: {
      added: [
        "Conmutador Markdown / Raw: vista visual (TipTap) o texto plano monoespaciado (`Textarea`) sobre el mismo string markdown; al volver a visual se remonta el editor para hidratar el contenido.",
        "Componente UI `Switch` (`@radix-ui/react-switch`) y `PromptMarkdownViewToggle` exportado desde `prompt-markdown-editor` para reutilizar el mismo control compacto.",
        "Props `rawView` y `markdownPaneRemountKey` en `PromptMarkdownEditor` para modo controlado desde el padre sin barra interna.",
      ],
      changed: [
        "En `AgentPromptDesigner`, el toggle Markdown/Raw pasa a la misma fila que «Base Prompt», «Unauth (Public)» y «Auth (Verified)» (solo cuando se muestra el editor, no en diff ni sugerencia), liberando la franja superior del área de edición.",
      ],
    },
  },
  "2.4.21": {
    date: "2026-04-20",
    description:
      "Atlas: diseño de prompt — editor markdown enriquecido (estilo Notion) y barra flotante al seleccionar texto",
    changes: {
      added: [
        "En `/agents/:id/prompt-design`, componente `PromptMarkdownEditor` con TipTap, `@tiptap/markdown` y `StarterKit`: el prompt base y los modulares (auth / unauth) se editan con formato visible (títulos, listas, negrita, etc.) manteniendo el guardado como texto markdown en testing.",
        "Menú flotante tipo Notion al seleccionar texto (`BubbleMenu`): negrita, cursiva, tachado, código en línea, H2/H3, cita, listas ordenadas y con viñetas; anclado a `document.body` con posición fija para evitar recortes por `overflow` del panel.",
        "Dependencias: `@tiptap/markdown`, `@tiptap/extension-placeholder`, `@tiptap/extension-bubble-menu`; bloque `@tiptap/*` alineado en 3.22.4.",
      ],
      fixed: [
        "Bucle «Maximum update depth exceeded» en el menú flotante: `appendTo`, `shouldShow` y `options` del `BubbleMenu` deben ser referencias estables (constantes de módulo), porque TipTap re-despacha al cambiar su identidad y chocaba con `useEditorState`.",
      ],
    },
  },
  "2.4.20": {
    date: "2026-04-18",
    description:
      "Atlas: modo de datos MCP (`firestore_data_mode`) en raíz del agente y control en configuración",
    changes: {
      added: [
        "Campo raíz `firestore_data_mode` (`auto` | `testing` | `production`) documentado en contrato de agente; validación en `PATCH /api/agents/:id` junto con `version`; constantes `firestore-data-mode` y exposición en `parseAgentDoc` / detalle del agente.",
        "En el editor de configuración del agente, selector «Datos MCP (producción vs prueba)» que guarda vía `patchAgent` y describe el comportamiento respecto a `testing/data` vs colecciones de producción en MCP-KAI-AGENTS y Tools MCP.",
      ],
      changed: [
        "`fetchAgentById` siempre devuelve `firestoreDataMode` (por defecto `auto`) para hidratar el selector sin valores vacíos.",
        "El selector de modo MCP en el editor solo lo ven usuarios con rol admin; `PATCH /api/agents/:id` rechaza cambios de `firestore_data_mode` si el rol no es administrador.",
      ],
    },
  },
  "2.4.19": {
    date: "2026-04-18",
    description:
      "Database Duplicate/clone: Firestore por ambiente, duplicar documento recursivo y respuestas estables",
    changes: {
      fixed: [
        "En la API, duplicar/clonar y el resto de rutas bajo `/api/database` que distinguen testing vs production llamaban siempre al mismo Firestore (credenciales de producción). El destino se comprobaba en el mismo proyecto que el origen, lo que generaba el error «El documento ya existe en destino» aunque en testing no existiera. Se añade `getFirestoreForEnvironment` y credenciales opcionales de testing (`FIREBASE_SERVICE_ACCOUNT_JSON_TESTING` o `apps/api/src/tokens/firebase.testing.json`).",
        "Clonaciones recursivas muy grandes podían devolver HTML de error interno en lugar de JSON (respuesta demasiado pesada o fallos al serializar). El log de éxito limita las entradas devueltas (`log.documentos`) y expone `logDocumentosTotal` cuando hay truncado; al escribir se eliminan `undefined` y se reescriben `DocumentReference` al Firestore de destino para copias entre proyectos.",
        "En Duplicate / clone (`/database/duplicate-clone`), la respuesta se interpreta con `text` + `JSON.parse` seguro: si el servidor devuelve HTML (p. ej. 500), se muestra un mensaje claro en lugar de «Unexpected token…».",
      ],
      added: [
        "Operación «Duplicar documento» con checkbox «Incluir subcolecciones (clonación recursiva)», preview de subcolecciones y exclusiones (mismo patrón que duplicar colección y clonar recursivo). Documentado en `.env.example` el JSON de servicio para el proyecto Firebase de testing.",
      ],
    },
  },
  "2.4.18": {
    date: "2026-04-18",
    description:
      "Atlas: diseño de prompt — bug de recarga (versión antigua), alinear testing con producción al promover",
    changes: {
      fixed: [
        "En `/agents/:id/prompt-design` (`AgentPromptDesigner`), «Subir a producción» llamaba a `POST .../promote-prompt-to-production`, que solo escribe `agent_configurations/{id}/properties/prompt` y `mcp_configuration.system_prompt` en producción. La pantalla y `GET .../properties` (con agente en comercial) leen el prompt desde `testing/data/properties`: si el texto promovido no estaba guardado en testing o había desfase, tras recargar volvía la primera versión u otra copia vieja.",
        "Condición de carrera en la hidratación: el efecto que inicializa `savedPrompt` / `editingPrompt` solo esperaba `propertiesLoading` y usaba `baseTesting || baseProperties || agent.prompt`, de modo que una cadena vacía o datos aún no cargados podían forzar el fallback al MCP antes de tiempo.",
      ],
      changed: [
        "`executePromote`: tras un promote exitoso, `PATCH .../testing/properties/prompt` con el mismo `base` (y `auth` + `model` / `temperature` / `isMultiFunctionCallingEnable` cuando el payload incluye variantes auth), vía `updateTestingPropertyDocument`, para que testing coincida con lo desplegado.",
        "Toasts: mensaje de éxito solo si la sincronización con testing responde bien; si falla el PATCH tras haber promovido, aviso de error pidiendo guardar de nuevo (producción ya quedó actualizada).",
        "Tras sync correcto: actualización de `savedPrompt` (y prompts auth/unauth si aplica), `refetchTestingProperties` y `refetchProductionPrompt` como antes.",
        "Hidratación del prompt: si `agent.inCommercial`, no aplicar el efecto hasta `!testingPropertiesLoading`; orden de fuentes explícito — datos de `useTestingProperties` si existen, si no `useAgentProperties`, si no `agent.prompt` — sin encadenar con `||` sobre strings.",
        "`hooks/agent-testing-properties.ts`: `isLoading` inicial `true` cuando hay `agentId` (evita un frame en falso «no cargando»); al limpiar `agentId`, `setIsLoading(false)`.",
        "`handleSave`: tras guardado exitoso, `refetchTestingProperties` para alinear el hook con Firestore sin depender de F5.",
      ],
    },
  },
  "2.4.17": {
    date: "2026-04-16",
    description:
      "Atlas: guardado correcto de arrays anidados en Testing (p. ej. properties/sheet y sheetsList)",
    changes: {
      fixed: [
        "En la vista Testing del agente (`/agents/:id/testing-data`), al guardar un campo tipo array desde «Editar array», el payload `{ _array: [...] }` ya contiene valores planos; el código asumía erróneamente filas `{ value, type }` y aplicaba `.value` a cada elemento, lo que vaciaba objetos (p. ej. `{ sheetId, url }`) y fallaba con `null`. Se normaliza con `coerceNestedArrayFromSavePayload` (compatibilidad opcional con filas tipo DocField).",
      ],
    },
  },
  "2.4.16": {
    date: "2026-04-16",
    description:
      "API de agentes: promoción correcta de tools a producción y validación de nombre/path",
    changes: {
      fixed: [
        "Al subir tools desde testing a producción (`POST .../promote-to-production`), el campo sintético `__exists` ya no deja en producción un documento vacío: si se promueve la alta de una tool, se copia el documento completo desde `testing/data/tools` y se excluyen claves internas (`_*`, `__exists`). Si la tool se eliminó solo en testing, el documento correspondiente se borra en producción.",
      ],
      added: [
        "En el diff de testing (`GET .../testing-diff`), las tools nuevas en testing incluyen filas por cada campo además de `__exists`, para revisar nombre, descripción, `path`, etc. antes de promover.",
        "Validación al crear o actualizar tools: se rechaza `name` o `path` que parezcan rutas del repositorio (p. ej. `@`, `KAI-OPERATIONS-ENV`, segmentos tipo `/apps/web/`, extensiones `.tsx`/`.ts` en rutas).",
      ],
    },
  },
  "2.4.15": {
    date: "2026-04-16",
    description:
      "Atlas: página de perfil de usuario (nombre, rol, foto vía GitHub)",
    changes: {
      added: [
        "Ruta `/profile` con `OperationsShell` y migas de navegación (`Operaciones` → `Perfil`).",
        "Formulario para editar el nombre y el usuario de GitHub; la foto de perfil se guarda como `https://github.com/{login}.png` en el campo `image` de Better Auth (sin API ni Storage adicional).",
        "Vista previa del avatar con validación básica del login y bloqueo de guardado si la imagen no carga.",
        "Visualización del rol en solo lectura (`admin` / `member` con etiquetas en español) mediante `useUserRole`.",
        "Utilidades en `lib/github-avatar.ts`: construcción de URL, parseo desde `user.image` y validación de login.",
        "En el menú de usuario (`UserMenu`): enlace «Perfil», foto circular cuando hay `session.user.image` y fallback a iniciales si la URL falla; prop `userImage` propagada en dashboard, shell de operaciones, layout de agentes y páginas de database.",
      ],
    },
  },
  "2.4.14": {
    date: "2026-04-16",
    description:
      "Atlas: mejoras en flujos del constructor y visibilidad de Lecciones/Actualidad para admins",
    changes: {
      added: [
        "En las listas de Lecciones y Actualidad, filtro de visibilidad exclusivo para admins: solo visibles, solo ocultos o todos los posts.",
      ],
      changed: [
        "Los endpoints de blog (`/api/blog` y `/api/blog/search`) ahora aceptan `includeHidden=true` y devuelven entradas ocultas únicamente a usuarios con rol admin.",
      ],
      fixed: [
        "En el paso de flujos del constructor de agentes, el input de respuestas personalizadas deja de recortar espacios en tiempo real; ahora respeta el texto que escribe el usuario y solo usa `trim` para validaciones.",
      ],
    },
  },
  "2.4.13": {
    date: "2026-04-16",
    description:
      "Atlas: mejora del flujo post-creación del agente con CTA a Prompt Design y navegación automática segura",
    changes: {
      added: [
        "Tras completar el constructor de agentes, el toast de éxito ahora incluye acción visible «Ir a diseñar prompt» para abrir directamente `/agents/{id}/prompt-design`.",
      ],
      changed: [
        "Mensaje de éxito actualizado para comunicar el siguiente paso de onboarding: diseñar el prompt inicial del agente.",
      ],
      improved: [
        "Se mantiene la redirección automática para no frenar la generación/configuración inicial del prompt, con protección para evitar doble navegación si el usuario pulsa el CTA.",
      ],
    },
  },
  "2.4.12": {
    date: "2026-04-16",
    description:
      "Atlas: rediseño de Lecciones y Actualidad con shell unificado, editor markdown mejorado y mejoras de legibilidad",
    changes: {
      added: [
        "Nuevo `OperationsShell` reutilizable con header, `Sheet` de navegación y breadcrumb (`Operaciones / Lecciones` y `Operaciones / Actualidad`) aplicado en layouts de `/blog` y `/blog-actuality` (incluye detalle/edición/nueva entrada).",
        "Nuevas rutas de creación dedicadas: `/blog/new` y `/blog-actuality/new` para reemplazar modales y permitir experiencia de edición completa.",
        "En Actualidad, nuevo compositor markdown con toolbar (bold/italic/code/link/imagen), split editor-vista previa en desktop y tabs en móvil.",
        "Autocomplete de menciones en Actualidad al escribir `@`, con sugerencias de usuarios de organización e inserción directa de `@mention`.",
      ],
      changed: [
        "Listados de Lecciones y Actualidad ahora usan un layout más angosto (`max-w-3xl`) con estilo de lista densa tipo Notion en lugar de cards anchas.",
        "Páginas de detalle (`/blog/[id]` y `/blog-actuality/[id]`) migradas a ancho de lectura (`max-w-prose`) y estilo editorial más limpio.",
        "Lecciones ahora generan markdown estructurado con preguntas en bloque de cita (`> **pregunta**`) y separadores (`---`) entre secciones.",
        "Parser de Lecciones actualizado para soportar tanto formato antiguo (`##`) como nuevo formato con `>` y `---`.",
      ],
      fixed: [
        "Vista previa de Actualidad y Lecciones ahora respeta saltos de línea simples (Enter) sin colapsar texto.",
        "Render de markdown en post final de Lecciones ajustado para mostrar correctamente `blockquote`, separadores y estilos de lectura.",
        "Espaciado visual de separadores en Lecciones calibrado para evitar bloques pegados o exceso de separación.",
      ],
      improved: [
        "Jerarquía visual y legibilidad general mejoradas en formularios y vistas finales, con enfoque minimalista inspirado en editores de notas modernos.",
      ],
    },
  },
  "2.4.11": {
    date: "2026-04-15",
    description:
      "Atlas: vista Formulario del agente (solo lectura), snapshot del primer envío y pipelines visuales",
    changes: {
      added: [
        "Sección **Formulario** en la barra del detalle de agente (`/agents/:id/form`): solo lectura de los datos del constructor, con layout en dos columnas (grid + flex) para evitar huecos.",
        "API `GET /api/agents/:id/builder-form`: payload `live` (estado actual) más `initial` cuando existe snapshot del primer envío; `has_initial_snapshot`; en la raíz se mantienen `root`, `personality`, `business` y `advanced` alineados con `live` (retrocompat). Autorización con `userCanAccessAgent` (misma que propiedades).",
        "Serialización compartida del documento raíz del agente en `serializeAgentRootForClient` (reutilizada por GET borrador y builder-form).",
        "Al completar la creación del agente (`PATCH` borrador `step: complete`), tras `provisionAgentAfterComplete`, se guarda una sola vez en Firestore `agent_configurations/{id}/builderSnapshots/initial` el formulario (root + personality + business + advanced + `saved_at`). Los agentes anteriores sin snapshot muestran aviso y el estado actual.",
        "Funciones exportadas `assembleBuilderFormPayload` y `persistInitialBuilderSnapshotIfMissing` en el controlador de detalle del agente.",
      ],
      changed: [
        "Paso **Pipelines** en la vista de formulario: tarjetas por pipeline y etapas (icono, color, tipo, descripción) al estilo del constructor, en lugar de JSON en bruto.",
      ],
    },
  },
  "2.4.10": {
    date: "2026-04-15",
    description:
      "Constructor de agentes: paso Avanzado alineado con la configuración técnica del agente",
    changes: {
      added: [
        "En el paso **Avanzado** del constructor (`agent-form-builder.tsx`): modelo LLM y temperatura, tiempo de espera antes de procesar (`response.waitTime`), activar memoria conversacional (`isMemoryEnable`), partir la respuesta en varios mensajes (`isMultiMessageResponseEnable`), agente validador y reintentos MCP (`isValidatorAgentEnable`, `mcp.maxRetries`), mensaje cuando el envío no es soportado (`answer.notSupport`), y **Requiere autenticación** (sincronizado con `agent.isAuthEnable` al crear el borrador).",
        "API y utilidad `applyBuilderAdvancedProperties` (`apps/api/src/utils/apply-builder-advanced-properties.ts`): tras el PATCH `step: business` se fusionan `properties/*` y `testing/data/properties/*` (incl. `prompt.model` / `temperature` alineados con `ai`), y `time.zone` se deriva de `business_timezone` del paso Negocio.",
        "Campos opcionales en el cuerpo del PATCH de borrador `business` (Zod en API y `packages/shared`, tipos en `apps/web/types/agents-api.ts`).",
      ],
      removed: [
        "Controles quitados del paso Avanzado (siguen disponibles en el editor de configuración del agente cuando aplique): máximo de llamadas a herramientas por turno, lista blanca (`limitation`), horario de atención y `operating_hours` enviados vacíos desde el constructor, aviso de «Zona horaria del agente», y cantidad máxima de recuerdos (`memory.limit`).",
      ],
    },
  },
  "2.4.9": {
    date: "2026-04-15",
    description:
      "Constructor de agentes: sin presets de personalidad (UI y plantillas)",
    changes: {
      removed: [
        "Bloque «¿Quieres empezar con un preset?» y la cuadrícula de presets (ventas, soporte, admin, concierge) en el paso Personalidad de `agent-form-builder.tsx`.",
        "Constante `PERSONALITY_PRESETS` y el tipo `PersonalityPreset` en `lib/form-builder-constants.ts`.",
      ],
      changed: [
        "Al elegir una plantilla inicial (excepto «Empezar desde cero»), la personalidad queda vacía para rellenarla a mano; emojis en modo moderado y sin rasgos preseleccionados (antes se copiaban desde el preset asociado a cada plantilla).",
      ],
    },
  },
  "2.4.8": {
    date: "2026-04-15",
    description:
      "Constructor de agentes: editar empresas guardadas (PATCH) y «Guardar como nuevo»",
    changes: {
      added: [
        "API `PATCH /api/builder/saved-companies/:id` para actualizar `name`, `payload` y `updatedAt` en Firestore, con comprobación de `usersBuildersId` (404/403 si no corresponde).",
        "Cliente `patchSavedBuilderCompany` en `services/agents-api.ts`.",
        "Al cargar un perfil desde el selector se enlaza su documento: «Actualizar empresa» hace PATCH; el primer guardado sin perfil cargado sigue creando con POST y asocia el id para siguientes actualizaciones.",
        "Indicador «Editando: [nombre]» y botón «Guardar como nuevo» (desvincula el doc y el siguiente guardado crea otro registro). Al elegir «Guardar como nuevo» se resetea la deduplicación del auto-guardado al pulsar Siguiente.",
        "Guardado automático al pulsar Siguiente reutiliza la misma lógica POST/PATCH según haya perfil en edición.",
      ],
    },
  },
  "2.4.7": {
    date: "2026-04-15",
    description:
      "Constructor de agentes: empresas guardadas en Firestore, selector con descripción y guardado al avanzar",
    changes: {
      added: [
        "Colección Firestore `builderCompanies` con documentos por perfil de negocio: `usersBuildersId` (teléfono del builder, alineado con `usersBuilders`), `name`, `payload` en camelCase (`businessName`, `description`, `industry`, etc.), `createdAt` y `updatedAt`.",
        "API Hono `GET` y `POST /api/builder/saved-companies` (validación Zod); sin endpoint de borrado. Rewrite en `next.config.ts` hacia la API interna para `/api/builder/*`.",
        "Cliente `fetchSavedBuilderCompanies` y `postSavedBuilderCompany` en `services/agents-api.ts`; tipos `BuilderCompanyPayload` y `SavedBuilderCompany`.",
        "En el paso Negocio del form builder: bloque «Empresas guardadas» con buscador por nombre o descripción, lista que muestra el nombre y debajo la descripción del negocio (para distinguir entradas con el mismo nombre), y botón «Guardar empresa actual».",
        "Guardado automático del perfil del negocio al pulsar **Siguiente** cuando los datos obligatorios están completos, con deduplicación por hash del payload para no crear registros idénticos seguidos.",
        "Callback `onBusinessProfileSaved` para alinear el estado de deduplicación tras guardar manualmente o cargar un perfil desde el selector.",
      ],
      changed: [
        "El listado del selector permite múltiples empresas con el mismo nombre; la descripción bajo el título sirve para diferenciarlas.",
      ],
      removed: [
        "Eliminación de negocios guardados (sin botón en UI y sin ruta `DELETE` en la API).",
      ],
    },
  },
  "2.4.6": {
    date: "2026-04-15",
    description:
      "Constructor de agentes: contexto de tools obligatorias en preguntas de flujo y prompts en inglés",
    changes: {
      added: [
        "Paquete `@kai/shared`: constantes `AGENT_BUILDER_MANDATORY_TOOL_NAMES` y `AGENT_BUILDER_MANDATORY_TOOLS_LLM_CONTEXT` (texto para el modelo sobre capacidades siempre incluidas: base de conocimiento y escalamiento a soporte).",
        "El endpoint de generación de preguntas de flujo (`/api/agents/builder/flow-questions`) incorpora ese contexto y reglas explícitas para no repetir temas ya cubiertos por `escalation_rules` ni preguntar si el asistente «puede» usar conocimiento o escalar (ya están garantizados).",
      ],
      changed: [
        "Recomendación de herramientas y el formulario de construcción de agentes usan la misma lista de tools obligatorias desde `@kai/shared` en lugar de arrays duplicados.",
        "Instrucciones del modelo para flow-questions redactadas en inglés; el JSON generado sigue exigiendo etiquetas, opciones y sugerencias en español latinoamericano para el usuario final.",
      ],
    },
  },
  "2.4.5": {
    date: "2026-04-15",
    description:
      "Atlas instalable: íconos y manifest web para agregar al Dock o pantalla de inicio",
    changes: {
      added: [
        "Archivo `app/manifest.ts` con nombre corto, modo `standalone`, colores de tema y referencias a íconos PNG para instalación como aplicación web.",
        "Assets `icon-192.png`, `icon-512.png` y `apple-touch-icon.png` en `public/`, generados a partir del favicon SVG para Safari y otros clientes que no usan solo SVG.",
      ],
      changed: [
        "Metadatos de íconos en `app/layout.tsx`: favicon SVG más variantes PNG y `apple-touch-icon` para que «Agregar al Dock» / añadir a inicio muestren el ícono correcto.",
      ],
    },
  },
  "2.4.4": {
    date: "2026-04-15",
    description:
      "Testing Data: ID de documento configurable al crear, validación de duplicados y generación aleatoria",
    changes: {
      added: [
        "En la página de datos de testing (`/agents/[agentId]/testing-data`), al crear un documento se puede indicar el ID del documento de forma explícita.",
        "Botón «ID aleatorio» que rellena el campo con un identificador único (equivalente al comportamiento anterior de ID autogenerado por el servidor).",
        "Validación en cliente: si el ID ya existe en la colección actual, se muestra un aviso y no se crea el documento.",
        "El cuerpo de `POST` hacia testing data admite `docId` opcional; si se envía vacío o el documento ya existe, la API responde con error claro (`409` en caso de duplicado).",
      ],
      changed: [
        "La creación de documentos en `testing/data` deja de depender únicamente de un ID generado en servidor cuando el usuario elige definir el ID manualmente.",
      ],
    },
  },
  "2.4.3": {
    date: "2026-04-15",
    description:
      "Bitácora de implementación movida a Sheet en header, con editor optimizado y control de visibilidad por autor",
    changes: {
      added: [
        "En el header de detalle del agente (`/agents/[agentId]/*`), nuevo botón entre favorito y avatar para abrir un `Sheet` con «Bitácora y comentarios».",
        "Nuevo componente `AgentActivitySheet` con filtros, orden, timeline, carga de actividad y publicación de comentarios desde el panel lateral.",
        "El `Sheet` ahora es redimensionable con cursor (drag en el borde izquierdo) para ajustar ancho en desktop.",
        "Nueva API `PATCH /api/agents/:agentId/implementation-activity/:entryId` para ocultar/des-ocultar comentarios.",
        "Control de visibilidad por autor: solo quien creó el comentario puede alternar ocultar/mostrar desde la timeline.",
      ],
      changed: [
        "Al abrir el `Sheet`, la vista se posiciona en los registros más recientes (parte inferior).",
        "La sección «Agregar comentario» quedó fija en la parte inferior del `Sheet` mientras el listado hace scroll.",
        "El editor de comentarios inicia en un renglón, crece hasta 3 y después usa scroll interno.",
        "Los íconos de ocultar/des-ocultar en hover usan color distintivo para mayor claridad visual.",
      ],
      fixed: [
        "Se corrigió el editor TipTap para que vuelva a ser escribible después de estados de carga (`setEditable` al cambiar `disabled`).",
        "Se eliminó el tope visual que impedía agrandar el `Sheet` al arrastrar, respetando el ancho dinámico.",
      ],
      removed: [
        "La sección embebida «Bitácora y comentarios» salió del panel de tareas de implementación para evitar duplicidad.",
      ],
      improved: [
        "Cuando un comentario está oculto, deja de mostrarse a otros usuarios; solo el autor ve el placeholder «Ocultaste este mensaje».",
      ],
    },
  },
  "2.4.2": {
    date: "2026-04-15",
    description:
      "Asignación de agente a testing desde Home y detalle, con estado visual de asignado por usuario",
    changes: {
      added: [
        "En Home (Operations), nuevo botón junto a favoritos para asignar el agente al número de testing del usuario actual.",
        "En el header del detalle del agente (`/agents/[agentId]/*`), nuevo botón de asignación junto al botón de favorito.",
        "Nuevo endpoint `GET /api/agents/assigned-to-user` para obtener el `customAgentConfigId` activo del usuario autenticado (resuelto por `phoneNumber` en `usersBuilders`).",
        "Nuevo helper frontend `fetchAssignedAgentForUser()` para reflejar en UI el estado actual de asignación.",
      ],
      changed: [
        "El endpoint `POST /api/agents/:agentId/assign-to-user` ahora usa `usersBuilders` por `phoneNumber` como fuente canónica para testing y persiste `customAgentConfigId`, `isTestingCustomAgent`, `testingStartedAt` y `lastAgentChange`.",
        "Si no existe registro en `usersBuilders`, se crea automáticamente con el patrón del flujo de creación de agentes.",
        "Si el `userBuilder` ya existe, no se sobrescriben sus datos base (`uid`, `email`, `name`, `phoneNumber`); solo se actualizan campos de asignación/testing.",
      ],
      removed: [
        "La asignación de testing deja de depender de la colección deprecada `agents_assignment`.",
      ],
      improved: [
        "Estado visual persistente de asignación en Home y detalle: cuando el agente ya está asignado, el botón cambia de estilo, icono y tooltip para indicar `Asignado a tu número de testing`.",
      ],
    },
  },
  "2.4.1": {
    date: "2026-04-15",
    description:
      "Archivado de agentes en Operations con bitácora, estado visible y filtros server-side",
    changes: {
      added: [
        "Nuevo estado raíz del agente `status` (`active` | `archived`) en `agent_configurations/{agentId}`, expuesto en listado (`GET /api/agents/info`) y detalle (`GET /api/agents/:id`) con normalización backward-compatible (`active` por defecto).",
        "Endpoint `POST /api/agents/:agentId/operations-archive` para archivar/desarchivar: exige `confirm = CONFIRMAR` al archivar, valida permisos de admin y persiste `status` en producción.",
        "Registro automático en bitácora de implementación para archivado/desarchivado (`agent_archived`, `agent_unarchived`) con `appendImplementationActivityEntry`.",
        "En Home (Operations), acciones por fila para archivar/desarchivar con íconos y tooltips, más diálogo de confirmación para archivado.",
        "Filtro rápido `Solo archivados` en la Home que usa query server-side (`archived=only`) para incluir también agentes no cargados en cliente.",
      ],
      changed: [
        "La búsqueda mantiene visibilidad de archivados cuando hay término de búsqueda; sin búsqueda, los archivados se ocultan del listado principal por defecto.",
        "Cards/filas de agentes archivados muestran badge `Archivado` en lugar del estado operativo estándar.",
        "En el detalle del agente (`/agents/[agentId]/*`), el tag de estado superior muestra `Archivado` cuando aplica.",
        "UI de acciones refinada: botones de archivar/desarchivar ahora son solo íconos con tooltip (sin texto en botón).",
      ],
      removed: ["Encabezado visual `Activos (N)` en la tabla de Operations."],
    },
  },
  "2.4.0": {
    date: "2026-04-14",
    description:
      "Implementación por agente: bitácora, comentarios y registro detallado de actividad",
    changes: {
      added: [
        "Bitácora en Firestore (`agent_configurations/{id}/implementation/activity/items`) y rutas API `GET` y `POST /api/agents/:agentId/implementation-activity` (comentarios con HTML sanitizado en servidor mediante `sanitize-html`).",
        "En el panel de tareas de implementación: sección «Bitácora y comentarios» con línea de tiempo, filtro (todos, comentarios o registros del sistema), orden por fecha, editor enriquecido TipTap y botón para publicar comentarios.",
        "Entradas automáticas de sistema al actualizar el system prompt, al promover el prompt a producción, al guardar propiedades de testing (texto `documentId -> ruta.de.campo`), al modificar herramientas o cobranza, y al confirmar «Subir a producción» (`POST .../promote-to-production`) con un registro por cada campo promovido (`promoted_to_production`).",
        "Registros específicos por acción sobre herramientas: creación, eliminación, solo activación/desactivación, o modificación de contenido con resumen de campos tocados en español.",
      ],
      changed: [
        "Propiedades de testing: si en un mismo guardado cambian varias claves en un documento, la bitácora genera un registro independiente por cada campo (ya no se agrupan con coma en un solo renglón).",
        "Tareas personalizadas: en cada tarjeta se muestran fecha y hora de creación y quién la creó; el checklist obligatorio pasa a titularse «Checklist obligatorios».",
        "Línea vertical de la timeline de la bitácora alineada con el centro de los iconos de cada evento.",
      ],
    },
  },
  "2.3.9": {
    date: "2026-04-14",
    description:
      "Tareas de implementación: checklist obligatoria, cobranza, WhatsApp y representante",
    changes: {
      added: [
        "API `GET /api/agents/:agentId/whatsapp-integration-status`: lista integraciones WhatsApp por `agentDocId` (sin datos sensibles), consumida por el panel de tareas.",
        "Tarea obligatoria «Correo o teléfono del representante» con campos `representativeEmail` / `representativePhone` persistidos en la tarea (validación al marcar completada).",
        "En `next.config.ts`, comentario de referencia junto al rewrite de `/api/agents/*` documentando la ruta de estado de integración WhatsApp.",
      ],
      changed: [
        "Checklist obligatoria del agente: textos alineados (adjuntar cotización, constancia de situación fiscal, domiciliación vinculada a `billing/main` como en la Home).",
        "Operaciones (admin/comercial): checkbox de cliente domiciliado en la fila de domiciliación; la tarea se sincroniza con cobranza (domiciliado o fecha límite de pago). Growers ven solo texto informativo.",
        "Adjuntos de archivo visibles para cotización y CSF; detección automática del número conectado (polling) y marcado de la tarea «Conectar número» cuando `setupStatus` es `completed`.",
        "Tras cada `GET` de tareas de implementación, los documentos obligatorios existentes actualizan título y descripción si cambió la plantilla en servidor.",
      ],
    },
  },
  "2.3.8": {
    date: "2026-04-14",
    description: "Agente: header sin badges de entorno (Testing / Producción)",
    changes: {
      removed: [
        "En el layout de detalle de agente (`/agents/[agentId]/*`), se quitaron del encabezado los badges «Testing (comercial)» y «Producción (kai)» y el estado y listener que solo servían para mostrarlos.",
      ],
    },
  },
  "2.3.7": {
    date: "2026-04-14",
    description:
      "Menú lateral: misma UI de Changelog en todas las pantallas (lista expandida por proyecto)",
    changes: {
      changed: [
        "El menú hamburguesa (Sheet) del dashboard de operaciones y de las herramientas de database (upload-data, viewer-comparator, update-document, document-explorer) usa el componente compartido `ChangelogNavItem`: enlace a `/changelog` y debajo Atlas, Panel Web, kAI Agents y Tools MCP siempre visibles, con el mismo estilo que en database index y duplicate-clone.",
        "Se eliminó el submenú de Changelog activado por hover en el dashboard de operaciones.",
      ],
    },
  },
  "2.3.6": {
    date: "2026-04-14",
    description:
      "Changelogs Firebase: listas ordenadas por versión (semver), no por fecha",
    changes: {
      fixed: [
        "En la API (`getChangelogEntries`), las entradas de Panel Web, kAI Agents y Tools MCP dejan de ordenarse por `registerDate` en Firestore y pasan a ordenarse por número de versión (major · minor · patch) de mayor a menor, con desempate por fecha de registro si hubiera la misma versión.",
        "Cuando varias filas compartían la misma fecha, el orden por fecha no distinguía versiones y la tabla podía verse desordenada; ahora el criterio principal es siempre semver.",
      ],
      added: [
        "Util `apps/api/src/utils/semver-compare.ts` (`compareSemverDesc`, comparador de filas con desempate por `registerDate`).",
      ],
    },
  },
  "2.3.5": {
    date: "2026-04-14",
    description:
      "Home: listado de agentes estable al editar cobranza / domiciliación",
    changes: {
      fixed: [
        "En el dashboard de operaciones (Home), abrir el diálogo de configuración de cobranza (lápiz junto al estado de domiciliación) y cambiar checkbox, monto o fecha ya no vaciaba el listado ni forzaba una recarga completa de agentes.",
        "Los efectos que sincronizan la búsqueda con `?q=` y los que cargan agentes dejan de depender del objeto `searchParams` de Next.js (referencia nueva en cada render) y usan valores derivados estables (`urlQ`, `queryString`), de modo que un re-render local no dispara `fetchAgents` ni se pierde la paginación obtenida con «Cargar más».",
      ],
    },
  },
  "2.3.4": {
    date: "2026-04-14",
    description:
      "Organización y registro: teléfono en formato WhatsApp (México 521)",
    changes: {
      added: [
        "Módulo compartido `lib/whatsapp-phone-format.ts` (lada, `buildWhatsappApiPhone`, `parseStoredPhoneForEditor`, lista de ladas).",
        "En registro con invitación (`/register`): selector de lada, número nacional, texto de ayuda y vista previa del formato final; el alta envía el mismo formato que en Organización.",
        "En API (Better Auth): `databaseHooks.user.create.before` y `lib/mexico-mobile-whatsapp-normalize.ts` para corregir en servidor el caso seguro 12 dígitos `52…` sin el `1` móvil → `521…`.",
      ],
      changed: [
        "Pantalla Organización: edición de teléfono reutiliza el módulo compartido (guardado, preview y apertura del diálogo).",
      ],
      fixed: [
        "Al registrarse, el teléfono opcional ya no se guardaba tal cual; México queda alineado con el prefijo `521` usado por la API de WhatsApp.",
      ],
    },
  },
  "2.3.3": {
    date: "2026-04-14",
    description:
      "Changelogs Firebase (Panel, Agents, Tools): proxy, permisos, UX y versión semver",
    changes: {
      added: [
        "Rewrite en Next de /api/changelogs hacia la API Bun (lista, alta, subida de adjuntos dejan de responder 404).",
        "Autor de entrada resuelto solo en backend desde la sesión (sin campo Autor en el formulario).",
        "Al crear: createdByUserId; admins pueden ocultar entradas (hidden); listas y detalle ocultan entradas ocultas para no-admins.",
        "PATCH por id de documento (/entries/:id): creador edita contenido; admin alterna visibilidad; DELETE permitido a creador o admin.",
        "Versión en el formulario como tres campos solo numéricos (mayor · menor · parche) que se unen al guardar.",
        "Edición en el mismo diálogo que la creación (sin página dedicada); botón de editar solo ícono de lápiz (accesible con aria-label).",
        "Tras crear o editar, la lista se refresca sin recargar la página (onSaved + fetch con cache: no-store).",
      ],
      fixed: [
        "Firestore rechazaba undefined en ticketUrl (y campos opcionales): se omiten claves undefined antes del set.",
        "Respuestas de error no JSON en el cliente ya no rompen con SyntaxError al parsear el cuerpo.",
      ],
      changed: [
        "Formulario de changelog en diálogo: sin bloqueo con skeleton de pantalla completa mientras carga la sesión de colaboradores.",
      ],
    },
  },
  "2.3.2": {
    date: "2026-04-14",
    description: "Database: selector de ambiente en Subir datos",
    changes: {
      added: [
        "En /database/upload-data, tarjeta «Ambiente de destino» con selector Testing / Production (mismo patrón que Duplicate / clone: opciones desde allowedEnvironments).",
        "Preview de colección y todas las peticiones de subida envían X-Environment según el ambiente elegido, independiente del selector global del layout.",
      ],
    },
  },
  "2.3.1": {
    date: "2026-04-14",
    description:
      "Constructor de agentes: persistencia completa y aprovisionamiento al crear",
    changes: {
      added: [
        "Al crear borrador de agente se guardan status pending_tools_selection, owner_user_id y owner_phone",
        "Al completar creación (step complete) se aprovisiona el agente: wallet inicial, colaborador administrador, pipelines y etapas (desde el formulario o plantilla por defecto), moduleAccess según herramientas y sincronización de assignedModules en usersBuilders",
        "Registro en logs del evento agent_created con agentId, módulos y conteo de herramientas",
      ],
      changed: [
        "PATCH de borrador (negocio) acepta y persiste custom_industry, business_timezone, business_hours, require_auth, flow_questions, flow_answers y pipelines en el documento raíz y en properties/business",
        "El formulario del constructor envía en el paso negocio todos los campos anteriores además de operating_hours alineado con horario",
      ],
      improved: [
        "El flujo de creación queda alineado con el comportamiento esperado post-creación (sin incluir aún la vinculación de número de WhatsApp)",
      ],
    },
  },
  "2.3.0": {
    date: "2026-04-13",
    description: "Sistema de changelogs multi-proyecto",
    changes: {
      added: [
        "Nuevo sistema de changelogs con 4 proyectos: Atlas, Panel Web, kAI Agents, Tools MCP",
        "Atlas permanece hardcoded, los demás proyectos usan Firebase Firestore",
        "Formularios en dialog con todos los campos: fechas, versión, autor, colaboradores, descripción, cambios, etiquetas, URL de ticket, adjuntos, estado, notas internas",
        "Autocompletado de colaboradores desde usuarios de la organización",
        "Soporte para adjuntos: imágenes, videos y PDFs en Firebase Storage",
        "API routes para operaciones CRUD",
      ],
      changed: ["Changelog principal ahora muestra selector de proyectos"],
    },
  },
  "2.2.5": {
    date: "2026-04-12",
    description: "Filtro de favoritos movido al backend",
    changes: {
      improved: [
        "El filtro de favoritos ahora se procesa en el servidor, evitando cargar todos los agentes en el cliente",
      ],
    },
  },
  "2.2.4": {
    date: "2026-04-12",
    description: "Mejoras en gestión de usuarios de organización",
    changes: {
      added: [
        "Diálogo de edición de usuario con selector de rol",
        "Opción para generar contraseña temporal",
        "Confirmación por email al expulsar usuario",
      ],
    },
  },
  "2.2.3": {
    date: "2026-04-12",
    description: "Soporte para rol comercial en organización",
    changes: {
      added: [
        "Rol 'commercial' ahora es válido al gestionar usuarios de organización",
      ],
      fixed: [
        "Toast mostraba 'actualizado a miembro' al asignar rol comercial",
      ],
    },
  },
  "2.2.2": {
    date: "2026-04-12",
    description: "Mejora en indicadores de carga del dashboard",
    changes: {
      fixed: [
        "Mensaje 'No hay agentes' ya no aparece mientras cargan los agentes",
        "Skeleton ahora se muestra durante toda la carga (no solo carga inicial)",
      ],
      removed: [
        "Texto 'Cargando agentes...' del dashboard (ya shown por skeleton)",
      ],
    },
  },
  "2.2.1": {
    date: "2026-04-12",
    description: "Mejoras en búsqueda de agentes",
    changes: {
      fixed: [
        "Búsqueda de agentes ahora solo busca en producción (arreglado problema donde no mostraba todos los agentes que coincidían)",
      ],
      removed: [
        "Columnas 'Entornos' e 'Industria' del dashboard de operaciones",
        "Botón de sincronización de agentes del dashboard",
        "Campos inCommercial, inProduction e industry de la respuesta API /api/agents/info",
      ],
      changed: [
        "Búsqueda ahora es solo en production (antes buscaba en commercial/testing)",
        "Búsqueda ahora se sincroniza con query param URL (?q=) y persiste al recargar",
      ],
    },
  },
  "2.2.0": {
    date: "2026-04-12",
    description: "Mejoras de compatibilidad API-Frontend",
    changes: {
      added: [
        "Nuevo paquete @kai/shared con Zod schemas compartidos",
        "Endpoint /api/health con información de versión",
        "Códigos de error: VALIDATION_ERROR, NOT_FOUND, FORBIDDEN, UNAUTHORIZED, INTERNAL_ERROR, CONFLICT, BAD_REQUEST",
      ],
      changed: [
        "Estandarizar respuestas de error del API a formato { error, code, details? }",
        "Helper ApiErrors para respuestas type-safe",
        "Actualizar workspaces en package.json para incluir packages/*",
      ],
      improved: [
        "Consistencia en manejo de errores entre todos los controllers",
        "Mejor debugging de errores con códigos específicos",
      ],
    },
  },
  "2.1.0": {
    date: "2026-04-11",
    description: "Cambio de dominio del frontend",
    changes: {
      changed: [
        "Dominio del frontend cambiado de 'https://kai-operations.dukehomelab.site/' a 'https://atlas.talktokai.com/'",
      ],
    },
  },
  "2.0.14": {
    date: "2026-04-10",
    description:
      "Botón de sincronización de toolsCatalog a documento de la tool del agente",
    changes: {
      added: [
        "Botón de sincronización en dialog de editar tool para traer valores desde toolsCatalog",
        "Permite sincronizar: displayName, description, path, parameters, crmConfig",
        "Selección de campos a sincronizar mediante checkboxes",
        "Detección de cambios considerando orden de propiedades (deep comparison)",
        "API actualizada para devolver y aceptar crmConfig en toolsCatalog y agent tools",
      ],
    },
  },
  "2.0.13": {
    date: "2026-04-10",
    description: "Fix: orden de keys en comparación de propiedades",
    changes: {
      fixed: [
        "Comparación de propiedades ahora ignora orden de keys (evita falsos positivos en cambios pendientes)",
      ],
    },
  },
  "2.0.12": {
    date: "2026-04-10",
    description: "Collapse de tareas obligatorias en panel de implementación",
    changes: {
      added: [
        "Checklist obligatoria colapsable por defecto",
        "Contador de progreso visible cuando está colapsado",
      ],
    },
  },
  "2.0.11": {
    date: "2026-04-10",
    description: "Selector de endpoint MCP para agentes",
    changes: {
      added: [
        "Selector en configuración de agente para elegir entre endpoint de Producción, Testing o Default",
        "Solo visible para admins y tech leads",
        "El endpoint se guarda en las propiedades del agente (documento mcp)",
      ],
    },
  },
  "2.0.10": {
    date: "2026-04-10",
    description: "Mejoras en carga de agentes y búsqueda",
    changes: {
      improved: [
        "Carga progresiva de agentes con skeleton loader de 5 items",
        "Preview mode en backend para respuestas más rápidas",
        "Paralelización de queries de testing en Firestore",
        "CHUNK_SIZE reducido de 50 a 25",
      ],
      fixed: ["Búsqueda ahora busca solo en business_name"],
    },
  },
  "2.0.9": {
    date: "2026-04-10",
    description: "Nuevas secciones Lecciones aprendidas y Actualidad kAI",
    changes: {
      added: [
        "Blog transformado a 'Lecciones aprendidas' con formulario estructurado",
        "Campos del formulario: problema, cómo te diste cuenta, consecuencias, medidas, prevención",
        "Nueva sección 'Actualidad kAI' con editor markdown y drag & drop de imágenes",
        "Filtros por autor y etiqueta en ambas secciones",
        "Etiquetas lecciones: Error, Bug, Agentes, Clientes, Comercial, Desarrollo, Interno",
        "Etiquetas actualidad: Evento, Anuncio, Comentarios",
        "Dialog para crear entradas (en lugar de página separada)",
      ],
    },
  },
  "2.0.8": {
    date: "2026-04-10",
    description:
      "Soporte para configuración de pipelines en el constructor de agentes",
    changes: {
      added: [
        "Nueva sección 'Pipelines' en el constructor de agentes",
        "Editor visual para configurar stages del pipeline de ventas",
        "5 stages por defecto: Oportunidades, Interés, Requiere Atención, Completado, Cancelado",
        "Personalización de nombre, color, tipo y orden de cada stage",
        "Botón Salir con confirmación de salida",
        "Confirmación al cerrar la pestaña del navegador",
      ],
    },
  },
  "2.0.7": {
    date: "2026-04-10",
    description: "Restricción de acceso a servicios de base de datos",
    changes: {
      added: [
        "Verificación de rol admin en todos los endpoints de servicios de base de datos",
        "Hook useUserRole para obtener el rol del usuario en el frontend",
        "Menú de Database ahora solo visible para usuarios con rol admin",
      ],
    },
  },
  "2.0.6": {
    date: "2026-04-08",
    description: "Mejoras en configuración de agentes y favoritos",
    changes: {
      added: [
        "Auto-sync de propiedades desde producción cuando un agente solo existe en kAI (muestra toast de confirmación)",
        "Botón de favoritos (estrella) en la página de detalle del agente",
      ],
      fixed: [
        "Campo business_name ahora se guarda en el nivel raíz del documento del agente",
        "Removido campo ai del nivel raíz del documento (ya está en properties/ai)",
      ],
      removed: [
        "Badge 'Solo en producción' del header del agente",
        "Banner de 'Sincronización necesaria' del editor de configuración",
      ],
    },
  },
  "2.0.5": {
    date: "2026-04-08",
    description:
      "Funcionalidad de testing para herramientas y configuración de agentes",
    changes: {
      added: [
        "Colecciones testing/data/collaborators, testing/data/properties y testing/data/tools se crean por defecto al crear un agente",
        "Editor de configuración ahora guarda en testing en lugar de producción",
        "Panel de herramientas incluye botones de sincronizar desde producción y subir a producción",
        "Diff de herramientas disponible en diálogo de promoción",
      ],
      changed: [
        "Flujo de propiedades: editar en testing → guardar en testing → promover a producción",
        "Flujo de herramientas: editar en testing → guardar en testing → promover a producción",
      ],
    },
  },
  "2.0.4": {
    date: "2026-04-08",
    description: "Fix en favoritos de agentes",
    changes: {
      fixed: [
        "Botón de favorito ya funciona correctamente",
        "Agregado feedback visual con spinner mientras carga",
        "Agregadas notificaciones de éxito/error",
      ],
    },
  },
  "2.0.3": {
    date: "2026-04-08",
    description: "Adjuntar imágenes al crear tareas de implementación",
    changes: {
      added: [
        "Permite adjuntar imágenes/archivos al crear nuevas tareas de implementación",
      ],
    },
  },
  "2.0.2": {
    date: "2026-04-07",
    description: "Mejoras en el constructor de agentes",
    changes: {
      added: [
        "Diálogo de confirmación al eliminar herramientas del agente",
        "Inicializar colección 'testing' al crear nuevo agente",
      ],
      improved: [
        "Protección de herramientas obligatorias (base de conocimiento y escalamiento a soporte)",
      ],
    },
  },
  "2.0.1": {
    date: "2026-04-07",
    description: "Added database services for Firestore data manipulation.",
    changes: {
      added: [
        "Database Services - Set of tools for managing Firestore data",
        "Upload Data - Upload JSON documents to Firestore collections",
        "Duplicate/Clone - Duplicate collections or documents between environments",
        "Update Document - Edit and update existing documents",
        "Viewer and Comparator - Compare documents across environments",
        "Document Explorer - Browse and explore Firestore documents and collections",
      ],
      improved: [
        "UI consistency across database pages",
        "Added header with menu and user menu to database pages",
      ],
    },
  },
  "2.0.0": {
    date: "2025-04-07",
    description:
      "Major release with agent builder, testing simulator, and improved organization management.",
    changes: {
      added: [
        "Agent Builder - Create and configure AI agents with custom prompts, tools, and behavior",
        "Agent Simulator - Test agents in a sandbox environment before production deployment",
        "Agent Testing - Validate agent behavior with implementation tasks",
        "Organization Management - Manage team members and roles",
        "Agent Prompts - Design and version agent system prompts",
        "Agent Tools - Configure tools available to agents",
        "Agent Configuration - Set agent properties and parameters",
        "Agent Flow Questions - Configure guided question flows for agent creation",
      ],
      changed: [
        "Completely redesigned the agent interface",
        "Improved navigation and user experience",
      ],
      fixed: ["Various bug fixes and performance improvements"],
      improved: [
        "Better error handling and feedback",
        "Enhanced security and authentication",
      ],
    },
  },
};

export function getAllVersions(): string[] {
  return Object.keys(changelogData).sort((a, b) => {
    const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
    const [bMajor, bMinor, bPatch] = b.split(".").map(Number);
    if (aMajor !== bMajor) return bMajor - aMajor;
    if (aMinor !== bMinor) return bMinor - aMinor;
    return bPatch - aPatch;
  });
}

export function getVersion(version: string): ChangelogEntry | undefined {
  return changelogData[version];
}

export function getAtlasVersions(): {
  version: string;
  entry: ChangelogEntry;
}[] {
  return getAllVersions().map((v) => ({ version: v, entry: changelogData[v] }));
}

export function getProjectById(id: ProjectId) {
  return PROJECTS.find((p) => p.id === id);
}

/** True si el usuario de sesión es el creador de la entrada (id o email de autor). */
export function canEditChangelogEntry(
  entry: DbChangelogEntry,
  sessionUser: { id?: string; email?: string | null } | null | undefined,
): boolean {
  if (!sessionUser) return false;
  const uid = sessionUser.id?.trim();
  if (uid && entry.createdByUserId && uid === entry.createdByUserId)
    return true;
  const e = sessionUser.email?.trim().toLowerCase();
  const a = entry.author?.email?.trim().toLowerCase();
  if (e && a && e === a) return true;
  return false;
}
