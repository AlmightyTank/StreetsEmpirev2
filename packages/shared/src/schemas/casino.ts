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

export const casinoSlotSpinSchema = z.object({
  machineKey: z.string().trim().min(1).max(64).regex(/^[A-Z0-9_]+$/, 'Pick a valid slot machine.'),
  betPerLineCents: casinoAmountCents,
  activePaylineKeys: z.array(
    z.string().trim().min(1).max(64).regex(/^[A-Z0-9_]+$/, 'Pick a valid payline.'),
  ).min(1, 'Select at least one payline.').max(50).refine(
    (keys) => new Set(keys).size === keys.length,
    'A payline can only be selected once.',
  ),
  useFreeSpin: z.boolean().optional(),
  actionId: actionIdSchema,
}).strict();

export const casinoBlackjackDealSchema = z.object({
  tableKey: z.string().trim().min(1).max(64).regex(/^[A-Z0-9_]+$/, 'Pick a valid blackjack table.'),
  wagerCents: casinoAmountCents,
  actionId: actionIdSchema,
}).strict();

export const casinoBlackjackActionSchema = z.object({
  handId: z.string().trim().min(1).max(64),
  actionId: actionIdSchema,
}).strict();

export type CasinoCashierInput = z.infer<typeof casinoCashierSchema>;
export type CasinoSessionStartInput = z.infer<typeof casinoSessionStartSchema>;
export type CasinoSessionCloseInput = z.infer<typeof casinoSessionCloseSchema>;
export type CasinoSlotSpinInput = z.infer<typeof casinoSlotSpinSchema>;

export type CasinoBlackjackDealInput = z.infer<typeof casinoBlackjackDealSchema>;
export type CasinoBlackjackActionInput = z.infer<typeof casinoBlackjackActionSchema>;
