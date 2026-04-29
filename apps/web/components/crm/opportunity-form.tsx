"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  CrmCompany,
  CrmOpportunity,
  CrmOpportunityInput,
  CrmOpportunityStage,
} from "@/types";
import { CRM_OPPORTUNITY_STAGE_LABELS } from "@/types";
import {
  fetchOrganizationUsers,
  type OrganizationUser,
} from "@/services/organization-api";

const STAGES = Object.entries(CRM_OPPORTUNITY_STAGE_LABELS) as [
  CrmOpportunityStage,
  string,
][];

const FEATURE_OPTIONS = [
  "Base de conocimiento",
  "Agendamiento",
  "Venta de productos",
  "Levantamiento de datos",
  "CRM",
  "Conexión API",
  "WhatsApp",
  "Facturación",
  "Soporte técnico",
];

function emptyForm(defaults?: { companyId?: string; companyName?: string }): CrmOpportunityInput {
  return {
    name: "",
    companyId: defaults?.companyId ?? "",
    companyName: defaults?.companyName ?? "",
    contactName: "",
    contactPhone: "",
    stage: "prospecto",
    mrr: undefined,
    implementerName: "",
    featuresToImplement: [],
    notes: "",
  };
}

function opportunityToForm(o: CrmOpportunity): CrmOpportunityInput {
  return {
    name: o.name,
    companyId: o.companyId,
    companyName: o.companyName,
    contactName: o.contactName ?? "",
    contactPhone: o.contactPhone ?? "",
    stage: o.stage,
    mrr: o.mrr,
    implementerName: o.implementerName ?? "",
    featuresToImplement: o.featuresToImplement ?? [],
    notes: o.notes ?? "",
  };
}

interface OpportunityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: CrmOpportunity;
  companies: CrmCompany[];
  defaultCompanyId?: string;
  onSave: (input: CrmOpportunityInput) => Promise<void>;
  isSaving?: boolean;
}

export function OpportunityFormDialog({
  open,
  onOpenChange,
  initial,
  companies,
  defaultCompanyId,
  onSave,
  isSaving,
}: OpportunityFormDialogProps) {
  const defaultComp = companies.find((c) => c.id === defaultCompanyId);
  const [form, setForm] = useState<CrmOpportunityInput>(() =>
    initial
      ? opportunityToForm(initial)
      : emptyForm({
          companyId: defaultCompanyId,
          companyName: defaultComp?.name,
        }),
  );
  const [users, setUsers] = useState<OrganizationUser[]>([]);

  useEffect(() => {
    if (!open) return;
    fetchOrganizationUsers()
      .then((res) => {
        if (res) setUsers(res.users);
      })
      .catch(() => undefined);
  }, [open]);

  const set = (key: keyof CrmOpportunityInput, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleFeature = (feat: string) => {
    const current = form.featuresToImplement ?? [];
    set(
      "featuresToImplement",
      current.includes(feat)
        ? current.filter((f) => f !== feat)
        : [...current, feat],
    );
  };

  const handleCompanyChange = (id: string) => {
    const comp = companies.find((c) => c.id === id);
    setForm((prev) => ({
      ...prev,
      companyId: id,
      companyName: comp?.name ?? "",
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.companyId) return;
    await onSave(form);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v)
          setForm(
            initial
              ? opportunityToForm(initial)
              : emptyForm({
                  companyId: defaultCompanyId,
                  companyName: defaultComp?.name,
                }),
          );
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Editar oportunidad" : "Nueva oportunidad"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium">
                Nombre del agente <span className="text-destructive">*</span>
              </label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Ej. Agente informativo"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium">
                Empresa <span className="text-destructive">*</span>
              </label>
              <Select
                value={form.companyId}
                onValueChange={handleCompanyChange}
                disabled={!!defaultCompanyId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Etapa</label>
              <Select
                value={form.stage}
                onValueChange={(v) => set("stage", v as CrmOpportunityStage)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">MRR (MXN)</label>
              <Input
                type="number"
                min={0}
                value={form.mrr ?? ""}
                onChange={(e) =>
                  set(
                    "mrr",
                    e.target.value === "" ? undefined : Number(e.target.value),
                  )
                }
                placeholder="0"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Contacto</label>
              <Input
                value={form.contactName ?? ""}
                onChange={(e) => set("contactName", e.target.value)}
                placeholder="Nombre del contacto"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Implementador</label>
              <Select
                value={form.implementerName ?? ""}
                onValueChange={(v) => set("implementerName", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Quién lo implementa" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.name}>
                      <span className="font-medium">{u.name}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground">{u.email}</span>
                    </SelectItem>
                  ))}
                  {users.length === 0 && (
                    <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                      Cargando usuarios…
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium">
                Funciones a implementar
              </label>
              <div className="flex flex-wrap gap-2">
                {FEATURE_OPTIONS.map((feat) => {
                  const selected = (form.featuresToImplement ?? []).includes(feat);
                  return (
                    <button
                      key={feat}
                      type="button"
                      onClick={() => toggleFeature(feat)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {feat}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium">Notas</label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                rows={2}
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Notas adicionales"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !form.name.trim() || !form.companyId}
            >
              {isSaving ? "Guardando…" : initial ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
