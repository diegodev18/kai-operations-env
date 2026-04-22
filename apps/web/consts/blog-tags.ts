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

export const ACTUALITY_TAGS = [
  "Evento",
  "Anuncio",
  "Comentarios",
  "Founder's Letter",
] as const;

export type ActualityTag = (typeof ACTUALITY_TAGS)[number];
