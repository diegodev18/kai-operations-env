/** Patrón de URL de avatar vía atajo de GitHub (`https://github.com/{login}.png`). */
const GITHUB_AVATAR_FROM_LOGIN_RE = /^https:\/\/github\.com\/([^/]+)\.png$/i;

export function parseGithubLoginFromImageUrl(
  image: string | null | undefined,
): string {
  if (!image?.trim()) return "";
  const m = image.trim().match(GITHUB_AVATAR_FROM_LOGIN_RE);
  return m?.[1] ? decodeURIComponent(m[1]) : "";
}

export function buildGithubAvatarUrl(login: string): string {
  const trimmed = login.trim().replace(/^@+/, "");
  return `https://github.com/${encodeURIComponent(trimmed)}.png`;
}

export function isValidGithubLogin(login: string): boolean {
  const s = login.trim().replace(/^@+/, "");
  if (s.length < 1 || s.length > 39) return false;
  if (s.startsWith("-") || s.endsWith("-")) return false;
  return /^[a-zA-Z0-9-]+$/.test(s);
}
