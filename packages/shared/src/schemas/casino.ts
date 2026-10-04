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


export const casinoRouletteSpinSchema = z.object({
  tableKey: z.string().trim().min(1).max(64).regex(/^[A-Z0-9_]+$/, 'Pick a valid roulette table.'),
  bets: z.array(z.object({
    kind: z.enum(['STRAIGHT','SPLIT','STREET','CORNER','SIX_LINE','DOZEN','COLUMN','RED','BLACK','ODD','EVEN','LOW','HIGH']),
    selection: z.string().trim().min(1).max(64),
    amountCents: casinoAmountCents,
  }).strict()).min(1, 'Place at least one roulette bet.').max(100),
  actionId: actionIdSchema,
}).strict();

export const casinoStreetDiceStartSchema = z.object({
  tableKey: z.string().trim().min(1).max(64).regex(/^[A-Z0-9_]+$/, 'Pick a valid Street Dice table.'),
  wagerCents: casinoAmountCents,
  actionId: actionIdSchema,
}).strict();

export const casinoStreetDiceRollSchema = z.object({
  roundId: z.string().trim().min(1).max(64),
  actionId: actionIdSchema,
}).strict();

export const casinoStreetDiceOddsSchema = z.object({
  roundId: z.string().trim().min(1).max(64),
  amountCents: casinoAmountCents,
  actionId: actionIdSchema,
}).strict();

export const casinoPokerStartSchema = z.object({
  buyInCents: casinoAmountCents,
  actionId: actionIdSchema,
}).strict();

export const casinoPokerActionSchema = z.object({
  handId: z.string().trim().min(1).max(64),
  action: z.enum(['FOLD', 'CHECK', 'CALL', 'RAISE', 'ALL_IN']),
  actionId: actionIdSchema,
}).strict();

export const casinoPokerTableCreateSchema = z.object({
  name: z.string().trim().min(3).max(32), visibility: z.enum(['PUBLIC', 'PRIVATE']), buyInCents: casinoAmountCents,
  maxPlayers: z.number().int().min(2).max(6), actionId: actionIdSchema,
}).strict();
export const casinoPokerTableJoinSchema = z.object({ inviteCode: z.string().trim().min(6).max(16).optional(), actionId: actionIdSchema }).strict();
export const casinoPokerTableActionSchema = z.object({ actionId: actionIdSchema }).strict();
export const casinoPokerTableStartSchema = z.object({ actionId: actionIdSchema }).strict();
export const casinoPokerTablePlaySchema = z.object({ action: z.enum(['FOLD', 'CHECK', 'CALL', 'RAISE', 'ALL_IN']), actionId: actionIdSchema }).strict();

/** 1.2.0-E. Spend comps on hotel blocks for the boss's current trip. */
export const casinoCompHotelSchema = z.object({
  blocks: z.number({ invalid_type_error: 'Say how long to stay on.' }).int('Extend by whole blocks.').min(1, 'Extend by at least one block.').max(24).safe(),
  actionId: actionIdSchema,
}).strict();

export type CasinoCashierInput = z.infer<typeof casinoCashierSchema>;
export type CasinoSessionStartInput = z.infer<typeof casinoSessionStartSchema>;
export type CasinoSessionCloseInput = z.infer<typeof casinoSessionCloseSchema>;
export type CasinoSlotSpinInput = z.infer<typeof casinoSlotSpinSchema>;

export type CasinoBlackjackDealInput = z.infer<typeof casinoBlackjackDealSchema>;
export type CasinoBlackjackActionInput = z.infer<typeof casinoBlackjackActionSchema>;
export type CasinoRouletteSpinInput = z.infer<typeof casinoRouletteSpinSchema>;
export type CasinoStreetDiceStartInput = z.infer<typeof casinoStreetDiceStartSchema>;
export type CasinoStreetDiceRollInput = z.infer<typeof casinoStreetDiceRollSchema>;
export type CasinoStreetDiceOddsInput = z.infer<typeof casinoStreetDiceOddsSchema>;
export type CasinoPokerStartInput = z.infer<typeof casinoPokerStartSchema>;
export type CasinoPokerActionInput = z.infer<typeof casinoPokerActionSchema>;
export type CasinoPokerTableCreateInput = z.infer<typeof casinoPokerTableCreateSchema>;
export type CasinoPokerTableJoinInput = z.infer<typeof casinoPokerTableJoinSchema>;
export type CasinoPokerTableActionInput = z.infer<typeof casinoPokerTableActionSchema>;
export type CasinoPokerTableStartInput = z.infer<typeof casinoPokerTableStartSchema>;
export type CasinoPokerTablePlayInput = z.infer<typeof casinoPokerTablePlaySchema>;
export type CasinoCompHotelInput = z.infer<typeof casinoCompHotelSchema>;
