import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";

import { getFirestore, Timestamp } from "@/lib/firestore";
import { resolveAgentsAuthContext } from "@/routes/agents-auth";
import { isOperationsAdmin } from "@/utils/operations-access";
import {
  extractFirestoreIndexUrl,
  firestoreFailureHint,
  isFirebaseConfigError,
} from "@/utils/firestore/errors";
import { listUsersForOrganization } from "@/lib/invitations";

const BACKOFFICE = "backOffice";
const BON_DOC = "bonuses";

const TIP_AMOUNTS = [5, 10, 20] as const;

function tipsCol() {
  return getFirestore().collection(BACKOFFICE).doc(BON_DOC).collection("tips");
}

function walletRef() {
  return getFirestore()
    .collection(BACKOFFICE)
    .doc(BON_DOC)
    .collection("adminWallet")
    .doc("singleton");
}

function userBalanceRef(userId: string) {
  return getFirestore()
    .collection(BACKOFFICE)
    .doc(BON_DOC)
    .collection("userBalances")
    .doc(userId);
}

function walletEventsCol() {
  return getFirestore()
    .collection(BACKOFFICE)
    .doc(BON_DOC)
    .collection("walletEvents");
}

const sendTipSchema = z.object({
  recipientId: z.string().trim().min(1),
  recipientName: z.string().trim().min(1),
  recipientEmail: z.string().trim().email(),
  amount: z.union([z.literal(5), z.literal(10), z.literal(20)]),
  description: z.string().trim().min(25, "La descripción debe tener al menos 25 caracteres"),
});

const loadWalletSchema = z.object({
  amount: z.number().positive("El monto debe ser mayor a 0"),
});

const redeemSchema = z.object({
  userId: z.string().trim().min(1),
});

function tsToIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (
    value != null &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function firestoreErr(c: Context, error: unknown, prefix: string) {
  if (isFirebaseConfigError(error)) {
    return c.json({ error: "Firebase no configurado." }, 503);
  }
  const hint = firestoreFailureHint(error);
  const msg = error instanceof Error ? error.message : String(error);
  const createIndexUrl = extractFirestoreIndexUrl(msg);
  console.error(`${prefix} Firestore:`, msg);
  if (hint) {
    return c.json(
      { error: hint, ...(createIndexUrl ? { createIndexUrl } : {}) },
      503,
    );
  }
  return c.json({ error: "Error al acceder a Firestore." }, 500);
}

async function requireAuth(c: Context) {
  const result = await resolveAgentsAuthContext(c);
  if (!result.ok) return { ok: false as const, response: result.response };
  return { ok: true as const, authCtx: result.authCtx };
}

async function requireAdmin(c: Context) {
  const result = await resolveAgentsAuthContext(c);
  if (!result.ok) return { ok: false as const, response: result.response };
  if (!isOperationsAdmin(result.authCtx.userRole)) {
    return {
      ok: false as const,
      response: c.json({ error: "Solo el administrador puede realizar esta acción." }, 403),
    };
  }
  return { ok: true as const, authCtx: result.authCtx };
}

function serializeTip(id: string, d: Record<string, unknown>) {
  return {
    id,
    senderId: d.senderId,
    senderName: d.senderName,
    senderEmail: d.senderEmail,
    recipientId: d.recipientId,
    recipientName: d.recipientName,
    recipientEmail: d.recipientEmail,
    amount: d.amount,
    description: d.description,
    createdAt: tsToIso(d.createdAt),
  };
}

export const bonusesRouter = new Hono();

// ─── Wallet (admin) ───────────────────────────────────────────────────────────

bonusesRouter.get("/admin/wallet", async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return auth.response;

  try {
    const snap = await walletRef().get();
    if (!snap.exists) {
      return c.json({ balanceMxn: 0, lastUpdatedAt: null });
    }
    const d = snap.data() as Record<string, unknown>;
    return c.json({
      balanceMxn: d.balanceMxn ?? 0,
      lastUpdatedAt: tsToIso(d.lastUpdatedAt),
    });
  } catch (error) {
    return firestoreErr(c, error, "[bonificaciones/admin/wallet GET]");
  }
});

bonusesRouter.post("/admin/wallet/load", async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return auth.response;
  const { userId, userEmail, userName } = auth.authCtx;

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = loadWalletSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return c.json({ error: msg }, 400);
  }

  try {
    const db = getFirestore();
    const snap = await walletRef().get();
    const current = snap.exists ? ((snap.data() as Record<string, unknown>).balanceMxn as number ?? 0) : 0;
    const newBalance = current + parsed.data.amount;
    const now = Timestamp.now();

    const eventId = nanoid();
    const batch = db.batch();

    batch.set(walletRef(), {
      balanceMxn: newBalance,
      lastUpdatedAt: now,
      updatedByUserId: userId ?? "",
      updatedByEmail: userEmail ?? "",
    });

    batch.set(walletEventsCol().doc(eventId), {
      adminId: userId ?? "",
      adminName: userName ?? userEmail ?? "",
      adminEmail: userEmail ?? "",
      amount: parsed.data.amount,
      newBalance,
      createdAt: now,
    });

    await batch.commit();

    return c.json({ ok: true, balanceMxn: newBalance });
  } catch (error) {
    return firestoreErr(c, error, "[bonificaciones/admin/wallet/load POST]");
  }
});

// ─── Team members (for recipient dropdown) ────────────────────────────────────

bonusesRouter.get("/team-members", async (c) => {
  const auth = await requireAuth(c);
  if (!auth.ok) return auth.response;

  try {
    const users = await listUsersForOrganization();
    return c.json({
      members: users.map((u) => ({
        id: u.id,
        name: u.name ?? u.email,
        email: u.email,
        image: u.image ?? null,
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[bonificaciones/team-members GET]:", msg);
    return c.json({ error: "Error al obtener el equipo." }, 500);
  }
});

// ─── Tips ─────────────────────────────────────────────────────────────────────

bonusesRouter.post("/tips", async (c) => {
  const auth = await requireAuth(c);
  if (!auth.ok) return auth.response;
  const { userId, userEmail, userName } = auth.authCtx;

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = sendTipSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => i.path.join(".") + ": " + i.message)
      .join("; ");
    return c.json({ error: msg }, 400);
  }

  if (parsed.data.recipientId === userId) {
    return c.json({ error: "No puedes enviarte una propina a ti mismo." }, 400);
  }

  const db = getFirestore();

  try {
    // check admin wallet has enough balance
    const walletSnap = await walletRef().get();
    const walletBalance = walletSnap.exists
      ? ((walletSnap.data() as Record<string, unknown>).balanceMxn as number ?? 0)
      : 0;

    if (walletBalance < parsed.data.amount) {
      return c.json(
        { error: `Saldo insuficiente en el monedero. Disponible: $${walletBalance} MXN.` },
        409,
      );
    }

    const tipId = nanoid();
    const now = Timestamp.now();
    const tipData = {
      senderId: userId ?? "",
      senderName: userName ?? userEmail ?? "",
      senderEmail: userEmail ?? "",
      recipientId: parsed.data.recipientId,
      recipientName: parsed.data.recipientName,
      recipientEmail: parsed.data.recipientEmail,
      amount: parsed.data.amount,
      description: parsed.data.description,
      createdAt: now,
    };

    // transactional write: deduct from wallet, increment recipient balance, save tip
    const batch = db.batch();

    batch.set(tipsCol().doc(tipId), tipData);
    batch.update(walletRef(), {
      balanceMxn: walletBalance - parsed.data.amount,
      lastUpdatedAt: now,
    });

    const recipientRef = userBalanceRef(parsed.data.recipientId);
    const recipientSnap = await recipientRef.get();
    if (recipientSnap.exists) {
      const currentBalance = (recipientSnap.data() as Record<string, unknown>).balanceMxn as number ?? 0;
      batch.update(recipientRef, {
        balanceMxn: currentBalance + parsed.data.amount,
        lastUpdatedAt: now,
      });
    } else {
      batch.set(recipientRef, {
        userId: parsed.data.recipientId,
        userName: parsed.data.recipientName,
        userEmail: parsed.data.recipientEmail,
        balanceMxn: parsed.data.amount,
        lastUpdatedAt: now,
      });
    }

    await batch.commit();

    return c.json(serializeTip(tipId, tipData as Record<string, unknown>), 201);
  } catch (error) {
    return firestoreErr(c, error, "[bonificaciones/tips POST]");
  }
});

bonusesRouter.get("/tips", async (c) => {
  const auth = await requireAuth(c);
  if (!auth.ok) return auth.response;
  const { userId, userRole } = auth.authCtx;

  try {
    let snap;
    if (isOperationsAdmin(userRole)) {
      snap = await tipsCol().orderBy("createdAt", "desc").get();
    } else {
      // members see only tips they sent or received
      const [sentSnap, receivedSnap] = await Promise.all([
        tipsCol().where("senderId", "==", userId).get(),
        tipsCol().where("recipientId", "==", userId).get(),
      ]);
      const seen = new Set<string>();
      const docs = [...sentSnap.docs, ...receivedSnap.docs].filter((d) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });
      const tips = docs
        .map((d) => serializeTip(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => ((b.createdAt ?? "") > (a.createdAt ?? "") ? 1 : -1));
      return c.json({ tips });
    }

    const tips = snap.docs.map((d) =>
      serializeTip(d.id, d.data() as Record<string, unknown>),
    );
    return c.json({ tips });
  } catch (error) {
    return firestoreErr(c, error, "[bonificaciones/tips GET]");
  }
});

// ─── My balance ───────────────────────────────────────────────────────────────

bonusesRouter.get("/my-balance", async (c) => {
  const auth = await requireAuth(c);
  if (!auth.ok) return auth.response;
  const { userId } = auth.authCtx;

  try {
    const snap = await userBalanceRef(userId ?? "").get();
    if (!snap.exists) {
      return c.json({ balanceMxn: 0 });
    }
    const d = snap.data() as Record<string, unknown>;
    return c.json({ balanceMxn: d.balanceMxn ?? 0 });
  } catch (error) {
    return firestoreErr(c, error, "[bonificaciones/my-balance GET]");
  }
});

// ─── Admin: all balances ──────────────────────────────────────────────────────

bonusesRouter.get("/admin/balances", async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return auth.response;

  try {
    const snap = await getFirestore()
      .collection(BACKOFFICE)
      .doc(BON_DOC)
      .collection("userBalances")
      .get();

    const balances = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        userId: d.id,
        userName: data.userName ?? "",
        userEmail: data.userEmail ?? "",
        balanceMxn: data.balanceMxn ?? 0,
        lastUpdatedAt: tsToIso(data.lastUpdatedAt),
      };
    });

    return c.json({ balances });
  } catch (error) {
    return firestoreErr(c, error, "[bonificaciones/admin/balances GET]");
  }
});

// ─── Admin: redeem balance ────────────────────────────────────────────────────

bonusesRouter.post("/admin/redeem", async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "JSON inválido" }, 400);
  }

  const parsed = redeemSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return c.json({ error: msg }, 400);
  }

  try {
    const ref = userBalanceRef(parsed.data.userId);
    const snap = await ref.get();
    if (!snap.exists) {
      return c.json({ error: "Colaborador sin saldo registrado." }, 404);
    }
    const data = snap.data() as Record<string, unknown>;
    const previousBalance = (data.balanceMxn as number) ?? 0;

    await ref.update({
      balanceMxn: 0,
      lastUpdatedAt: Timestamp.now(),
    });

    return c.json({ ok: true, previousBalance });
  } catch (error) {
    return firestoreErr(c, error, "[bonificaciones/admin/redeem POST]");
  }
});

// ─── Activity feed (tips + wallet load events) ────────────────────────────────

bonusesRouter.get("/activity", async (c) => {
  const auth = await requireAuth(c);
  if (!auth.ok) return auth.response;
  const { userId, userRole } = auth.authCtx;
  const isAdmin = isOperationsAdmin(userRole);

  try {
    // Tips: admins see all; members see only their own
    let tipDocs: ReturnType<typeof serializeTip>[] = [];
    if (isAdmin) {
      const snap = await tipsCol().orderBy("createdAt", "desc").get();
      tipDocs = snap.docs.map((d) => serializeTip(d.id, d.data() as Record<string, unknown>));
    } else {
      const [sentSnap, receivedSnap] = await Promise.all([
        tipsCol().where("senderId", "==", userId).get(),
        tipsCol().where("recipientId", "==", userId).get(),
      ]);
      const seen = new Set<string>();
      const docs = [...sentSnap.docs, ...receivedSnap.docs].filter((d) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });
      tipDocs = docs
        .map((d) => serializeTip(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => ((b.createdAt ?? "") > (a.createdAt ?? "") ? 1 : -1));
    }

    const tips = tipDocs.map((t) => ({ type: "tip" as const, ...t }));

    // Wallet events: only admins see them
    let walletEvents: Array<{
      type: "walletLoad";
      id: string;
      adminId: string;
      adminName: string;
      adminEmail: string;
      amount: number;
      newBalance: number;
      createdAt: string | null;
    }> = [];

    if (isAdmin) {
      const evSnap = await walletEventsCol().orderBy("createdAt", "desc").get();
      walletEvents = evSnap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          type: "walletLoad" as const,
          id: d.id,
          adminId: (data.adminId as string) ?? "",
          adminName: (data.adminName as string) ?? "",
          adminEmail: (data.adminEmail as string) ?? "",
          amount: (data.amount as number) ?? 0,
          newBalance: (data.newBalance as number) ?? 0,
          createdAt: tsToIso(data.createdAt),
        };
      });
    }

    // Merge and sort by createdAt desc
    const activity = [...tips, ...walletEvents].sort((a, b) =>
      (b.createdAt ?? "") > (a.createdAt ?? "") ? 1 : -1,
    );

    return c.json({ activity });
  } catch (error) {
    return firestoreErr(c, error, "[bonificaciones/activity GET]");
  }
});

export { TIP_AMOUNTS };
