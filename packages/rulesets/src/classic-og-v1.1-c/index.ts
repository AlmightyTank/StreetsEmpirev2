import { classicOgV11B } from '../classic-og-v1.1-b/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.1.0-C gives every business a racket to run on top of its front: two to choose from per
 * business, one at a time, with a cooldown on switching. A racket pays more or gives a
 * system a small edge, and most of them draw Heat. No racket beats the system it hooks
 * (paid recon, Lookouts, the Safe Room, standing at the stores), and laundering is capped
 * per day and per round. Business balance is otherwise B's.
 */
export const classicOgV11C = {
  ...classicOgV11B,
  meta: { id: 'classic-og-v1.1-c', version: '1.1.0-C', name: 'Classic OG - Rackets' },
  business: {
    ...classicOgV11B.business,
    rackets: {
      levelStrength: [0.5, 0.625, 0.75, 0.875, 1],
      switchTurnCost: 2,
      switchCooldownHours: 12,
      laundering: { dailyHeatCap: 48, roundHeatCap: 480, bribePriceShare: 0.8 },
      catalog: {
        ECSTASY_DEMAND: {
          name: 'Ecstasy demand', business: 'NIGHTCLUB',
          description: 'The dance floor wants pills: Pip pays more for your ecstasy.',
          effect: { kind: 'STORE_PRICE', store: 'PIP', items: ['ECSTASY'], sellBonusPercent: 8 },
          heatPerHour: 1,
        },
        INFORMATION_NETWORK: {
          name: 'Information network', business: 'NIGHTCLUB',
          description: 'Bouncers and regulars talk: earlier sightings of pushes on your blocks and tails on your runs.',
          effect: { kind: 'HEADS_UP', minutes: 2 },
          heatPerHour: 0,
        },
        BACK_ROOM_CARDS: {
          name: 'Back-room cards', business: 'BAR',
          description: 'A quiet game in the back: a little extra cash, very little Heat.',
          effect: { kind: 'CASH', incomeShare: 0.15 },
          heatPerHour: 1,
        },
        LOOSE_LIPS: {
          name: 'Loose lips', business: 'BAR',
          description: 'Drinkers talk: recon on crews in your city costs a turn less.',
          effect: { kind: 'RECON_DISCOUNT', turns: 1 },
          heatPerHour: 0,
        },
        VIP_ROOM: {
          name: 'VIP room', business: 'STRIP_CLUB',
          description: 'Private dances for big spenders: high cash, high Heat.',
          effect: { kind: 'CASH', incomeShare: 0.35 },
          heatPerHour: 5,
        },
        PILLOW_TALK: {
          name: 'Pillow talk', business: 'STRIP_CLUB',
          description: 'The girls hear who is coming: extra home raid defense.',
          effect: { kind: 'RAID_DEFENSE', percent: 4 },
          heatPerHour: 1,
        },
        STOLEN_LOW_RIDERS: {
          name: 'Stolen Low-Riders', business: 'CHOP_SHOP',
          description: 'Hot cars with new plates: Charlie sells you Low-Riders cheaper.',
          effect: { kind: 'STORE_PRICE', store: 'CHARLIE', items: ['LOW_RIDER'], buyDiscountPercent: 8 },
          heatPerHour: 2,
        },
        VEHICLE_RECOVERY: {
          name: 'Vehicle recovery', business: 'CHOP_SHOP',
          description: 'The shop knows every chop in town: a Low-Rider a convoy hit would take may come back.',
          effect: { kind: 'VEHICLE_RECOVERY', share: 0.4 },
          heatPerHour: 1,
        },
        FENCING: {
          name: 'Fencing', business: 'PAWN_SHOP',
          description: 'No questions asked: Tommy pays more for the guns you sell back.',
          effect: { kind: 'STORE_PRICE', store: 'TOMMY', items: ['PISTOL', 'SHOTGUN', 'TEK9', 'AK47'], sellBonusPercent: 10 },
          heatPerHour: 2,
        },
        LOAN_SHARKING: {
          name: 'Loan sharking', business: 'PAWN_SHOP',
          description: 'Cash out the back at bad rates: good money into the register, and Heat.',
          effect: { kind: 'CASH', incomeShare: 0.3 },
          heatPerHour: 3,
        },
        RUN_MODS: {
          name: 'Run mods', business: 'AUTO_GARAGE',
          description: 'Hidden compartments and clean plates: fewer police stops on runs out of town.',
          effect: { kind: 'RUN_STOPS', share: 0.15 },
          heatPerHour: 0,
        },
        GETAWAY_CARS: {
          name: 'Getaway cars', business: 'AUTO_GARAGE',
          description: 'A car waiting round the corner: a beaten push squad takes fewer wounds getting home.',
          effect: { kind: 'GETAWAY', share: 0.25 },
          heatPerHour: 1,
        },
        BEER_SUPPLY: {
          name: 'Beer supply', business: 'CONVENIENCE_STORE',
          description: 'Cases off the back of the truck: cheaper beer at the Corner Store.',
          effect: { kind: 'STORE_PRICE', store: 'CORNER', items: ['BEER'], buyDiscountPercent: 10 },
          heatPerHour: 0,
        },
        COUNTER_SALES: {
          name: 'Counter sales', business: 'CONVENIENCE_STORE',
          description: 'Product under the counter: a little sells every hour at Pip’s price, no street turns.',
          effect: { kind: 'COUNTER_SALES', unitsPerHour: 6 },
          heatPerHour: 2,
        },
        PRODUCT_STORAGE: {
          name: 'Product storage', business: 'WAREHOUSE',
          description: 'A locked cage in the back: more product sealed away from raids, on top of the Safe Room.',
          effect: { kind: 'PRODUCT_STORAGE', units: 40 },
          heatPerHour: 1,
        },
        SHIPMENT_CAPACITY: {
          name: 'Shipment capacity', business: 'WAREHOUSE',
          description: 'Crates packed tight: bigger loads on runs out of town.',
          effect: { kind: 'CARGO', share: 0.1 },
          heatPerHour: 1,
        },
        HOUSE_ALWAYS_WINS: {
          name: 'The house always wins', business: 'CASINO_FRONT',
          description: 'Rigged tables: big cash, big Heat.',
          effect: { kind: 'CASH', incomeShare: 0.45 },
          heatPerHour: 7,
        },
        CASINO_LAUNDERING: {
          name: 'Laundering', business: 'CASINO_FRONT',
          description: 'Run dirty money through the cage: washes Heat off every hour, paid from the register.',
          effect: { kind: 'LAUNDER', heatPerHour: 4 },
          heatPerHour: 0,
        },
        LAUNDERING: {
          name: 'Laundering', business: 'LAUNDROMAT',
          description: 'Quarters in, clean bills out: washes a little Heat off every hour, paid from the register.',
          effect: { kind: 'LAUNDER', heatPerHour: 2 },
          heatPerHour: 0,
        },
        WASH_AND_FOLD: {
          name: 'Wash & fold', business: 'LAUNDROMAT',
          description: 'Clean books for the whole block: your other rackets draw less Heat.',
          effect: { kind: 'HEAT_SHIELD', share: 0.4 },
          heatPerHour: 0,
        },
      },
    },
  },
} as const satisfies Ruleset;
