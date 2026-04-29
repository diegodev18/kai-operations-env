import { z } from "zod";

const schemaIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export const dynamicTableSchemaIdSchema = z
  .string()
  .min(1, "schemaId es requerido")
  .regex(schemaIdPattern, "schemaId: solo letras, números, guiones; debe empezar con alfanumérico");

const enumOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  color: z.string().optional(),
});

const referenceInnerSchema = z
  .object({
    targetCollection: z.string().min(1),
    labelFields: z.array(z.string()).default([]),
    labelTemplate: z.string().optional(),
  })
  .refine(
    (r) => r.labelFields.length > 0 || Boolean(r.labelTemplate?.trim()),
    { message: "reference requiere labelFields no vacío o labelTemplate", path: ["labelFields"] },
  );

const stringFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.literal("string"),
  sortable: z.boolean().optional(),
  filterable: z.boolean().optional(),
});

const numberFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.literal("number"),
  sortable: z.boolean().optional(),
  filterable: z.boolean().optional(),
});

const emailFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.literal("email"),
  sortable: z.boolean().optional(),
  filterable: z.boolean().optional(),
});

const urlFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.literal("url"),
  sortable: z.boolean().optional(),
  filterable: z.boolean().optional(),
});

const enumFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.literal("enum"),
  options: z.array(enumOptionSchema).min(1, "enum requiere al menos una opción"),
  sortable: z.boolean().optional(),
  filterable: z.boolean().optional(),
});

const referenceFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.literal("reference"),
  reference: referenceInnerSchema,
  sortable: z.boolean().optional(),
  filterable: z.boolean().optional(),
});

const timestampFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.literal("timestamp"),
  sortable: z.boolean().optional(),
  filterable: z.boolean().optional(),
});

export const dynamicTableFieldSchema = z.discriminatedUnion("type", [
  stringFieldSchema,
  numberFieldSchema,
  emailFieldSchema,
  urlFieldSchema,
  enumFieldSchema,
  referenceFieldSchema,
  timestampFieldSchema,
]);

function uniqueFieldKeys(
  fields: z.infer<typeof dynamicTableFieldSchema>[],
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  for (let i = 0; i < fields.length; i++) {
    const k = fields[i].key;
    if (seen.has(k)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Clave duplicada: ${k}`,
        path: ["fields", i, "key"],
      });
    }
    seen.add(k);
  }
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field.type !== "enum") continue;
    const vals = new Set<string>();
    for (let j = 0; j < field.options.length; j++) {
      const v = field.options[j].value;
      if (vals.has(v)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Valor enum duplicado: ${v}`,
          path: ["fields", i, "options", j, "value"],
        });
      }
      vals.add(v);
    }
  }
}

/** Cuerpo POST: sin schemaId; el servidor usa un ID auto-generado de Firestore. */
export const dynamicTableSchemaNewDocumentInputSchema = z
  .object({
    label: z.string().min(1),
    description: z.string().optional(),
    version: z.number().int().min(1).default(1),
    targetCollection: z.string().min(1),
    fields: z.array(dynamicTableFieldSchema).default([]),
  })
  .superRefine((data, ctx) => uniqueFieldKeys(data.fields, ctx));

/** Documento completo tras merge en PATCH (incluye schemaId del path). */
export const dynamicTableSchemaCreateBodySchema = dynamicTableSchemaNewDocumentInputSchema.and(
  z.object({ schemaId: dynamicTableSchemaIdSchema }),
);

export const dynamicTableSchemaPatchBodySchema = z
  .object({
    label: z.string().min(1).optional(),
    description: z.string().optional(),
    version: z.number().int().min(1).optional(),
    targetCollection: z.string().min(1).optional(),
    fields: z.array(dynamicTableFieldSchema).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Envía al menos un campo a actualizar" })
  .superRefine((data, ctx) => {
    if (data.fields) uniqueFieldKeys(data.fields, ctx);
  });

export type DynamicTableSchemaNewDocumentInput = z.infer<typeof dynamicTableSchemaNewDocumentInputSchema>;
export type DynamicTableSchemaCreateBody = z.infer<typeof dynamicTableSchemaCreateBodySchema>;
export type DynamicTableSchemaPatchBody = z.infer<typeof dynamicTableSchemaPatchBodySchema>;
export type DynamicTableField = z.infer<typeof dynamicTableFieldSchema>;
