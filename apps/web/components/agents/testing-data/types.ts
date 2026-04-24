export type FieldValue = unknown;

export interface FieldDisplay {
  key: string;
  value: FieldValue;
  type: "string" | "number" | "boolean" | "null" | "timestamp" | "geopoint" | "docref" | "array" | "object";
}

export interface DocField {
  key: string;
  value: unknown;
  type: "string" | "number" | "boolean" | "null" | "object" | "array";
}

export interface CollectionNode {
  name: string;
  subcollections: CollectionNode[];
  expanded: boolean;
}

export interface NestedDialogState {
  isOpen: boolean;
  parentKey: string;
  initialData: Record<string, unknown>;
  isArray: boolean;
}
