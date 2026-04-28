export type ConfigurationSectionNavItem = {
  id: string;
  label: string;
};

export function ConfigurationSectionNav({
  sections,
}: {
  sections: ConfigurationSectionNavItem[];
}) {
  return (
    <aside className="hidden lg:sticky lg:top-4 lg:block">
      <nav className="space-y-1 rounded-2xl border bg-card/70 p-2 text-sm">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="block rounded-xl px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {section.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
