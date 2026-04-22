/** Estado del editor de schema JSON (tools / parámetros). */

import type { SchemaType } from "@/consts/parameter-schema";

export interface EditorProperty {
  id: string;
  name: string;
  type: SchemaType;
  description: string;
  required: boolean;
  enum?: string[];
  format?: string;
  /** For type === 'object' */
  properties?: EditorProperty[];
  requiredSub?: string[];
  /** For type === 'array' */
  itemsType?: SchemaType;
  itemsProperties?: EditorProperty[];
}

export interface EditorState {
  properties: EditorProperty[];
  required: string[];
}
