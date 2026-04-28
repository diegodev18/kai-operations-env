import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import {
  PROPERTY_DESCRIPTIONS,
  PROPERTY_TITLES,
} from "@/consts/form-builder/property-descriptions";

export function FieldLabel({
  id,
  docId,
  fieldKey,
  children,
}: {
  id: string;
  docId: string;
  fieldKey: string;
  children?: ReactNode;
}) {
  const title =
    PROPERTY_TITLES[docId]?.[fieldKey] ??
    PROPERTY_TITLES[docId]?.[fieldKey.replace(".", "_")] ??
    children;
  const desc =
    PROPERTY_DESCRIPTIONS[docId]?.[fieldKey] ??
    PROPERTY_DESCRIPTIONS[docId]?.[fieldKey.replace(".", "_")];
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{title}</Label>
      {desc && (
        <p className="text-xs text-muted-foreground font-normal">{desc}</p>
      )}
    </div>
  );
}
