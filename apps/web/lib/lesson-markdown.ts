export interface LessonFields {
  problem: string;
  howDiscovered: string;
  consequences: string;
  measuresTaken: string;
  prevention: string;
}

export function generateMarkdown(fields: LessonFields): string {
  const parts: string[] = [];

  if (fields.problem.trim()) {
    parts.push(`## ¿Qué problema se presentó?\n${fields.problem.trim()}`);
  }

  if (fields.howDiscovered.trim()) {
    parts.push(`## ¿Cómo te diste cuenta?\n${fields.howDiscovered.trim()}`);
  }

  if (fields.consequences.trim()) {
    parts.push(
      `## ¿Cuáles son las consecuencias?\n${fields.consequences.trim()}`,
    );
  }

  if (fields.measuresTaken.trim()) {
    parts.push(`## ¿Qué medidas tomaste?\n${fields.measuresTaken.trim()}`);
  }

  if (fields.prevention.trim()) {
    parts.push(
      `## ¿Qué acciones se tomarán para que no se repita?\n${fields.prevention.trim()}`,
    );
  }

  return parts.join("\n\n");
}

const sectionHeaders: Record<keyof LessonFields, RegExp> = {
  problem: /¿Qué problema se presentó\?/i,
  howDiscovered: /¿Cómo te diste cuenta\?/i,
  consequences: /¿Cuáles son las consecuencias\?/i,
  measuresTaken: /¿Qué medidas tomaste\?/i,
  prevention: /¿Qué acciones se tomarán para que no se repita\?/i,
};

export function parseMarkdownContent(content: string): LessonFields {
  const sections: Record<keyof LessonFields, string> = {
    problem: "",
    howDiscovered: "",
    consequences: "",
    measuresTaken: "",
    prevention: "",
  };

  const lines = content.split("\n");
  let currentSection: keyof LessonFields | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)$/);

    if (headerMatch) {
      const header = headerMatch[1];
      let matchedSection: keyof LessonFields | null = null;

      for (const [key, regex] of Object.entries(sectionHeaders)) {
        if (regex.test(header)) {
          matchedSection = key as keyof LessonFields;
          break;
        }
      }

      if (matchedSection) {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join("\n").trim();
        }
        currentSection = matchedSection;
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  if (currentSection && currentContent.length > 0) {
    sections[currentSection] = currentContent.join("\n").trim();
  }

  return sections;
}
