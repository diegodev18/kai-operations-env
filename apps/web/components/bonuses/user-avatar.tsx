"use client";

import { useState } from "react";

interface UserAvatarProps {
  name: string;
  image: string | null;
  size?: "sm" | "md";
}

export function UserAvatar({ name, image, size = "sm" }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const dim = size === "sm" ? "size-7" : "size-9";
  const text = size === "sm" ? "text-xs" : "text-sm";

  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  if (image && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        className={`${dim} shrink-0 rounded-full object-cover`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`${dim} ${text} flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground`}
    >
      {initials || "?"}
    </div>
  );
}
