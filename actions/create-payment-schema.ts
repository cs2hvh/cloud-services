import { z } from 'zod';

export const paymentSchema = z.object({
  amount_usd: z.coerce.number().min(20, "Amount must be at least $20"),
  currency: z.string().min(1, "Please select a currency")
});

export type FormState = {
  values: {
    amount_usd: number;
    currency: string;
  };
  errors: {
    amount_usd?: string[];
    currency?: string[];
  } | null;
  success: boolean;
  payment_url?: string;
};
