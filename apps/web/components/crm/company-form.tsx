"use client";

import { useState } from "react";
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
import type { CrmCompany, CrmCompanyInput, CrmCompanyStatus } from "@/types";
import { CRM_COMPANY_STATUS_LABELS } from "@/types";

const STATUSES = Object.entries(CRM_COMPANY_STATUS_LABELS) as [
  CrmCompanyStatus,
  string,
][];

const INDUSTRIES = [
  "Retail",
  "Educación",
  "Servicios",
  "Salud",
  "Restaurantes",
  "Inmobiliaria",
  "Finanzas",
  "Tecnología",
  "Manufactura",
  "Transporte",
  "Otro",
];

function emptyForm(): CrmCompanyInput {
  return {
    name: "",
    industry: "",
    status: "prospecto",
    ownerName: "",
    growerName: "",
    mrr: undefined,
    country: "",
    description: "",
    targetAudience: "",
    agentDescription: "",
    escalationRules: "",
    notes: "",
  };
}

function companyToForm(c: CrmCompany): CrmCompanyInput {
  return {
    name: c.name,
    industry: c.industry,
    status: c.status,
    mrr: c.mrr,
    country: c.country ?? "",
    description: c.description ?? "",
    targetAudience: c.targetAudience ?? "",
    agentDescription: c.agentDescription ?? "",
    escalationRules: c.escalationRules ?? "",
    businessTimezone: c.businessTimezone ?? "",
    brandValues: c.brandValues ?? [],
    policies: c.policies ?? "",
    ownerName: c.ownerName ?? "",
    growerName: c.growerName ?? "",
    notes: c.notes ?? "",
  };
}

interface CompanyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: CrmCompany;
  onSave: (input: CrmCompanyInput) => Promise<void>;
  isSaving?: boolean;
}

export function CompanyFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  isSaving,
}: CompanyFormDialogProps) {
  const [form, setForm] = useState<CrmCompanyInput>(() =>
    initial ? companyToForm(initial) : emptyForm(),
  );

  const set = (key: keyof CrmCompanyInput, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await onSave(form);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setForm(initial ? companyToForm(initial) : emptyForm());
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar empresa" : "Nueva empresa"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium">
                Nombre <span className="text-destructive">*</span>
              </label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Nombre de la empresa"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Sector</label>
              <Select
                value={form.industry}
                onValueChange={(v) => set("industry", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Status</label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v as CrmCompanyStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Owner</label>
              <Input
                value={form.ownerName ?? ""}
                onChange={(e) => set("ownerName", e.target.value)}
                placeholder="Responsable comercial"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Grower</label>
              <Input
                value={form.growerName ?? ""}
                onChange={(e) => set("growerName", e.target.value)}
                placeholder="Implementador"
              />
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
              <label className="mb-1 block text-xs font-medium">País</label>
              <Input
                value={form.country ?? ""}
                onChange={(e) => set("country", e.target.value)}
                placeholder="México"
              />
            </div>

            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium">
                Descripción del negocio
              </label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                rows={2}
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                placeholder="¿A qué se dedica la empresa?"
              />
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
            <Button type="submit" disabled={isSaving || !form.name.trim()}>
              {isSaving ? "Guardando…" : initial ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
