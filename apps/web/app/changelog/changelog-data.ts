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
