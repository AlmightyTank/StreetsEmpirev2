import type {
  CasinoBlackjackActionInput,
  CasinoBlackjackActionResponseDto,
  CasinoBlackjackDealInput,
  CasinoBlackjackDealResponseDto,
  CasinoBlackjackStateDto,
  CasinoCashierInput,
  CasinoPageDto,
  CasinoSessionCloseInput,
  CasinoSessionStartInput,
  CasinoSlotSpinInput,
  CasinoSlotSpinResponseDto,
  CasinoRouletteSpinInput,
  CasinoRouletteSpinResponseDto,
  CasinoRouletteStateDto,
  CasinoStreetDiceOddsInput,
  CasinoStreetDiceResponseDto,
  CasinoStreetDiceRollInput,
  CasinoStreetDiceStartInput,
  CasinoStreetDiceStateDto,
} from '@streets/shared';
import { api } from './client.js';

export const casinoApi = {
  page: () => api.get<CasinoPageDto>('/game/casino'),
  buy: (input: CasinoCashierInput) => api.post<CasinoPageDto>('/game/casino/chips/buy', input),
  redeem: (input: CasinoCashierInput) => api.post<CasinoPageDto>('/game/casino/chips/redeem', input),
  openSession: (input: CasinoSessionStartInput) => api.post<CasinoPageDto>('/game/casino/sessions', input),
  spin: (input: CasinoSlotSpinInput) => api.post<CasinoSlotSpinResponseDto>('/game/casino/slots/spin', input),
  blackjack: () => api.get<CasinoBlackjackStateDto>('/game/casino/blackjack'),
  blackjackDeal: (input: CasinoBlackjackDealInput) =>
    api.post<CasinoBlackjackDealResponseDto>('/game/casino/blackjack/deal', input),
  blackjackHit: (input: CasinoBlackjackActionInput) =>
    api.post<CasinoBlackjackActionResponseDto>('/game/casino/blackjack/hit', input),
  blackjackStand: (input: CasinoBlackjackActionInput) =>
    api.post<CasinoBlackjackActionResponseDto>('/game/casino/blackjack/stand', input),
  blackjackDouble: (input: CasinoBlackjackActionInput) =>
    api.post<CasinoBlackjackActionResponseDto>('/game/casino/blackjack/double', input),
  blackjackSplit: (input: CasinoBlackjackActionInput) =>
    api.post<CasinoBlackjackActionResponseDto>('/game/casino/blackjack/split', input),
  roulette: () => api.get<CasinoRouletteStateDto>('/game/casino/roulette'),
  rouletteSpin: (input: CasinoRouletteSpinInput) =>
    api.post<CasinoRouletteSpinResponseDto>('/game/casino/roulette/spin', input),
  streetDice: () => api.get<CasinoStreetDiceStateDto>('/game/casino/street-dice'),
  streetDiceStart: (input: CasinoStreetDiceStartInput) =>
    api.post<CasinoStreetDiceResponseDto>('/game/casino/street-dice/start', input),
  streetDiceRoll: (input: CasinoStreetDiceRollInput) =>
    api.post<CasinoStreetDiceResponseDto>('/game/casino/street-dice/roll', input),
  streetDiceOdds: (input: CasinoStreetDiceOddsInput) =>
    api.post<CasinoStreetDiceResponseDto>('/game/casino/street-dice/odds', input),
  closeSession: (sessionId: string, input: CasinoSessionCloseInput) =>
    api.post<CasinoPageDto>('/game/casino/sessions/' + encodeURIComponent(sessionId) + '/close', input),
};
