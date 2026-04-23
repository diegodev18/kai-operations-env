import { authClient } from "@/lib/auth/auth-client";

export function useAuth() {
  const session = authClient.useSession();

  return {
    session: session.data,
    isPending: session.isPending,
    error: session.error,
    refetch: session.refetch,
    signOut: authClient.signOut,
  };
}
