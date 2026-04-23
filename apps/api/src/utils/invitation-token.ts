import { createHash, randomBytes } from "node:crypto";

export function generateInvitationPlainToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(plainToken: string): string {
  return createHash("sha256").update(plainToken, "utf8").digest("hex");
}
