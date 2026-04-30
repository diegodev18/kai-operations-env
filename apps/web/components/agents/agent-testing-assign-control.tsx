"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircleIcon,
  FlaskConicalIcon,
  Loader2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  assignAgentToUser,
  fetchTestingAssignTargets,
} from "@/services/agents-api";
import type { TestingAssignTargetRow, TestingAssignTargetsResponse } from "@/types";
import { cn } from "@/lib/utils";

const HOVER_MS = 1500;

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

type AgentTestingAssignControlProps = {
  agentId: string;
  sessionUserId: string | undefined;
  assignedAgentId: string | null;
  onSelfAssigned: () => void;
};

export function AgentTestingAssignControl({
  agentId,
  sessionUserId,
  assignedAgentId,
  onSelfAssigned,
}: AgentTestingAssignControlProps) {
  const [assigning, setAssigning] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetsData, setTargetsData] = useState<TestingAssignTargetsResponse | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [createName, setCreateName] = useState("");

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInPopoverRef = useRef(false);
  const suppressNextAssignClickRef = useRef(false);
  const assigningRef = useRef(false);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current != null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClosePopover = useCallback(() => {
    cancelScheduledClose();
    closeTimerRef.current = setTimeout(() => {
      if (!pointerInPopoverRef.current) {
        setPopoverOpen(false);
      }
    }, 200);
  }, [cancelScheduledClose]);

  useEffect(() => {
    const d = digitsOnly(search);
    if (d.length < 3) {
      setTargetsData(null);
      setTargetsLoading(false);
      return;
    }
    setTargetsLoading(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const data = await fetchTestingAssignTargets(agentId, search);
          setTargetsData(data);
          if (!data) {
            toast.error("No se pudo completar la búsqueda");
          }
        } finally {
          setTargetsLoading(false);
        }
      })();
    }, 350);
    return () => clearTimeout(t);
  }, [search, agentId]);

  const openMenuFromHover = useCallback(() => {
    clearHoverTimer();
    suppressNextAssignClickRef.current = true;
    window.setTimeout(() => {
      suppressNextAssignClickRef.current = false;
    }, 450);
    setSearch("");
    setTargetsData(null);
    setCreateName("");
    setPopoverOpen(true);
  }, [clearHoverTimer]);

  useEffect(() => {
    return () => {
      clearHoverTimer();
      cancelScheduledClose();
    };
  }, [clearHoverTimer, cancelScheduledClose]);

  const onTriggerPointerEnter = useCallback(() => {
    if (popoverOpen || assigningRef.current) return;
    clearHoverTimer();
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      openMenuFromHover();
    }, HOVER_MS);
  }, [clearHoverTimer, openMenuFromHover, popoverOpen]);

  const onTriggerPointerLeave = useCallback(() => {
    clearHoverTimer();
    if (popoverOpen) {
      scheduleClosePopover();
    }
  }, [clearHoverTimer, popoverOpen, scheduleClosePopover]);

  const runAssign = useCallback(
    async (targetUserId?: string) => {
      if (assigningRef.current) return;
      assigningRef.current = true;
      setAssigning(true);
      try {
        const result = await assignAgentToUser(
          agentId,
          targetUserId ? { targetUserId } : {},
        );
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const self =
          !targetUserId ||
          (sessionUserId != null && targetUserId === sessionUserId);
        if (self) {
          onSelfAssigned();
          toast.success("Agente asignado a testing");
        } else {
          toast.success("Agente asignado al usuario seleccionado");
        }
        setPopoverOpen(false);
        cancelScheduledClose();
      } catch {
        toast.error("Error al asignar agente");
      } finally {
        assigningRef.current = false;
        setAssigning(false);
      }
    },
    [agentId, cancelScheduledClose, onSelfAssigned, sessionUserId],
  );

  const runAssignToUsersBuilderRow = useCallback(
    async (row: TestingAssignTargetRow) => {
      if (assigningRef.current) return;
      assigningRef.current = true;
      setAssigning(true);
      try {
        const result = await assignAgentToUser(agentId, {
          targetUsersBuilderDocId: row.usersBuilderDocId,
          targetPhoneNumber: row.phoneNumber,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Agente asignado correctamente");
        setPopoverOpen(false);
        cancelScheduledClose();
      } catch {
        toast.error("Error al asignar agente");
      } finally {
        assigningRef.current = false;
        setAssigning(false);
      }
    },
    [agentId, cancelScheduledClose],
  );

  const runCreateAndAssign = useCallback(async () => {
    const phoneDigits = digitsOnly(search);
    if (phoneDigits.length < 10) {
      toast.error("Indica un número completo (mínimo 10 dígitos)");
      return;
    }
    if (!createName.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (assigningRef.current) return;
    assigningRef.current = true;
    setAssigning(true);
    try {
      const result = await assignAgentToUser(agentId, {
        targetPhoneNumber: phoneDigits,
        newUserBuilder: {
          name: createName.trim(),
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Perfil creado y agente asignado");
      setPopoverOpen(false);
      cancelScheduledClose();
    } catch {
      toast.error("Error al crear o asignar");
    } finally {
      assigningRef.current = false;
      setAssigning(false);
    }
  }, [
    agentId,
    cancelScheduledClose,
    createName,
    search,
  ]);

  const searchDigits = useMemo(() => digitsOnly(search), [search]);
  const duplicatePhoneInResults = useMemo(() => {
    const list = targetsData?.targets ?? [];
    if (list.length < 2) return false;
    const phones = new Set(list.map((t) => t.phoneNumber));
    return phones.size < list.length;
  }, [targetsData?.targets]);

  const showCreateForm =
    searchDigits.length >= 10 &&
    !targetsLoading &&
    targetsData != null &&
    !targetsData.exactMatchFound &&
    targetsData.targets.length === 0;

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={(next) => {
        setPopoverOpen(next);
        if (!next) {
          pointerInPopoverRef.current = false;
          cancelScheduledClose();
        }
      }}
    >
      <Tooltip open={popoverOpen ? false : undefined}>
        <TooltipTrigger asChild>
          <PopoverAnchor asChild>
            <Button
              type="button"
              variant={assignedAgentId === agentId ? "secondary" : "outline"}
              size="icon"
              className="size-7 shrink-0"
              disabled={assigning}
              aria-label={
                assignedAgentId === agentId
                  ? "Asignado a tu número de testing"
                  : "Asignar a número de testing"
              }
              onPointerEnter={onTriggerPointerEnter}
              onPointerLeave={onTriggerPointerLeave}
              onClick={() => {
                if (suppressNextAssignClickRef.current) return;
                void runAssign();
              }}
            >
              {assigning ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : assignedAgentId === agentId ? (
                <CheckCircleIcon className="size-3.5 text-emerald-600" />
              ) : (
                <FlaskConicalIcon className="size-3.5 text-muted-foreground" />
              )}
            </Button>
          </PopoverAnchor>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {assignedAgentId === agentId
              ? "Asignado a tu número de testing"
              : "Asignar a número de testing"}
          </p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="max-w-[calc(100vw-1rem)] w-96 p-0"
        onPointerEnter={() => {
          pointerInPopoverRef.current = true;
          cancelScheduledClose();
        }}
        onPointerLeave={() => {
          pointerInPopoverRef.current = false;
          scheduleClosePopover();
        }}
      >
        <PopoverHeader className="border-b px-3 py-2">
          <PopoverTitle className="text-sm">Asignar agente a testing</PopoverTitle>
          <p className="text-muted-foreground text-xs font-normal">
            Busca por número de teléfono. Si no aparece nadie, puedes crear un perfil con
            nombre y asignarle el agente.
          </p>
        </PopoverHeader>

        <div className="flex flex-col gap-2 p-2">
          <Input
            placeholder="Número (mín. 3 dígitos para buscar)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
            inputMode="tel"
            autoComplete="tel"
          />

          {duplicatePhoneInResults ? (
            <p className="text-amber-600/90 dark:text-amber-400/90 px-2 text-[11px] leading-snug">
              Hay varias personas con el mismo número. Elige la fila que corresponda.
            </p>
          ) : null}

          <div className="max-h-52 overflow-y-auto overscroll-contain">
            {searchDigits.length === 0 ? (
              <p className="text-muted-foreground px-2 py-2 text-xs">
                Escribe el teléfono (solo números) para buscar coincidencias.
              </p>
            ) : targetsLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 px-2 py-4 text-xs">
                <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
                Buscando…
              </div>
            ) : searchDigits.length < 3 ? (
              <p className="text-muted-foreground px-2 py-2 text-xs">
                Escribe al menos 3 dígitos para iniciar la búsqueda.
              </p>
            ) : targetsData != null && targetsData.targets.length === 0 ? (
              <p className="text-muted-foreground px-2 py-2 text-xs">
                No hay coincidencias con ese número o prefijo.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {(targetsData?.targets ?? []).map((t) => (
                  <li key={t.usersBuilderDocId}>
                    <button
                      type="button"
                      disabled={!t.assignable || assigning}
                      onClick={() => void runAssignToUsersBuilderRow(t)}
                      className={cn(
                        "hover:bg-muted flex w-full flex-col rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                        !t.assignable && "cursor-not-allowed text-muted-foreground",
                      )}
                    >
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {t.phoneNumber}
                      </span>
                      <span className="truncate font-medium">{t.name || "—"}</span>
                      <span className="text-muted-foreground truncate text-[11px]">
                        {t.email || "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {showCreateForm ? (
            <div className="border-t bg-muted/30 space-y-2 p-2">
              <p className="text-xs font-medium">
                No hay nadie registrado con el número{" "}
                <span className="font-mono">{searchDigits}</span>. Indica el nombre para
                crear un perfil de prueba; el correo se generará automáticamente.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="ub-create-name" className="text-xs">
                  Nombre
                </Label>
                <Input
                  id="ub-create-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="Nombre completo"
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="w-full"
                disabled={assigning}
                onClick={() => void runCreateAndAssign()}
              >
                Crear perfil y asignar
              </Button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
