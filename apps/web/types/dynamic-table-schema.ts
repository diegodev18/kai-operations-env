/** Contrato JSON de esquemas de tablas dinámicas (API + Firestore vía API). */

export type DynamicTableEnumOption = {
  value: string;
  label: string;
  color?: string;
};

export type DynamicTableReferenceConfig = {
  targetCollection: string;
  labelFields: string[];
  labelTemplate?: string;
};

export type DynamicTableField =
  | {
      key: string;
      label: string;
      type: "string";
      sortable?: boolean;
      filterable?: boolean;
    }
  | {
      key: string;
      label: string;
      type: "number";
      sortable?: boolean;
      filterable?: boolean;
    }
  | {
      key: string;
      label: string;
      type: "email";
      sortable?: boolean;
      filterable?: boolean;
    }
  | {
      key: string;
      label: string;
      type: "enum";
      options: DynamicTableEnumOption[];
      sortable?: boolean;
      filterable?: boolean;
    }
  | {
      key: string;
      label: string;
      type: "reference";
      reference: DynamicTableReferenceConfig;
      sortable?: boolean;
      filterable?: boolean;
    }
  | {
      key: string;
      label: string;
      type: "timestamp";
      sortable?: boolean;
      filterable?: boolean;
    };

export type DynamicTableSchemaDocument = {
  schemaId: string;
  label: string;
  description?: string | null;
  version: number;
  targetCollection: string;
  fields: DynamicTableField[];
  createdAt: string | null;
  updatedAt: string | null;
};

export const DYNAMIC_TABLE_FIELD_TYPES = [
  "string",
  "number",
  "email",
  "enum",
  "reference",
  "timestamp",
] as const;

export type DynamicTableFieldType = (typeof DYNAMIC_TABLE_FIELD_TYPES)[number];
