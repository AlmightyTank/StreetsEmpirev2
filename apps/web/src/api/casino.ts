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
  CasinoPokerActionInput,
  CasinoPokerResponseDto,
  CasinoPokerStartInput,
  CasinoPokerStateDto,
  CasinoPokerTableCreateInput,
  CasinoPokerTableJoinInput,
  CasinoPokerTableDto,
  CasinoPokerTablePlayInput,
  CasinoPokerTableViewDto,
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
  poker: () => api.get<CasinoPokerStateDto>('/game/casino/poker'),
  pokerDeal: (input: CasinoPokerStartInput) => api.post<CasinoPokerResponseDto & { page: CasinoPageDto }>('/game/casino/poker/deal', input),
  pokerAction: (input: CasinoPokerActionInput) => api.post<CasinoPokerResponseDto & { page: CasinoPageDto }>('/game/casino/poker/action', input),
  pokerCreateTable: (input: CasinoPokerTableCreateInput) => api.post<{ table: CasinoPokerTableDto; inviteCode?: string; page: CasinoPageDto }>('/game/casino/poker/tables', input),
  pokerJoinTable: (id: string, input: CasinoPokerTableJoinInput) => api.post<{ table: CasinoPokerTableDto; page: CasinoPageDto }>('/game/casino/poker/tables/' + encodeURIComponent(id) + '/join', input),
  pokerLeaveTable: (id: string, actionId: string) => api.post<{ poker: CasinoPokerStateDto; page: CasinoPageDto }>('/game/casino/poker/tables/' + encodeURIComponent(id) + '/leave', { actionId }),
  pokerTable: (id: string) => api.get<CasinoPokerTableViewDto>('/game/casino/poker/tables/' + encodeURIComponent(id)),
  pokerStartTable: (id: string, actionId: string) => api.post<{ table: CasinoPokerTableViewDto; page: CasinoPageDto }>('/game/casino/poker/tables/' + encodeURIComponent(id) + '/start', { actionId }),
  pokerTableAction: (id: string, input: CasinoPokerTablePlayInput) => api.post<{ table: CasinoPokerTableViewDto; page: CasinoPageDto }>('/game/casino/poker/tables/' + encodeURIComponent(id) + '/action', input),
  closeSession: (sessionId: string, input: CasinoSessionCloseInput) =>
    api.post<CasinoPageDto>('/game/casino/sessions/' + encodeURIComponent(sessionId) + '/close', input),
};
