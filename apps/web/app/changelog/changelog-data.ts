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
  "2.0.2": {
    date: "2026-04-07",
    description: "Mejoras en el constructor de agentes",
    changes: {
      added: ["Diálogo de confirmación al eliminar herramientas del agente"],
      improved: ["Protección de herramientas obligatorias (base de conocimiento y escalamiento a soporte)"],
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
