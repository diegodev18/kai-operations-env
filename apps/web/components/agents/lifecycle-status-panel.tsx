"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIcon,
  CalendarClockIcon,
  Loader2Icon,
  UserCircle2Icon,
} from "lucide-react";
import { toast } from "sonner";

import type {
  AgentCommercialStatus,
  AgentImplementationLifecycle,
  AgentServerStatus,
} from "@/types";
import {
  COMMERCIAL_STATUS_LABELS_ES,
  COMMERCIAL_STATUS_OPTIONS,
  SERVER_STATUS_LABELS_ES,
  SERVER_STATUS_OPTIONS,
} from "@/consts/agent-lifecycle";
import {
  fetchImplementationLifecycle,
  patchImplementationLifecycle,
} from "@/services/agents-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toIsoFromDateInput(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function AgentLifecycleStatusPanel({ agentId }: { agentId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<AgentImplementationLifecycle | null>(null);
  const [soldAtInput, setSoldAtInput] = useState("");
  const [nextMeetingAtInput, setNextMeetingAtInput] = useState("");
  const [commercialStatus, setCommercialStatus] =
    useState<AgentCommercialStatus>("building");
  const [serverStatusOverride, setServerStatusOverride] = useState<
    AgentServerStatus | "auto"
  >("auto");
  const [reasonCode, setReasonCode] = useState("");

  const hydrateForm = useCallback((next: AgentImplementationLifecycle) => {
    setData(next);
    setSoldAtInput(toDateInputValue(next.soldAt));
    setNextMeetingAtInput(toDateInputValue(next.nextMeetingAt));
    setCommercialStatus(next.commercialStatus);
    setServerStatusOverride(next.serverStatusOverride ?? "auto");
    setReasonCode(next.reasonCode ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const lifecycle = await fetchImplementationLifecycle(agentId);
      if (!lifecycle) {
        toast.error("No se pudo cargar fechas y estado");
        setData(null);
        return;
      }
      hydrateForm(lifecycle);
    } finally {
      setLoading(false);
    }
  }, [agentId, hydrateForm]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void (async () => {
        const lifecycle = await fetchImplementationLifecycle(agentId);
        if (lifecycle) hydrateForm(lifecycle);
      })();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [agentId, hydrateForm]);

  const hasChanges = useMemo(() => {
    if (!data) return false;
    return (
      toIsoFromDateInput(soldAtInput) !== data.soldAt ||
      toIsoFromDateInput(nextMeetingAtInput) !== data.nextMeetingAt ||
      commercialStatus !== data.commercialStatus ||
      (serverStatusOverride === "auto" ? null : serverStatusOverride) !==
        data.serverStatusOverride ||
      reasonCode.trim() !== (data.reasonCode ?? "")
    );
  }, [
    commercialStatus,
    data,
    nextMeetingAtInput,
    reasonCode,
    serverStatusOverride,
    soldAtInput,
  ]);

  const onSave = useCallback(async () => {
    if (!data || !hasChanges) return;
    setSaving(true);
    try {
      const result = await patchImplementationLifecycle(agentId, {
        soldAt: toIsoFromDateInput(soldAtInput),
        nextMeetingAt: toIsoFromDateInput(nextMeetingAtInput),
        commercialStatus,
        serverStatusOverride:
          serverStatusOverride === "auto" ? null : serverStatusOverride,
        updatedFrom: "manual",
        reasonCode: reasonCode.trim() || null,
        idempotencyKey:
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${agentId}`,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      hydrateForm(result.lifecycle);
      toast.success("Fechas y estado actualizados");
    } finally {
      setSaving(false);
    }
  }, [
    agentId,
    commercialStatus,
    data,
    hasChanges,
    hydrateForm,
    nextMeetingAtInput,
    serverStatusOverride,
    soldAtInput,
    reasonCode,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        No fue posible cargar la información de fechas y estado.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold text-foreground">Fechas y estado</h2>

      <section className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Fecha de creación</Label>
          <Input value={formatDateTime(data.createdAt)} readOnly />
        </div>
        <div className="space-y-2">
          <Label>Fecha de entrega (automática)</Label>
          <Input value={formatDateTime(data.deliveredAt)} readOnly />
        </div>
        <div className="space-y-2">
          <Label htmlFor="soldAt">Fecha de venta</Label>
          <Input
            id="soldAt"
            type="date"
            value={soldAtInput}
            onChange={(e) => setSoldAtInput(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nextMeetingAt">Fecha de próxima reunión</Label>
          <Input
            id="nextMeetingAt"
            type="date"
            value={nextMeetingAtInput}
            onChange={(e) => setNextMeetingAtInput(e.target.value)}
          />
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="serverStatusAuto">
            Estatus servidor (automático)
          </Label>
          <Input
            id="serverStatusAuto"
            value={SERVER_STATUS_LABELS_ES[data.serverStatusAuto]}
            readOnly
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="serverStatusOverride">
            Override de estatus servidor
          </Label>
          <Select
            value={serverStatusOverride}
            onValueChange={(value) =>
              setServerStatusOverride(value as AgentServerStatus | "auto")
            }
          >
            <SelectTrigger id="serverStatusOverride">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automático</SelectItem>
              {SERVER_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.labelEs}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="commercialStatus">Estatus comercial</Label>
          <Select
            value={commercialStatus}
            onValueChange={(value) =>
              setCommercialStatus(value as AgentCommercialStatus)
            }
          >
            <SelectTrigger id="commercialStatus">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMERCIAL_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.labelEs}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="serverStatusEffective">
            Estatus servidor efectivo
          </Label>
          <Input
            id="serverStatusEffective"
            value={SERVER_STATUS_LABELS_ES[data.serverStatus]}
            readOnly
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="reasonCode">Razón del cambio</Label>
          <Input
            id="reasonCode"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            placeholder="Ej. solicitud_cliente, seguimiento_semanal"
          />
          <p className="text-xs text-muted-foreground">
            Se guarda como metadato para trazabilidad en bitácora.
          </p>
        </div>
      </section>

      <section className="space-y-2 rounded-lg border p-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Resumen
        </h3>
        <div className="relative space-y-2.5 pl-4">
          <div className="pointer-events-none absolute left-2 top-2 bottom-2 w-px bg-border" />

          <Card className="relative gap-0!">
            <span className="absolute -left-5 top-4 flex size-6 items-center justify-center rounded-full border bg-muted ring-2 ring-background">
              <CalendarClockIcon className="size-3 text-muted-foreground" />
            </span>
            <CardHeader className="pb-0 pt-2.5">
              <CardTitle className="text-xs">Fechas clave</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1.5 pt-1 text-xs sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Creación:</span>{" "}
                {formatDateTime(data.createdAt)}
              </p>
              <p>
                <span className="text-muted-foreground">Venta:</span>{" "}
                {formatDateTime(data.soldAt)}
              </p>
              <p>
                <span className="text-muted-foreground">Entrega:</span>{" "}
                {formatDateTime(data.deliveredAt)}
              </p>
              <p>
                <span className="text-muted-foreground">Próxima reunión:</span>{" "}
                {formatDateTime(data.nextMeetingAt)}
              </p>
            </CardContent>
          </Card>

          <Card className="relative gap-0!">
            <span className="absolute -left-5 top-4 flex size-6 items-center justify-center rounded-full border bg-muted ring-2 ring-background">
              <ActivityIcon className="size-3 text-muted-foreground" />
            </span>
            <CardHeader className="pb-0 pt-2.5">
              <CardTitle className="text-xs">Estados y permanencia</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1.5 pt-1 text-xs sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Comercial:</span>{" "}
                {COMMERCIAL_STATUS_LABELS_ES[data.commercialStatus]}
              </p>
              <p>
                <span className="text-muted-foreground">
                  Servidor (efectivo):
                </span>{" "}
                {SERVER_STATUS_LABELS_ES[data.serverStatus]}
              </p>
              <p>
                <span className="text-muted-foreground">Servidor (auto):</span>{" "}
                {SERVER_STATUS_LABELS_ES[data.serverStatusAuto]}
              </p>
              <p>
                <span className="text-muted-foreground">
                  Servidor (override):
                </span>{" "}
                {data.serverStatusOverride
                  ? SERVER_STATUS_LABELS_ES[data.serverStatusOverride]
                  : "Automático"}
              </p>
              <p>
                <span className="text-muted-foreground">
                  Días en estado comercial:
                </span>{" "}
                {data.daysInCommercialState}
              </p>
              <p>
                <span className="text-muted-foreground">
                  Días en estado servidor:
                </span>{" "}
                {data.daysInServerState}
              </p>
            </CardContent>
          </Card>

          <Card className="relative gap-0!">
            <span className="absolute -left-5 top-4 flex size-6 items-center justify-center rounded-full border bg-muted ring-2 ring-background">
              <UserCircle2Icon className="size-3 text-muted-foreground" />
            </span>
            <CardHeader className="pb-0 pt-2.5">
              <CardTitle className="text-xs">Última actualización</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1.5 pt-1 text-xs sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Actor:</span>{" "}
                {data.updatedBy ?? "Sistema"}
              </p>
              <p>
                <span className="text-muted-foreground">Origen:</span>{" "}
                {data.updatedFrom}
              </p>
              <p>
                <span className="text-muted-foreground">Razón:</span>{" "}
                {data.reasonCode ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Fecha:</span>{" "}
                {formatDateTime(data.updatedAt)}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => void onSave()}
          disabled={saving || !hasChanges}
        >
          {saving ? (
            <>
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              Guardando...
            </>
          ) : (
            "Guardar cambios"
          )}
        </Button>
      </div>
    </div>
  );
}
