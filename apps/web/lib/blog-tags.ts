export const BLOG_TAGS = [
  "Error",
  "Bug",
  "Agentes",
  "Clientes",
  "Comercial",
  "Desarrollo",
  "Interno",
] as const;

export type BlogTag = (typeof BLOG_TAGS)[number];