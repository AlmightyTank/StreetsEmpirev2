import { z } from 'zod';
import { actionIdSchema } from './game.js';

const casinoAmountCents = z.number({ invalid_type_error: 'Enter an amount.' })
  .int('Use whole cents.')
  .positive('Enter an amount greater than zero.')
  .safe();

export const casinoCashierSchema = z.object({
  amountCents: casinoAmountCents,
  actionId: actionIdSchema,
}).strict();

export const casinoSessionStartSchema = z.object({
  amountCents: casinoAmountCents,
  actionId: actionIdSchema,
}).strict();

export const casinoSessionCloseSchema = z.object({ actionId: actionIdSchema }).strict();

export type CasinoCashierInput = z.infer<typeof casinoCashierSchema>;
export type CasinoSessionStartInput = z.infer<typeof casinoSessionStartSchema>;
export type CasinoSessionCloseInput = z.infer<typeof casinoSessionCloseSchema>;
