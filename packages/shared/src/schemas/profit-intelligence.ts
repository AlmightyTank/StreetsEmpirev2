import { z } from 'zod';

const centsThreshold = z.string().regex(/^\d+$/, 'Enter a whole-cent threshold.').max(20).nullable();

export const profitIntelligenceGoalsSchema = z.object({
  minimumLiquidityCents: centsThreshold,
  minimumProductKey: z.string().regex(/^[A-Z0-9_]{1,40}$/).nullable(),
  minimumProductUnits: z.number().int().min(1).max(2_000_000_000).nullable(),
  maximumRoutePurchaseCents: centsThreshold,
}).superRefine((value, context) => {
  if ((value.minimumProductKey === null) !== (value.minimumProductUnits === null)) {
    context.addIssue({ code: 'custom', path: ['minimumProductUnits'], message: 'Choose both a product and a minimum stock amount.' });
  }
});

export type UpdateProfitIntelligenceGoalsInput = z.infer<typeof profitIntelligenceGoalsSchema>;
