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
    parts.push(`> **¿Qué problema se presentó?**\n\n${fields.problem.trim()}`);
  }

  if (fields.howDiscovered.trim()) {
    parts.push(
      `> **¿Cómo te diste cuenta?**\n\n${fields.howDiscovered.trim()}`,
    );
  }

  if (fields.consequences.trim()) {
    parts.push(
      `> **¿Cuáles son las consecuencias?**\n\n${fields.consequences.trim()}`,
    );
  }

  if (fields.measuresTaken.trim()) {
    parts.push(`> **¿Qué medidas tomaste?**\n\n${fields.measuresTaken.trim()}`);
  }

  if (fields.prevention.trim()) {
    parts.push(
      `> **¿Qué acciones se tomarán para que no se repita?**\n\n${fields.prevention.trim()}`,
    );
  }

  return parts.join("\n\n---\n\n");
}

const sectionHeaders: Record<keyof LessonFields, RegExp> = {
  problem: /^>?\s*\*{0,2}\s*¿Qué problema se presentó\?\s*\*{0,2}$/i,
  howDiscovered: /^>?\s*\*{0,2}\s*¿Cómo te diste cuenta\?\s*\*{0,2}$/i,
  consequences: /^>?\s*\*{0,2}\s*¿Cuáles son las consecuencias\?\s*\*{0,2}$/i,
  measuresTaken: /^>?\s*\*{0,2}\s*¿Qué medidas tomaste\?\s*\*{0,2}$/i,
  prevention:
    /^>?\s*\*{0,2}\s*¿Qué acciones se tomarán para que no se repita\?\s*\*{0,2}$/i,
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
    const normalizedLine = line.trim();
    const markdownHeader = normalizedLine.match(/^##\s+(.+)$/);
    const blockquoteHeader = normalizedLine.match(/^>\s*(.+)$/);
    const headerText = markdownHeader?.[1] ?? blockquoteHeader?.[1];

    if (headerText) {
      const header = headerText.trim();
      let matchedSection: keyof LessonFields | null = null;

      for (const [key, regex] of Object.entries(sectionHeaders)) {
        if (regex.test(header)) {
          matchedSection = key as keyof LessonFields;
          break;
        }
      }

      if (matchedSection) {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent
            .join("\n")
            .replace(/^\s*---\s*$/gm, "")
            .trim();
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
    sections[currentSection] = currentContent
      .join("\n")
      .replace(/^\s*---\s*$/gm, "")
      .trim();
  }

  return sections;
}
