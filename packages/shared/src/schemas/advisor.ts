import { z } from 'zod';

export const advisorFocusSchema = z.enum(['balanced', 'money', 'territory', 'crew', 'quests']);
export const advisorPreferenceSchema = z.object({ focus: advisorFocusSchema.optional(), silenced: z.boolean().optional() }).strict();
export const advisorSuppressionSchema = z.object({
  suggestionKey: z.string().trim().min(1).max(120),
  mode: z.enum(['snooze', 'dismiss']),
}).strict();
export const advisorFocusInputSchema = z.object({ focus: advisorFocusSchema }).strict();

export type AdvisorPreferenceInput = z.infer<typeof advisorPreferenceSchema>;
export type AdvisorSuppressionInput = z.infer<typeof advisorSuppressionSchema>;

export const advisorEvaluationSchema = z.object({
  event: z.enum(['shown', 'clicked', 'dismissed', 'silenced', 'completed']),
  ruleId: z.string().trim().min(1).max(80),
  suggestionKey: z.string().trim().min(1).max(120),
  slot: z.number().int().min(0).max(2),
  focus: advisorFocusSchema,
  rulesetVersion: z.string().trim().min(1).max(80),
  sourceFingerprint: z.string().trim().max(160).optional(),
  outcome: z.string().trim().max(80).optional(),
}).strict();
