"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2Icon, LogOutIcon, UserCircleIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initialsFromUser(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email?.trim()) return email.slice(0, 2).toUpperCase();
  return "?";
}

export function UserMenu(props: {
  userName: string | null | undefined;
  userEmail: string | null | undefined;
  /** URL de imagen de perfil (p. ej. avatar de GitHub). */
  userImage?: string | null | undefined;
  onSignOut: () => void;
}) {
  const avatarLabel = initialsFromUser(props.userName, props.userEmail);
  /** URL que falló al cargar; al cambiar `userImage` se reintenta si es otra URL. */
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const trimmedImage = props.userImage?.trim() ?? "";
  const showPhoto =
    trimmedImage.length > 0 && failedImageUrl !== trimmedImage;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-medium text-foreground outline-none transition-colors hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Menú de usuario"
        >
          {showPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL externa de perfil
            <img
              src={trimmedImage}
              alt=""
              className="size-full object-cover"
              onError={() => setFailedImageUrl(trimmedImage)}
            />
          ) : (
            avatarLabel
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            {props.userName ? (
              <span className="text-sm font-medium text-foreground">
                {props.userName}
              </span>
            ) : null}
            {props.userEmail ? (
              <span className="text-xs text-muted-foreground">
                {props.userEmail}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Usuario</span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href="/profile"
            className="flex cursor-pointer items-center gap-2"
          >
            <UserCircleIcon className="size-4" />
            Perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href="/organization"
            className="flex cursor-pointer items-center gap-2"
          >
            <Building2Icon className="size-4" />
            Organización
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            props.onSignOut();
          }}
        >
          <LogOutIcon className="size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
