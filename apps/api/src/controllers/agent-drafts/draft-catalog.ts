import type { Context } from "hono";

import { getFirestore } from "@/lib/firestore";
import type { AgentsInfoAuthContext } from "@/types/agents";

import { handleFirestoreError } from "@/utils/agent-drafts/access";
import { TOOLS_CATALOG } from "@/utils/agent-drafts/constants";

export async function getToolsCatalog(
  c: Context,
  _authCtx: AgentsInfoAuthContext,
) {
  try {
    const db = getFirestore();
    const snap = await db.collection(TOOLS_CATALOG).get();
    const tools = snap.docs
      .map((doc) => {
        const d = doc.data() as Record<string, unknown>;
        const status = typeof d.status === "string" ? d.status : "";
        if (status !== "active") return null;
        return {
          id: doc.id,
          name: typeof d.name === "string" ? d.name : "",
          displayName: typeof d.displayName === "string" ? d.displayName : "",
          description: typeof d.description === "string" ? d.description : "",
          path: typeof d.path === "string" ? d.path : "",
          type: typeof d.type === "string" ? d.type : "default",
          category: typeof d.category === "string" ? d.category : "",
          parameters:
            d.parameters != null &&
            typeof d.parameters === "object" &&
            !Array.isArray(d.parameters)
              ? d.parameters
              : undefined,
          properties:
            d.properties != null &&
            typeof d.properties === "object" &&
            !Array.isArray(d.properties)
              ? d.properties
              : undefined,
          crmConfig: d.crmConfig,
        };
      })
      .filter(
        (t): t is NonNullable<typeof t> => t !== null && t.name.length > 0,
      );

    tools.sort((a, b) =>
      (a.displayName || a.name).localeCompare(b.displayName || b.name, "es"),
    );

    return c.json({ tools });
  } catch (error) {
    const r = handleFirestoreError(c, error, "[agents/tools-catalog]");
    return r ?? c.json({ error: "Error al leer catálogo." }, 500);
  }
}
