"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownWideNarrowIcon,
  ArrowUpWideNarrowIcon,
  EyeIcon,
  EyeOffIcon,
  FilterIcon,
  Loader2Icon,
  MessageSquareIcon,
  Settings2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
  createImplementationActivityComment,
  fetchAgentGrowers,
  fetchImplementationActivity,
  patchImplementationActivityCommentVisibility,
} from "@/services/agents-api";
import type { AgentGrowerRow, ImplementationActivityEntry } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ImplementationActivityCommentEditor } from "@/components/implementation-activity-comment-editor";
import { useAuth } from "@/hooks";

type ActivityFilter = "all" | "comment" | "system";

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function actorLabel(
  email: string | null | undefined,
  growersByEmail: Map<string, string>,
): string {
  if (!email) return "Sistema";
  const norm = email.trim().toLowerCase();
  return growersByEmail.get(norm) ?? norm;
}

export function AgentActivitySheet({ agentId }: { agentId: string }) {
  const MIN_SHEET_WIDTH = 420;
  const MAX_SHEET_WIDTH = 980;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<ImplementationActivityEntry[]>([]);
  const [growers, setGrowers] = useState<AgentGrowerRow[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [activitySortDesc, setActivitySortDesc] = useState(false);
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
  const [togglingEntryId, setTogglingEntryId] = useState<string | null>(null);
  const [sheetWidth, setSheetWidth] = useState(560);
  const [isResizing, setIsResizing] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { session } = useAuth();
  const currentUserEmail = session?.user?.email?.trim().toLowerCase() ?? null;

  const growersByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of growers) {
      map.set(g.email.trim().toLowerCase(), g.name);
    }
    return map;
  }, [growers]);

  const filteredActivity = useMemo(() => {
    const list =
      activityFilter === "all"
        ? [...entries]
        : entries.filter((entry) => entry.kind === activityFilter);
    list.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return activitySortDesc ? tb - ta : ta - tb;
    });
    return list;
  }, [entries, activityFilter, activitySortDesc]);

  useEffect(() => {
    if (!open || !agentId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [activityRes, growersRes] = await Promise.all([
          fetchImplementationActivity(agentId),
          fetchAgentGrowers(agentId),
        ]);
        if (cancelled) return;
        if (activityRes == null) {
          toast.error("No se pudo cargar la bitácora");
          setEntries([]);
        } else {
          setEntries(Array.isArray(activityRes.entries) ? activityRes.entries : []);
        }
        if (growersRes == null) {
          setGrowers([]);
        } else {
          setGrowers(Array.isArray(growersRes.growers) ? growersRes.growers : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, agentId]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
    return () => {
      window.cancelAnimationFrame(id);
    };
  }, [open, filteredActivity.length, activitySortDesc, activityFilter]);

  const onPublishComment = async (bodyHtml: string) => {
    const result = await createImplementationActivityComment(agentId, bodyHtml);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEntries((prev) => [...prev, result.entry]);
    toast.success("Comentario publicado");
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  };

  const onToggleCommentVisibility = async (entry: ImplementationActivityEntry) => {
    if (entry.kind !== "comment") return;
    const entryActorEmail = entry.actorEmail?.trim().toLowerCase() ?? null;
    if (!entryActorEmail || !currentUserEmail || entryActorEmail !== currentUserEmail) {
      return;
    }
    setTogglingEntryId(entry.id);
    try {
      const result = await patchImplementationActivityCommentVisibility(
        agentId,
        entry.id,
        !(entry.hidden === true),
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEntries((prev) =>
        prev.map((item) => (item.id === entry.id ? result.entry : item)),
      );
      toast.success(result.entry.hidden ? "Comentario oculto" : "Comentario visible");
    } finally {
      setTogglingEntryId(null);
    }
  };

  useEffect(() => {
    if (!isResizing) return;

    const onPointerMove = (event: PointerEvent) => {
      const viewportWidth = window.innerWidth;
      const nextWidth = Math.max(
        MIN_SHEET_WIDTH,
        Math.min(MAX_SHEET_WIDTH, viewportWidth - event.clientX),
      );
      setSheetWidth(nextWidth);
    };

    const onPointerUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="size-7 shrink-0" aria-label="Abrir bitácora y comentarios">
              <MessageSquareIcon className="size-3.5" />
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Bitácora y comentarios</p>
        </TooltipContent>
      </Tooltip>

      <SheetContent
        side="right"
        className="w-full sm:max-w-none"
        style={{
          width: `min(100vw, ${sheetWidth}px)`,
          maxWidth: "100vw",
        }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar panel"
          className="absolute top-0 bottom-0 left-0 z-20 hidden w-2 cursor-col-resize bg-transparent transition-colors hover:bg-border/60 sm:block"
          onPointerDown={(event) => {
            event.preventDefault();
            setIsResizing(true);
          }}
        />
        <SheetHeader>
          <SheetTitle>Bitácora y comentarios</SheetTitle>
          <SheetDescription>
            Consulta registros automáticos y agrega comentarios del seguimiento.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2"
              onClick={() => setActivitySortDesc((d) => !d)}
              aria-label={
                activitySortDesc
                  ? "Orden: más recientes primero"
                  : "Orden: más antiguos primero"
              }
            >
              {activitySortDesc ? (
                <ArrowDownWideNarrowIcon className="size-4" />
              ) : (
                <ArrowUpWideNarrowIcon className="size-4" />
              )}
            </Button>

            <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-0.5">
              <FilterIcon className="size-3.5 text-muted-foreground" aria-hidden />
              <select
                className="h-7 max-w-[140px] border-0 bg-transparent text-xs outline-none"
                value={activityFilter}
                onChange={(e) =>
                  setActivityFilter(e.target.value as ActivityFilter)
                }
                aria-label="Filtrar bitácora"
              >
                <option value="all">Todos</option>
                <option value="comment">Comentarios</option>
                <option value="system">Registros</option>
              </select>
            </div>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredActivity.length === 0 ? (
              <p className="pb-2 text-sm text-muted-foreground">
                No hay entradas en la bitácora todavía.
              </p>
            ) : (
              <div className="relative flex flex-col pt-1">
                <div
                  className="pointer-events-none absolute top-2 bottom-2 left-[0.875rem] z-0 w-px -translate-x-1/2 bg-border"
                  aria-hidden
                />
                {filteredActivity.map((entry) => {
                  const isComment = entry.kind === "comment";
                  const Icon = isComment ? MessageSquareIcon : Settings2Icon;
                  const isOwnComment =
                    isComment &&
                    Boolean(currentUserEmail) &&
                    (entry.actorEmail?.trim().toLowerCase() ?? null) === currentUserEmail;
                  const isHovered = hoveredEntryId === entry.id;
                  const isHidden = entry.hidden === true;

                  if (isComment && isHidden && !isOwnComment) {
                    return null;
                  }

                  const when = formatDateTime(entry.createdAt);
                  const who = actorLabel(entry.actorEmail, growersByEmail);
                  return (
                    <div
                      key={entry.id}
                      className="relative z-10 flex gap-3 pb-6 last:pb-2"
                      onMouseEnter={() => setHoveredEntryId(entry.id)}
                      onMouseLeave={() => setHoveredEntryId((prev) => (prev === entry.id ? null : prev))}
                    >
                      <div className="flex w-7 shrink-0 justify-center pt-0.5">
                        {isOwnComment ? (
                          <button
                            type="button"
                            className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted ring-2 ring-background transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => void onToggleCommentVisibility(entry)}
                            disabled={togglingEntryId === entry.id}
                            aria-label={
                              isHidden
                                ? "Mostrar comentario"
                                : "Ocultar comentario"
                            }
                          >
                            {togglingEntryId === entry.id ? (
                              <Loader2Icon
                                className="size-3.5 animate-spin text-muted-foreground"
                                aria-hidden
                              />
                            ) : isHovered ? (
                              isHidden ? (
                                <EyeIcon
                                  className="size-3.5 text-emerald-600"
                                  aria-hidden
                                />
                              ) : (
                                <EyeOffIcon
                                  className="size-3.5 text-amber-600"
                                  aria-hidden
                                />
                              )
                            ) : (
                              <Icon
                                className="size-3.5 text-muted-foreground"
                                aria-hidden
                              />
                            )}
                          </button>
                        ) : (
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted ring-2 ring-background">
                            <Icon
                              className="size-3.5 text-muted-foreground"
                              aria-hidden
                            />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{who}</span>
                          {isComment ? " comentó" : " · registro automático"}
                          <span className="text-muted-foreground"> · {when}</span>
                        </p>
                        {isComment && isHidden ? (
                          <p className="text-sm italic text-muted-foreground">
                            Ocultaste este mensaje.
                          </p>
                        ) : isComment && entry.bodyHtml ? (
                          <div
                            className="prose prose-sm max-w-none text-sm dark:prose-invert [&_a]:text-primary [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1"
                            dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
                          />
                        ) : (
                          <p className="text-sm text-foreground">
                            {entry.summary ?? "—"}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 mt-3 border-t bg-popover pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Agregar comentario
            </p>
            <ImplementationActivityCommentEditor
              disabled={loading}
              onSubmit={onPublishComment}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
