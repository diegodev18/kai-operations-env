/** Cursor de paginación member: path completo del doc en subcolección growers. */
export function isGrowerCursor(cursor: string): boolean {
  return cursor.includes("/growers/");
}
