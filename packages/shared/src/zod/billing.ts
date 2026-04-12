import { z } from "zod";

export const patchBillingConfigSchema = z.object({
  domiciliated: z.boolean().optional(),
  defaultPaymentAmount: z.number().min(0).optional(),
  paymentDueDate: z.string().nullable().optional(),
});

export const createPaymentSchema = z.object({
  amount: z.number().min(0),
  period: z.string().trim().min(1),
  paymentMethod: z.string().trim().min(1),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  receiptUrl: z.string().trim().optional(),
});

export type PatchBillingConfig = z.infer<typeof patchBillingConfigSchema>;
export type CreatePayment = z.infer<typeof createPaymentSchema>;