/**
 * Item art: one picture per item, drawn in a single style so every reward,
 * store row and inventory slot can show the thing itself instead of its name.
 *
 * Art lives in `apps/web/public/items/` as hand-drawn SVGs (transparent
 * background, lit from the top-left, dark outline, soft drop shadow). The
 * tile behind it — grid, rarity colour, labels — comes from `ItemTile`, so the
 * same picture works on any background. `cells` is the Tarkov-style footprint:
 * a 1x1 item is drawn on a 128x128 canvas, a 2x1 item on 256x128.
 *
 * Keys match the ruleset keys (store items, products, favors) so callers can
 * pass what they already have. See docs/ITEM-ART.md before adding one.
 */

export type ItemRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type ItemCategory = 'SUPPLY' | 'CREW' | 'WEAPON' | 'VEHICLE' | 'PRODUCT' | 'FAVOR' | 'CURRENCY' | 'REPUTATION' | 'COSMETIC';

export interface ItemArt {
  readonly name: string;
  /** The corner label on the tile. Keep it to about 10 characters. */
  readonly shortName: string;
  readonly category: ItemCategory;
  readonly rarity: ItemRarity;
  /** File name in `public/items/`. */
  readonly file: string;
  /** Footprint in grid cells, [width, height]. */
  readonly cells: readonly [number, number];
}

const ONE = [1, 1] as const;
const WIDE = [2, 1] as const;

export const ITEM_ART = {
  // Corner Store
  CONDOM: { name: 'Condoms', shortName: 'Condoms', category: 'SUPPLY', rarity: 'COMMON', file: 'condoms.svg', cells: ONE },
  MEDICINE: { name: 'Medicine', shortName: 'Meds', category: 'SUPPLY', rarity: 'COMMON', file: 'medicine.svg', cells: ONE },
  BEER: { name: 'Beer', shortName: 'Beer', category: 'SUPPLY', rarity: 'COMMON', file: 'beer.svg', cells: ONE },

  // Tek9 Tommy's
  THUG: { name: 'Thug', shortName: 'Thug', category: 'CREW', rarity: 'UNCOMMON', file: 'thug.svg', cells: ONE },
  // Hoes are recruited by Scouting, not sold; the art is here so they can be a reward.
  HOE: { name: 'Hoe', shortName: 'Hoe', category: 'CREW', rarity: 'UNCOMMON', file: 'hoe.svg', cells: ONE },
  PISTOL: { name: 'Pistol', shortName: 'Pistol', category: 'WEAPON', rarity: 'COMMON', file: 'pistol.svg', cells: ONE },
  SHOTGUN: { name: 'Shotgun', shortName: 'Shotgun', category: 'WEAPON', rarity: 'UNCOMMON', file: 'shotgun.svg', cells: WIDE },
  TEK9: { name: 'Tek-9', shortName: 'Tek-9', category: 'WEAPON', rarity: 'RARE', file: 'tek9.svg', cells: WIDE },
  AK47: { name: 'AK-47', shortName: 'AK-47', category: 'WEAPON', rarity: 'EPIC', file: 'ak47.svg', cells: WIDE },

  // Charlie's Chop Shop
  LOW_RIDER: { name: 'Low-Rider', shortName: 'Low-Rider', category: 'VEHICLE', rarity: 'EPIC', file: 'low-rider.svg', cells: WIDE },

  // Products
  CRACK: { name: 'Crack', shortName: 'Crack', category: 'PRODUCT', rarity: 'COMMON', file: 'crack.svg', cells: ONE },
  WEED: { name: 'Weed', shortName: 'Weed', category: 'PRODUCT', rarity: 'COMMON', file: 'weed.svg', cells: ONE },
  ECSTASY: { name: 'Ecstasy', shortName: 'Ecstasy', category: 'PRODUCT', rarity: 'UNCOMMON', file: 'ecstasy.svg', cells: ONE },
  METH: { name: 'Meth', shortName: 'Meth', category: 'PRODUCT', rarity: 'UNCOMMON', file: 'meth.svg', cells: ONE },
  COCAINE: { name: 'Cocaine', shortName: 'Cocaine', category: 'PRODUCT', rarity: 'RARE', file: 'cocaine.svg', cells: ONE },
  HEROIN: { name: 'Heroin', shortName: 'Heroin', category: 'PRODUCT', rarity: 'RARE', file: 'heroin.svg', cells: ONE },

  // Contact favors
  MAMA_ADVICE: { name: "Mama's Advice", shortName: 'Advice', category: 'FAVOR', rarity: 'RARE', file: 'favor-mama-advice.svg', cells: ONE },
  STREET_FRENZY: { name: 'Street Frenzy', shortName: 'Frenzy', category: 'FAVOR', rarity: 'RARE', file: 'favor-street-frenzy.svg', cells: ONE },
  COOKHOUSE_RUSH: { name: 'Cookhouse Rush', shortName: 'Rush', category: 'FAVOR', rarity: 'RARE', file: 'favor-cookhouse-rush.svg', cells: ONE },
  PIP_CONNECTION: { name: "Pip's Connection", shortName: 'Pip Card', category: 'FAVOR', rarity: 'RARE', file: 'favor-pip-connection.svg', cells: ONE },
  TOMMY_VOUCHER: { name: 'Tommy Voucher', shortName: 'Voucher', category: 'FAVOR', rarity: 'RARE', file: 'favor-tommy-voucher.svg', cells: ONE },
  FIELD_MEDIC: { name: 'Field Medic', shortName: 'Medic', category: 'FAVOR', rarity: 'RARE', file: 'favor-field-medic.svg', cells: ONE },
  BURNER_PHONE: { name: 'Burner Phone', shortName: 'Burner', category: 'FAVOR', rarity: 'RARE', file: 'favor-burner-phone.svg', cells: ONE },
  DOCTOR_FAVOR: { name: 'Doctor Favor', shortName: 'Doctor', category: 'FAVOR', rarity: 'RARE', file: 'favor-doctor-favor.svg', cells: ONE },
  GHOST_NETWORK: { name: 'Ghost Network', shortName: 'Ghost Net', category: 'FAVOR', rarity: 'LEGENDARY', file: 'favor-ghost-network.svg', cells: ONE },
  PIP_BLACK_BOOK: { name: "Pip's Black Book", shortName: 'Black Book', category: 'FAVOR', rarity: 'LEGENDARY', file: 'favor-pip-black-book.svg', cells: ONE },
  TOMMY_WAR_CHEST: { name: "Tommy's War Chest", shortName: 'War Chest', category: 'FAVOR', rarity: 'LEGENDARY', file: 'favor-tommy-war-chest.svg', cells: ONE },
  WHEELS_OPEN_ROAD: { name: 'Open Road', shortName: 'Open Road', category: 'FAVOR', rarity: 'LEGENDARY', file: 'favor-wheels-open-road.svg', cells: ONE },
  VIC_CLEAN_SLATE_FAVOR: { name: 'Clean Slate', shortName: 'Clean Slate', category: 'FAVOR', rarity: 'LEGENDARY', file: 'favor-vic-clean-slate.svg', cells: ONE },
  BLOCKS_STAND_DOWN: { name: 'Stand Down', shortName: 'Stand Down', category: 'FAVOR', rarity: 'LEGENDARY', file: 'favor-blocks-stand-down.svg', cells: ONE },

  // Rewards that are not store items
  CASH: { name: 'Cash', shortName: 'Cash', category: 'CURRENCY', rarity: 'UNCOMMON', file: 'cash.svg', cells: ONE },
  TURNS: { name: 'Turns', shortName: 'Turns', category: 'CURRENCY', rarity: 'UNCOMMON', file: 'turns.svg', cells: ONE },

  // Street Pass Season 1 cosmetics, keyed by cosmetic key
  'street-pass-s1-fresh-face': { name: 'Fresh Face · Season 1', shortName: 'Fresh Face', category: 'COSMETIC', rarity: 'RARE', file: 'street-pass-s1-fresh-face.svg', cells: ONE },
  'street-pass-s1-made-man': { name: 'Made Man · Season 1', shortName: 'Made Man', category: 'COSMETIC', rarity: 'EPIC', file: 'street-pass-s1-made-man.svg', cells: ONE },
  'street-pass-s1-kingpin': { name: 'Kingpin · Season 1', shortName: 'Kingpin', category: 'COSMETIC', rarity: 'LEGENDARY', file: 'street-pass-s1-kingpin.svg', cells: ONE },
  'street-pass-s1-badge': { name: 'Street Pass · Season 1', shortName: 'S1 Badge', category: 'COSMETIC', rarity: 'LEGENDARY', file: 'street-pass-s1-badge.svg', cells: ONE },
  'street-pass-s1-frame': { name: 'Season 1 Frame', shortName: 'S1 Frame', category: 'COSMETIC', rarity: 'LEGENDARY', file: 'street-pass-s1-frame.svg', cells: ONE },

  // Contact reputation gained or lost on a job
  REP: { name: 'Reputation', shortName: 'RP+', category: 'REPUTATION', rarity: 'RARE', file: 'rep.svg', cells: ONE },
  REP_LOSS: { name: 'Reputation lost', shortName: 'RP−', category: 'REPUTATION', rarity: 'COMMON', file: 'rep-loss.svg', cells: ONE },
} as const satisfies Record<string, ItemArt>;

export type ItemArtKey = keyof typeof ITEM_ART;

/** Public URL of an item's picture. */
export function itemArtUrl(key: ItemArtKey): string {
  return `/items/${ITEM_ART[key].file}`;
}

export function hasItemArt(key: string): key is ItemArtKey {
  return Object.hasOwn(ITEM_ART, key);
}

/** Job `ITEM` rewards name the player column they add to, not the item. */
const REWARD_FIELD_ART: Readonly<Record<string, ItemArtKey>> = {
  condoms: 'CONDOM',
  medicine: 'MEDICINE',
  beer: 'BEER',
  crack: 'CRACK',
  pistols: 'PISTOL',
  shotguns: 'SHOTGUN',
  tek9s: 'TEK9',
  ak47s: 'AK47',
  lowRiders: 'LOW_RIDER',
  thugs: 'THUG',
  whores: 'HOE',
};

/**
 * The picture for a job or pass reward, or null for rewards with no picture
 * (unlocks, and cosmetics without art such as the job finale titles).
 */
export function rewardArtKey(reward: { kind: string; key: string | null; amount?: number | null }): ItemArtKey | null {
  switch (reward.kind) {
    case 'CASH':
      return 'CASH';
    case 'TURNS':
      return 'TURNS';
    case 'ITEM':
      if (!reward.key) return null;
      if (Object.hasOwn(REWARD_FIELD_ART, reward.key)) return REWARD_FIELD_ART[reward.key] ?? null;
      return hasItemArt(reward.key) ? reward.key : null;
    case 'FAVOR_ITEM':
    case 'PRODUCT':
    case 'COSMETIC_UNLOCK':
      return reward.key && hasItemArt(reward.key) ? reward.key : null;
    case 'CONTACT_REP':
      return (reward.amount ?? 0) < 0 ? 'REP_LOSS' : 'REP';
    default:
      return null;
  }
}
