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

export const PROJECTS: { id: ProjectId; name: string; description: string }[] = [
  { id: "atlas", name: "Atlas", description: "BackOffice - Sistema de gestión operativa" },
  { id: "panel", name: "Panel Web", description: "Panel Web / CRM de kAI" },
  { id: "agents", name: "kAI Agents", description: "Core de agentes IA" },
  { id: "tools", name: "Tools MCP", description: "Herramientas MCP" },
];

export const changelogData: Record<string, ChangelogEntry> = {
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
    description:
      "Agente: header sin badges de entorno (Testing / Producción)",
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
    description: "Changelogs Firebase (Panel, Agents, Tools): proxy, permisos, UX y versión semver",
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
    description: "Constructor de agentes: persistencia completa y aprovisionamiento al crear",
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
        "API routes para operaciones CRUD"],
      changed: [
        "Changelog principal ahora muestra selector de proyectos"],
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
    description: "Botón de sincronización de toolsCatalog a documento de la tool del agente",
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
      fixed: [
        "Búsqueda ahora busca solo en business_name",
      ],
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
    description: "Soporte para configuración de pipelines en el constructor de agentes",
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
    description: "Funcionalidad de testing para herramientas y configuración de agentes",
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
    description: "Major release with agent builder, testing simulator, and improved organization management.",
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
      fixed: [
        "Various bug fixes and performance improvements",
      ],
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

export function getAtlasVersions(): { version: string; entry: ChangelogEntry }[] {
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
  if (uid && entry.createdByUserId && uid === entry.createdByUserId) return true;
  const e = sessionUser.email?.trim().toLowerCase();
  const a = entry.author?.email?.trim().toLowerCase();
  if (e && a && e === a) return true;
  return false;
}
