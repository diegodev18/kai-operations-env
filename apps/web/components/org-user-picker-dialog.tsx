"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type ReactNode } from "react";

export interface OrgUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
}

export function OrgUserPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  users,
  isLoading,
  checkIsAssigned,
  onAdd,
  onRemove,
  addingUserId,
  renderUserMeta,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  users: OrgUser[];
  isLoading: boolean;
  checkIsAssigned: (user: OrgUser) => boolean;
  onAdd: (user: OrgUser) => void | Promise<void>;
  onRemove: (user: OrgUser) => void | Promise<void>;
  addingUserId?: string;
  renderUserMeta?: (user: OrgUser) => ReactNode;
}) {
  const [search, setSearch] = useState("");

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(search.toLowerCase())),
  );

  const handleToggle = async (user: OrgUser) => {
    if (checkIsAssigned(user)) {
      await onRemove(user);
    } else {
      await onAdd(user);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose className="max-h-[min(90vh,32rem)]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden py-2">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2Icon className="size-5 animate-spin" />
              <span>Cargando usuarios…</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay usuarios
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {filteredUsers.map((user) => {
                const isAssigned = checkIsAssigned(user);
                const busy = addingUserId === user.id;
                return (
                  <li key={user.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-2 py-2 hover:bg-muted/50">
                      <Checkbox
                        checked={isAssigned}
                        disabled={busy || isLoading}
                        onCheckedChange={() => void handleToggle(user)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {user.name || user.email}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {user.name && user.email}
                          {renderUserMeta && (
                            <>
                              {user.name && " · "}
                              {renderUserMeta(user)}
                            </>
                          )}
                        </div>
                      </div>
                      {busy && (
                        <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
