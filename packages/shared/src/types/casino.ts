export type CasinoVenueKindDto = 'FULL_CASINO' | 'PRIVATE_CLUB' | 'UNDERGROUND' | 'NIGHTLIFE';

export interface CasinoVenueDto {
  citySlug: string;
  cityName: string;
  name: string;
  blurb: string;
  kind: CasinoVenueKindDto;
  walletChipsCents: number;
  here: boolean;
}

export interface CasinoSessionDto {
  id: string;
  citySlug: string;
  cityName: string;
  venueName: string;
  bankrollCents: number;
  openedAt: string;
}

export interface CasinoSlotPaylineDto {
  key: string;
  name: string;
  /** One row index per reel: 0 top, 1 middle, 2 bottom. */
  rows: number[];
}

export interface CasinoSlotPaytableEntryDto {
  symbolKey: string;
  symbolLabel: string;
  glyph: string;
  payouts: Array<{ matches: number; payoutBps: number }>;
}

export interface CasinoSlotMachineDto {
  key: string;
  name: string;
  blurb: string;
  reels: number;
  rows: number;
  paylines: CasinoSlotPaylineDto[];
  paytable: CasinoSlotPaytableEntryDto[];
  /** Circular virtual reel strips, used only to animate toward server-selected stops. */
  reelStrips: CasinoSlotReelDto[][];
  minBetPerLineCents: number;
  maxBetPerLineCents: number;
  betStepCents: number;
  maxTotalWagerCents: number;
  availableHere: boolean;
  /** Base-game RTP before the free-spin feature. */
  baseRtpBps: number;
  /** Long-run RTP including the configured non-retriggering free spins. */
  effectiveRtpBps: number;
  freeSpins: {
    triggerBps: number;
    presentationLabel: string;
    possibleAwards: number[];
  } | null;
  progressive: {
    poolCents: number;
    contributionBps: number;
    eligibleBetPerLineCents: number;
    requiresAllPaylines: boolean;
  } | null;
}

export interface CasinoSlotReelDto {
  key: string;
  label: string;
  glyph: string;
}

export interface CasinoSlotPositionDto {
  reel: number;
  row: number;
}

export interface CasinoSlotLineWinDto {
  paylineKey: string;
  paylineName: string;
  symbolKey: string;
  symbolLabel: string;
  matchCount: number;
  payoutCents: number;
  positions: CasinoSlotPositionDto[];
}

export type CasinoSlotWinTierDto = 'NONE' | 'SMALL' | 'BIG' | 'MEGA' | 'JACKPOT';

export interface CasinoSlotNearMissDto {
  paylineKey: string;
  symbolKey: string;
  symbolLabel: string;
  reel: number;
}

export interface CasinoSlotSpinDto {
  actionId: string;
  machineKey: string;
  machineName: string;
  betPerLineCents: number;
  activePaylineKeys: string[];
  /** Nominal value of the spin. This stays non-zero on a comped free spin. */
  wagerCents: number;
  /** What was actually removed from the bankroll: zero for a free spin. */
  chargedWagerCents: number;
  isFreeSpin: boolean;
  payoutCents: number;
  netCents: number;
  payoutBps: number;
  grid: CasinoSlotReelDto[][];
  reelStops: number[];
  winningLines: CasinoSlotLineWinDto[];
  nearMiss: CasinoSlotNearMissDto | null;
  winTier: CasinoSlotWinTierDto;
  jackpotContributionCents: number;
  jackpotAwardCents: number;
  freeSpinsAwarded: number;
  freeSpinsRemainingAfter: number;
  bankrollAfterCents: number;
  createdAt: string;
}

export interface CasinoSlotSpinResponseDto {
  page: CasinoPageDto;
  spin: CasinoSlotSpinDto;
}

export interface CasinoFreeSpinBonusDto {
  id: string;
  machineKey: string;
  machineName: string;
  citySlug: string;
  cityName: string;
  betPerLineCents: number;
  activePaylineKeys: string[];
  awardedSpins: number;
  remainingSpins: number;
  totalWonCents: number;
  presentationLabel: string;
  awardedAt: string;
}

export interface CasinoBlackjackTableDto {
  key: string;
  name: string;
  blurb: string;
  minBetCents: number;
  maxBetCents: number;
  betStepCents: number;
  decks: number;
  dealerHitsSoft17: boolean;
  blackjackPays: string;
  maxSplitHands: number;
  allowDoubleAfterSplit: boolean;
  splitAcesOneCard: boolean;
  availableHere: boolean;
}

export interface CasinoBlackjackCardDto {
  code: string | null;
  label: string;
  hidden: boolean;
}

export type CasinoBlackjackOutcomeDto = 'BLACKJACK' | 'WIN' | 'PUSH' | 'LOSE' | 'BUST';
export type CasinoBlackjackPlayerHandStatusDto = 'ACTIVE' | 'STOOD' | 'BUST' | 'DONE';

export interface CasinoBlackjackPlayerHandDto {
  index: number;
  cards: CasinoBlackjackCardDto[];
  total: number;
  soft: boolean;
  status: CasinoBlackjackPlayerHandStatusDto;
  wagerCents: number;
  outcome: CasinoBlackjackOutcomeDto | null;
  returnCents: number;
  canHit: boolean;
  canStand: boolean;
  canDouble: boolean;
  canSplit: boolean;
}

export interface CasinoBlackjackHandDto {
  id: string;
  tableKey: string;
  tableName: string;
  status: 'ACTIVE' | 'SETTLED';
  dealerCards: CasinoBlackjackCardDto[];
  dealerTotal: number | null;
  dealerSoft: boolean | null;
  playerHands: CasinoBlackjackPlayerHandDto[];
  activeHandIndex: number;
  totalWagerCents: number;
  totalReturnCents: number;
  netCents: number;
  bankrollAfterCents: number;
  shoeRemainingCards: number;
  shuffleNumber: number;
  createdAt: string;
  settledAt: string | null;
}

export interface CasinoBlackjackStateDto {
  enabled: boolean;
  tables: CasinoBlackjackTableDto[];
  activeHand: CasinoBlackjackHandDto | null;
  history: CasinoBlackjackHandDto[];
}

export interface CasinoBlackjackDealResponseDto {
  page: CasinoPageDto;
  blackjack: CasinoBlackjackStateDto;
  hand: CasinoBlackjackHandDto;
}

export type CasinoBlackjackActionResponseDto = CasinoBlackjackDealResponseDto;

export type CasinoRouletteBetKindDto =
  | 'STRAIGHT'
  | 'SPLIT'
  | 'STREET'
  | 'CORNER'
  | 'SIX_LINE'
  | 'DOZEN'
  | 'COLUMN'
  | 'RED'
  | 'BLACK'
  | 'ODD'
  | 'EVEN'
  | 'LOW'
  | 'HIGH';

export interface CasinoRouletteTableDto {
  key: string;
  name: string;
  blurb: string;
  wheel: 'AMERICAN' | 'EUROPEAN';
  minBetCents: number;
  maxBetCents: number;
  betStepCents: number;
  maxTotalBetCents: number;
  availableHere: boolean;
}

export interface CasinoRouletteBetDto {
  kind: CasinoRouletteBetKindDto;
  selection: string;
  amountCents: number;
  won: boolean;
  returnCents: number;
}

export interface CasinoRouletteSpinDto {
  actionId: string;
  tableKey: string;
  tableName: string;
  wheel: 'AMERICAN' | 'EUROPEAN';
  pocket: string;
  color: 'RED' | 'BLACK' | 'GREEN';
  bets: CasinoRouletteBetDto[];
  wagerCents: number;
  returnCents: number;
  netCents: number;
  bankrollAfterCents: number;
  createdAt: string;
}

export interface CasinoRouletteStateDto {
  enabled: boolean;
  tables: CasinoRouletteTableDto[];
  history: CasinoRouletteSpinDto[];
}

export interface CasinoRouletteSpinResponseDto {
  page: CasinoPageDto;
  roulette: CasinoRouletteStateDto;
  spin: CasinoRouletteSpinDto;
}

export interface CasinoStreetDiceTableDto {
  key: string;
  name: string;
  blurb: string;
  minBetCents: number;
  maxBetCents: number;
  betStepCents: number;
  maxOddsMultiple: number;
  availableHere: boolean;
}

export type CasinoStreetDiceOutcomeDto = 'WIN' | 'LOSE' | 'POINT' | 'CONTINUE';

export interface CasinoStreetDiceRoundDto {
  id: string;
  tableKey: string;
  tableName: string;
  status: 'ACTIVE' | 'SETTLED';
  lineWagerCents: number;
  oddsWagerCents: number;
  point: number | null;
  dice: [number, number] | null;
  total: number | null;
  outcome: CasinoStreetDiceOutcomeDto | null;
  totalReturnCents: number;
  netCents: number;
  bankrollAfterCents: number;
  rollCount: number;
  canRoll: boolean;
  canAddOdds: boolean;
  maxOddsCents: number;
  createdAt: string;
  settledAt: string | null;
}

export interface CasinoStreetDiceStateDto {
  enabled: boolean;
  tables: CasinoStreetDiceTableDto[];
  activeRound: CasinoStreetDiceRoundDto | null;
  history: CasinoStreetDiceRoundDto[];
}

export interface CasinoPokerCardDto { rank: number; suit: 'C' | 'D' | 'H' | 'S'; }
export interface CasinoPokerSeatDto {
  id: string;
  name: string;
  isHuman: boolean;
  cards: CasinoPokerCardDto[];
  folded: boolean;
  contributionCents: number;
  stackCents: number;
  handName: string | null;
}
export interface CasinoPokerHandDto {
  id: string;
  status: 'ACTIVE' | 'SETTLED';
  street: 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN' | 'COMPLETE';
  board: CasinoPokerCardDto[];
  seats: CasinoPokerSeatDto[];
  potCents: number;
  amountToCallCents: number;
  buyInCents: number;
  bankrollAfterCents: number;
  outcome: string | null;
  rakeCents: number;
  createdAt: string;
  settledAt: string | null;
}
export interface CasinoPokerStateDto {
  enabled: boolean;
  minBuyInCents: number;
  maxBuyInCents: number;
  smallBlindCents: number;
  bigBlindCents: number;
  raiseCents: number;
  rakeBps: number;
  rakeCapCents: number;
  activeHand: CasinoPokerHandDto | null;
  history: CasinoPokerHandDto[];
  tables: CasinoPokerTableDto[];
}
export interface CasinoPokerTableDto {
  id: string; name: string; visibility: 'PUBLIC' | 'PRIVATE'; citySlug: string; cityName: string;
  buyInCents: number; maxPlayers: number; status: 'WAITING' | 'PLAYING' | 'CLOSED'; seats: Array<{ displayName: string; seatNo: number; isYou: boolean; stackCents: number }>;
}
export interface CasinoPokerTableViewDto extends CasinoPokerTableDto {
  hand: null | { id: string; handNo: number; street: CasinoPokerHandDto['street']; board: CasinoPokerCardDto[]; potCents: number; rakeCents: number; turnSeatNo: number | null; myTurn: boolean; amountToCallCents: number; outcome: string | null; seats: Array<{ displayName: string; seatNo: number; isYou: boolean; stackCents: number; contributionCents: number; streetBetCents: number; folded: boolean; allIn: boolean; cards: CasinoPokerCardDto[]; handName: string | null }> };
}
export interface CasinoPokerTableResultDto { table: CasinoPokerTableDto; inviteCode?: string; page: CasinoPageDto }
export interface CasinoPokerResponseDto {
  poker: CasinoPokerStateDto;
  hand: CasinoPokerHandDto;
}

export interface CasinoStreetDiceResponseDto {
  page: CasinoPageDto;
  streetDice: CasinoStreetDiceStateDto;
  round: CasinoStreetDiceRoundDto;
}

export type CasinoLedgerKindDto = 'BUY_CHIPS' | 'REDEEM_CHIPS' | 'SESSION_OPEN' | 'SESSION_CLOSE' | 'SLOT_SPIN' | 'BLACKJACK' | 'ROULETTE' | 'STREET_DICE' | 'POKER_BUY_IN' | 'POKER_CASH_OUT' | 'POKER_TABLE_BUY_IN' | 'POKER_TABLE_REFUND';

export interface CasinoLedgerEntryDto {
  id: string;
  kind: CasinoLedgerKindDto;
  display: {
    title: string;
    detail: string;
    amountLabel: string;
    amountCents: number;
    tone: 'positive' | 'negative' | 'neutral';
  };
  citySlug: string;
  cityName: string;
  venueName: string;
  sessionId: string | null;
  cashDeltaCents: number;
  walletChipDeltaCents: number;
  sessionChipDeltaCents: number;
  walletChipsAfterCents: number;
  sessionChipsAfterCents: number;
  createdAt: string;
}

export interface CasinoPageDto {
  enabled: boolean;
  /** Cash physically available to the boss at this location; zero while in transit. */
  cashCents: number;
  currentCitySlug: string | null;
  currentVenue: CasinoVenueDto | null;
  venues: CasinoVenueDto[];
  openSession: CasinoSessionDto | null;
  slotMachines: CasinoSlotMachineDto[];
  freeSpinBonus: CasinoFreeSpinBonusDto | null;
  recentLedger: CasinoLedgerEntryDto[];
  totalCasinoValueCents: number;
  limits: {
    chipUnitCents: number;
    cashierMinCents: number;
    cashierMaxCents: number;
    sessionMinCents: number;
    sessionMaxCents: number;
  } | null;
}
