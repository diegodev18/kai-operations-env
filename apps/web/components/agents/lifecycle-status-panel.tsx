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

const COMMERCIAL_STATUS_LABELS: Record<AgentCommercialStatus, string> = {
  building: "Construyendo",
  internal_test: "Prueba interna",
  client_test: "Prueba con cliente",
  iterating: "Iterando",
  delivered: "Entregado",
};

const SERVER_STATUS_LABELS: Record<AgentServerStatus, string> = {
  active: "Activo",
  disabled: "Desactivado",
  no_connected_number: "Sin número conectado",
};

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

  const hydrateForm = useCallback((next: AgentImplementationLifecycle) => {
    setData(next);
    setSoldAtInput(toDateInputValue(next.soldAt));
    setNextMeetingAtInput(toDateInputValue(next.nextMeetingAt));
    setCommercialStatus(next.commercialStatus);
    setServerStatusOverride(next.serverStatusOverride ?? "auto");
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
        data.serverStatusOverride
    );
  }, [commercialStatus, data, nextMeetingAtInput, serverStatusOverride, soldAtInput]);

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
            value={SERVER_STATUS_LABELS[data.serverStatusAuto]}
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
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="disabled">Desactivado</SelectItem>
              <SelectItem value="no_connected_number">
                Sin número conectado
              </SelectItem>
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
              <SelectItem value="building">Construyendo</SelectItem>
              <SelectItem value="internal_test">Prueba interna</SelectItem>
              <SelectItem value="client_test">Prueba con cliente</SelectItem>
              <SelectItem value="iterating">Iterando</SelectItem>
              <SelectItem value="delivered">Entregado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="serverStatusEffective">Estatus servidor efectivo</Label>
          <Input
            id="serverStatusEffective"
            value={SERVER_STATUS_LABELS[data.serverStatus]}
            readOnly
          />
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
