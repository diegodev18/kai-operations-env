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

export const changelogData: Record<string, ChangelogEntry> = {
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
