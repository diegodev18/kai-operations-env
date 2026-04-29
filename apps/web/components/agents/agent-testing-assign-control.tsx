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
import type { TestingAssignTargetsResponse } from "@/types";
import { cn } from "@/lib/utils";

const HOVER_MS = 1500;

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

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInPopoverRef = useRef(false);
  /** Evita self-assign al soltar el clic justo después de abrir el menú por hover. */
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

  const loadTargets = useCallback(async () => {
    setTargetsLoading(true);
    try {
      const data = await fetchTestingAssignTargets(agentId);
      setTargetsData(data);
      if (!data) {
        toast.error("No se pudo cargar la lista de asignación");
      }
    } finally {
      setTargetsLoading(false);
    }
  }, [agentId]);

  const openMenuFromHover = useCallback(() => {
    clearHoverTimer();
    suppressNextAssignClickRef.current = true;
    window.setTimeout(() => {
      suppressNextAssignClickRef.current = false;
    }, 450);
    setSearch("");
    setPopoverOpen(true);
    void loadTargets();
  }, [clearHoverTimer, loadTargets]);

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

  const filteredTargets = useMemo(() => {
    const list = targetsData?.targets ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q),
    );
  }, [targetsData?.targets, search]);

  const showSearch =
    targetsData?.scope === "organization" ||
    (targetsData?.targets.length ?? 0) > 8;

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
        className="w-80 p-0"
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
          <PopoverTitle className="text-sm">
            Asignar agente a testing
          </PopoverTitle>
          <p className="text-muted-foreground text-xs font-normal">
            Elige un usuario con teléfono en su cuenta, o usa el botón para
            asignarte a ti.
          </p>
        </PopoverHeader>

        <div className="flex flex-col gap-2 p-2">
          {showSearch ? (
            <Input
              placeholder="Buscar por nombre o correo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
          ) : null}

          <div className="max-h-56 overflow-y-auto overscroll-contain">
            {targetsLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 px-2 py-4 text-xs">
                <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
                Cargando…
              </div>
            ) : filteredTargets.length === 0 ? (
              <p className="text-muted-foreground px-2 py-3 text-xs">
                No hay usuarios que coincidan o no hay destinatarios
                disponibles.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {filteredTargets.map((t) => (
                  <li key={t.userId}>
                    <button
                      type="button"
                      disabled={!t.assignable || assigning}
                      onClick={() => void runAssign(t.userId)}
                      className={cn(
                        "hover:bg-muted flex w-full flex-col rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                        !t.assignable && "text-muted-foreground cursor-not-allowed",
                      )}
                    >
                      <span className="truncate font-medium">{t.name}</span>
                      <span className="text-muted-foreground truncate">
                        {t.email}
                      </span>
                      {!t.assignable ? (
                        <span className="text-destructive mt-0.5 text-[11px]">
                          Sin teléfono en cuenta
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
