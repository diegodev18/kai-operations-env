"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2Icon } from "lucide-react";
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
  return date.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
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
          <Label htmlFor="serverStatusAuto">Estatus servidor (automático)</Label>
          <Input
            id="serverStatusAuto"
            value={SERVER_STATUS_LABELS_ES[data.serverStatusAuto]}
            readOnly
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="serverStatusOverride">Override de estatus servidor</Label>
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
          <Label htmlFor="serverStatusEffective">Estatus servidor efectivo</Label>
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

      <section className="rounded-lg border p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Última actualización
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Actualizado por</Label>
            <Input value={data.updatedBy ?? "Sistema"} readOnly />
          </div>
          <div className="space-y-1">
            <Label>Origen</Label>
            <Input value={data.updatedFrom} readOnly />
          </div>
          <div className="space-y-1">
            <Label>Razón</Label>
            <Input value={data.reasonCode ?? "—"} readOnly />
          </div>
          <div className="space-y-1">
            <Label>Fecha</Label>
            <Input value={formatDateTime(data.updatedAt)} readOnly />
          </div>
          <div className="space-y-1">
            <Label>Estatus comercial actual</Label>
            <Input value={COMMERCIAL_STATUS_LABELS_ES[data.commercialStatus]} readOnly />
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="button" onClick={() => void onSave()} disabled={saving || !hasChanges}>
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
