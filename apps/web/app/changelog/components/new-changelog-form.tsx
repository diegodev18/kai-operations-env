"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getProjectById,
  type Collaborator,
  type Attachment,
  type DbChangelogEntry,
} from "../changelog-data";
import { fetchOrganizationUsers } from "@/services/organization-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeftIcon, PlusIcon, XIcon, UploadIcon, FileIcon, VideoIcon, ImageIcon, Loader2Icon } from "lucide-react";

interface OrganizationUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface ChangeItem {
  id: string;
  value: string;
}

interface NewChangelogFormProps {
  projectId: "panel" | "agents" | "tools";
  /** Si se indica, el formulario carga la entrada y guarda con PATCH. */
  entryId?: string;
  onClose?: () => void;
  /** Tras guardar con éxito (p. ej. refrescar lista en la página padre). Se espera antes de cerrar el diálogo. */
  onSaved?: () => void | Promise<void>;
}

function digitsOnly(value: string, maxLen: number): string {
  return value.replace(/\D/g, "").slice(0, maxLen);
}

/** Lee major.minor.patch desde una versión guardada (solo dígitos por segmento). */
function semverPartsFromStored(version: string): {
  major: string;
  minor: string;
  patch: string;
} {
  const trimmed = version.trim().replace(/^v/i, "");
  const segments = trimmed.split(".");
  return {
    major: digitsOnly(segments[0] ?? "", 6),
    minor: digitsOnly(segments[1] ?? "", 6),
    patch: digitsOnly(segments[2] ?? "", 6),
  };
}

function changesFromEntry(entry: DbChangelogEntry): Record<string, ChangeItem[]> {
  const keys = ["added", "changed", "fixed", "removed", "improved"] as const;
  const out: Record<string, ChangeItem[]> = {
    added: [],
    changed: [],
    fixed: [],
    removed: [],
    improved: [],
  };
  for (const k of keys) {
    const arr = entry.changes[k];
    out[k] = (arr ?? []).map((value) => ({ id: crypto.randomUUID(), value }));
  }
  return out;
}

const sectionLabels: Record<string, { label: string }> = {
  added: { label: "Añadido" },
  changed: { label: "Cambiado" },
  fixed: { label: "Corregido" },
  removed: { label: "Eliminado" },
  improved: { label: "Mejorado" },
};

const TAGS = ["frontend", "backend", "bug", "feature", "performance", "security", "ui", "ux", "database", "api"];

export default function NewChangelogForm({
  projectId,
  entryId,
  onClose,
  onSaved,
}: NewChangelogFormProps) {
  const router = useRouter();
  const project = getProjectById(projectId);
  const embedded = Boolean(onClose);
  const isEdit = Boolean(entryId);

  const [organizationUsers, setOrganizationUsers] = useState<OrganizationUser[]>([]);
  const [entryLoading, setEntryLoading] = useState(Boolean(entryId));

  const [versionMajor, setVersionMajor] = useState("");
  const [versionMinor, setVersionMinor] = useState("");
  const [versionPatch, setVersionPatch] = useState("");

  const [formData, setFormData] = useState({
    registerDate: new Date().toISOString().split("T")[0],
    implementationDate: new Date().toISOString().split("T")[0],
    description: "",
    ticketUrl: "",
    createTicket: false,
    tags: [] as string[],
    status: "draft" as "draft" | "published",
    internalNotes: "",
  });

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [collaboratorSearch, setCollaboratorSearch] = useState("");
  const [showCollaboratorDropdown, setShowCollaboratorDropdown] = useState(false);

  const [changes, setChanges] = useState<Record<string, ChangeItem[]>>({
    added: [],
    changed: [],
    fixed: [],
    removed: [],
    improved: [],
  });

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchOrgUsers() {
      try {
        const data = await fetchOrganizationUsers();
        if (data) {
          setOrganizationUsers(data.users || []);
        }
      } catch (error) {
        console.error("[changelog form] organization users:", error);
      }
    }
    fetchOrgUsers();
  }, []);

  useEffect(() => {
    if (!entryId) return;
    let cancelled = false;
    async function loadEntry() {
      setEntryLoading(true);
      try {
        const res = await fetch(`/api/changelogs/${projectId}/entries/${entryId}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          alert("No se pudo cargar la entrada o no tienes permiso.");
          router.replace(`/changelog/${projectId}`);
          return;
        }
        const data = await res.json();
        const entry = data.entry as DbChangelogEntry;
        if (cancelled || !entry) return;
        const vParts = semverPartsFromStored(entry.version);
        setVersionMajor(vParts.major);
        setVersionMinor(vParts.minor);
        setVersionPatch(vParts.patch);
        setFormData({
          registerDate: entry.registerDate.slice(0, 10),
          implementationDate: entry.implementationDate.slice(0, 10),
          description: entry.description,
          ticketUrl: entry.ticketUrl ?? "",
          createTicket: entry.createTicket,
          tags: entry.tags ?? [],
          status: entry.status,
          internalNotes: entry.internalNotes ?? "",
        });
        setCollaborators(entry.collaborators ?? []);
        setChanges(changesFromEntry(entry));
        setAttachments(entry.attachments ?? []);
      } catch (e) {
        console.error("[changelog form] load entry:", e);
        router.replace(`/changelog/${projectId}`);
      } finally {
        if (!cancelled) setEntryLoading(false);
      }
    }
    loadEntry();
    return () => {
      cancelled = true;
    };
  }, [entryId, projectId, router]);

  const filteredUsers = organizationUsers.filter(
    (u) =>
      !collaborators.some((c) => c.email === u.email) &&
      (u.name.toLowerCase().includes(collaboratorSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(collaboratorSearch.toLowerCase()))
  );

  function addCollaborator(user: OrganizationUser) {
    setCollaborators([...collaborators, { name: user.name, email: user.email }]);
    setCollaboratorSearch("");
    setShowCollaboratorDropdown(false);
  }

  function removeCollaborator(email: string) {
    setCollaborators(collaborators.filter((c) => c.email !== email));
  }

  function addChangeItem(section: string) {
    setChanges({
      ...changes,
      [section]: [...changes[section as keyof typeof changes], { id: crypto.randomUUID(), value: "" }],
    });
  }

  function updateChangeItem(section: string, id: string, value: string) {
    setChanges({
      ...changes,
      [section]: changes[section as keyof typeof changes].map((item) =>
        item.id === id ? { ...item, value } : item
      ),
    });
  }

  function removeChangeItem(section: string, id: string) {
    setChanges({
      ...changes,
      [section]: changes[section as keyof typeof changes].filter((item) => item.id !== id),
    });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newAttachments: Attachment[] = [];

    const uploadErrors: string[] = [];

    for (const file of Array.from(files)) {
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);

      try {
        const res = await fetch(`/api/changelogs/${projectId}/upload`, {
          method: "POST",
          body: formDataUpload,
        });

        if (res.ok) {
          const data = await res.json();
          newAttachments.push(data.file);
        } else {
          let msg = `No se pudo subir "${file.name}"`;
          try {
            const err = await res.json();
            if (err?.error) msg = `${file.name}: ${err.error}`;
          } catch {
            /* ignore */
          }
          uploadErrors.push(msg);
        }
      } catch (error) {
        console.error("[upload] error:", error);
        uploadErrors.push(`Error de red al subir "${file.name}"`);
      }
    }

    if (uploadErrors.length > 0) {
      alert(uploadErrors.join("\n"));
    }

    setAttachments([...attachments, ...newAttachments]);
    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeAttachment(index: number) {
    setAttachments(attachments.filter((_, i) => i !== index));
  }

  function toggleTag(tag: string) {
    if (formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tag) });
    } else {
      setFormData({ ...formData, tags: [...formData.tags, tag] });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const major = digitsOnly(versionMajor, 6);
    const minor = digitsOnly(versionMinor, 6);
    const patch = digitsOnly(versionPatch, 6);
    if (!major || !minor || !patch) {
      alert("Indica la versión completa: mayor, menor y parche (solo números), por ejemplo 1 0 0.");
      return;
    }
    const combinedVersion = `${major}.${minor}.${patch}`;
    if (!formData.description.trim()) {
      alert("Añade una descripción.");
      return;
    }

    setSaving(true);

    const changesPayload = {
      added: changes.added.filter((i) => i.value.trim()).map((i) => i.value.trim()),
      changed: changes.changed.filter((i) => i.value.trim()).map((i) => i.value.trim()),
      fixed: changes.fixed.filter((i) => i.value.trim()).map((i) => i.value.trim()),
      removed: changes.removed.filter((i) => i.value.trim()).map((i) => i.value.trim()),
      improved: changes.improved.filter((i) => i.value.trim()).map((i) => i.value.trim()),
    };

    const patchBody = {
      registerDate: formData.registerDate,
      implementationDate: formData.implementationDate,
      version: combinedVersion,
      collaborators,
      description: formData.description,
      changes: changesPayload,
      attachments,
      ticketUrl: formData.ticketUrl.trim() === "" ? null : formData.ticketUrl.trim(),
      createTicket: formData.createTicket,
      tags: formData.tags.length > 0 ? formData.tags : null,
      status: formData.status,
      internalNotes: formData.internalNotes.trim() === "" ? null : formData.internalNotes.trim(),
    };

    const postBody = {
      projectId,
      registerDate: formData.registerDate,
      implementationDate: formData.implementationDate,
      version: combinedVersion,
      collaborators,
      description: formData.description,
      changes: changesPayload,
      attachments,
      ticketUrl: formData.ticketUrl.trim() || undefined,
      createTicket: formData.createTicket,
      tags: formData.tags.length > 0 ? formData.tags : undefined,
      status: formData.status,
      internalNotes: formData.internalNotes.trim() || undefined,
    };

    try {
      const url = entryId
        ? `/api/changelogs/${projectId}/entries/${entryId}`
        : `/api/changelogs/${projectId}`;
      const res = await fetch(url, {
        method: entryId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entryId ? patchBody : postBody),
      });

      if (res.ok) {
        try {
          await Promise.resolve(onSaved?.());
        } catch (e) {
          console.error("[submit] onSaved:", e);
        }
        if (onClose) onClose();
        else router.push(`/changelog/${projectId}`);
      } else {
        let message = `Error ${res.status}`;
        const ct = res.headers.get("content-type") || "";
        try {
          if (ct.includes("application/json")) {
            const error = await res.json();
            if (error?.error) message = error.error;
          } else {
            const text = (await res.text()).trim();
            if (text) message = text.slice(0, 200);
          }
        } catch {
          message = `Error del servidor (${res.status})`;
        }
        console.error("[submit] error response:", message);
        alert("Error: " + message);
      }
    } catch (error) {
      console.error("[submit] catch error:", error);
      alert("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  const outerClass = embedded
    ? "bg-background"
    : "min-h-screen bg-background p-8";
  const innerClass = embedded ? "mx-auto max-w-3xl px-1" : "mx-auto max-w-3xl";

  if (entryId && entryLoading) {
    return (
      <div className={outerClass}>
        <div className={`${innerClass} flex min-h-[240px] items-center justify-center`}>
          <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className={outerClass}>
      <div className={innerClass}>
        {!embedded && (
          <header className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground">
                {isEdit ? "Editar entrada" : "Nueva entrada"} - {project?.name}
              </h1>
              <p className="mt-1 text-muted-foreground">{project?.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/changelog/${projectId}`}>
                  <ArrowLeftIcon className="size-4 mr-2" />
                  Volver
                </Link>
              </Button>
            </div>
          </header>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="registerDate">Fecha de registro</Label>
              <Input
                id="registerDate"
                type="date"
                value={formData.registerDate}
                onChange={(e) => setFormData({ ...formData, registerDate: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="implementationDate">Fecha de implementación</Label>
              <Input
                id="implementationDate"
                type="date"
                value={formData.implementationDate}
                onChange={(e) => setFormData({ ...formData, implementationDate: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <Label id="version-semver-label">Versión (semver)</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Solo números; se guarda como mayor.menor.parche (ej. 1.0.0).
            </p>
            <div
              className="mt-2 flex max-w-xs flex-wrap items-center gap-1 sm:flex-nowrap"
              role="group"
              aria-labelledby="version-semver-label"
            >
              <Input
                id="version-major"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="1"
                value={versionMajor}
                onChange={(e) => setVersionMajor(digitsOnly(e.target.value, 6))}
                className="w-14 text-center font-mono tabular-nums sm:w-16"
                aria-label="Versión mayor"
                required
              />
              <span className="select-none text-muted-foreground" aria-hidden="true">
                .
              </span>
              <Input
                id="version-minor"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={versionMinor}
                onChange={(e) => setVersionMinor(digitsOnly(e.target.value, 6))}
                className="w-14 text-center font-mono tabular-nums sm:w-16"
                aria-label="Versión menor"
                required
              />
              <span className="select-none text-muted-foreground" aria-hidden="true">
                .
              </span>
              <Input
                id="version-patch"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={versionPatch}
                onChange={(e) => setVersionPatch(digitsOnly(e.target.value, 6))}
                className="w-14 text-center font-mono tabular-nums sm:w-16"
                aria-label="Parche"
                required
              />
            </div>
          </div>

          <div>
            <Label>Colaboradores</Label>
            <div className="relative mt-2">
              {collaborators.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {collaborators.map((c) => (
                    <span
                      key={c.email}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm"
                    >
                      {c.name}
                      <button
                        type="button"
                        onClick={() => removeCollaborator(c.email)}
                        className="ml-1 text-muted-foreground hover:text-foreground"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Input
                placeholder="Buscar colaboradores..."
                value={collaboratorSearch}
                onChange={(e) => {
                  setCollaboratorSearch(e.target.value);
                  setShowCollaboratorDropdown(true);
                }}
                onFocus={() => setShowCollaboratorDropdown(true)}
                onBlur={() => setTimeout(() => setShowCollaboratorDropdown(false), 200)}
              />
              {showCollaboratorDropdown && filteredUsers.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-background shadow-lg">
                  {filteredUsers.slice(0, 5).map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => addCollaborator(user)}
                    >
                      <div>{user.name}</div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              placeholder="Descripción breve de los cambios..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          {Object.entries(sectionLabels).map(([section, { label }]) => (
            <div key={section}>
              <div className="mb-2 flex items-center justify-between">
                <Label>{label}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => addChangeItem(section)}
                >
                  <PlusIcon className="size-4 mr-1" />
                  Añadir
                </Button>
              </div>
              <div className="space-y-2">
                {changes[section as keyof typeof changes].map((item) => (
                  <div key={item.id} className="flex gap-2">
                    <Input
                      placeholder={`${label}...`}
                      value={item.value}
                      onChange={(e) => updateChangeItem(section, item.id, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeChangeItem(section, item.id)}
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div>
            <Label>Etiquetas</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`rounded-full px-3 py-1 text-sm ${
                    formData.tags.includes(tag)
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="ticketUrl">URL del ticket (opcional)</Label>
            <Input
              id="ticketUrl"
              placeholder="https://..."
              value={formData.ticketUrl}
              onChange={(e) => setFormData({ ...formData, ticketUrl: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="createTicket"
              checked={formData.createTicket}
              onCheckedChange={(checked) => setFormData({ ...formData, createTicket: !!checked })}
            />
            <Label htmlFor="createTicket" className="text-sm">
              ¿Necesitas que alguien cree el ticket?
            </Label>
          </div>

          <div>
            <Label>Adjuntos</Label>
            <div className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,application/pdf"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2Icon className="size-4 mr-2 animate-spin" />
                ) : (
                  <UploadIcon className="size-4 mr-2" />
                )}
                Subir archivos
              </Button>
              {attachments.length > 0 && (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {attachments.map((att, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-md border border-border p-2"
                    >
                      <div className="flex items-center gap-2 truncate">
                        {att.type === "image" ? (
                          <ImageIcon className="size-4" />
                        ) : att.type === "video" ? (
                          <VideoIcon className="size-4" />
                        ) : (
                          <FileIcon className="size-4" />
                        )}
                        <span className="truncate text-sm">{att.name}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAttachment(index)}
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="internalNotes">Notas internas</Label>
            <Textarea
              id="internalNotes"
              placeholder="Notas privadas..."
              value={formData.internalNotes}
              onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
            />
          </div>

          <div>
            <Label>Estado</Label>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="status"
                  value="draft"
                  checked={formData.status === "draft"}
                  onChange={() => setFormData({ ...formData, status: "draft" })}
                />
                <span>Borrador</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="status"
                  value="published"
                  checked={formData.status === "published"}
                  onChange={() => setFormData({ ...formData, status: "published" })}
                />
                <span>Publicado</span>
              </label>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button type="submit" disabled={saving || entryLoading}>
              {saving ? <Loader2Icon className="mr-2 size-4 animate-spin" /> : null}
              Guardar
            </Button>
            <Button type="button" variant="outline" onClick={onClose || (() => router.push(`/changelog/${projectId}`))}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}