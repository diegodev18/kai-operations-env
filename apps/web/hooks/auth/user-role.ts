import { useAuth } from "./auth";

export function useUserRole() {
  const { session } = useAuth();
  const role = (session?.user as { role?: string })?.role ?? "member";
  const isAdmin = role === "admin";
  return { role, isAdmin };
}
