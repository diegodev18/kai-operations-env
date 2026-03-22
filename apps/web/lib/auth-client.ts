import { createAuthClient } from "better-auth/react";

const baseURL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

export const authClient = createAuthClient({
  baseURL: baseURL.length > 0 ? baseURL : undefined,
});
