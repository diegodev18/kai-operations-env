export function isOperationsAdmin(role: string | null | undefined): boolean {
  return (role ?? "").toLowerCase().trim() === "admin";
}
