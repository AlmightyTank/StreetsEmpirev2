import type { Ruleset } from '@streets/rulesets';

export function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** True when the ruleset deals its daily and weekly boards from a per-round deck. */
export function usesRoundDeck(ruleset: Ruleset): boolean {
  return ruleset.contractRotation?.perRoundDeck === true;
}

function shuffled(keys: readonly string[], seed: string, cycle: number): string[] {
  const salt = cycle < 0 ? 'split' : `deck:${cycle}`;
  return keys
    .map((key) => ({ key, order: hash32(`${seed}:${salt}:${key}`) }))
    .sort((left, right) => left.order - right.order || left.key.localeCompare(right.key))
    .map((entry) => entry.key);
}

/**
 * Reorder cards inside [from, to) so each board of `slots` cards holds different
 * groups where it can. Swaps stay inside the range, so every card is still dealt
 * exactly once.
 */
function spreadGroups(
  cards: string[],
  from: number,
  to: number,
  slots: number,
  groupOf: (key: string) => string,
): void {
  for (let position = from; position < to; position += 1) {
    const boardStart = position - (position % slots);
    const taken = new Set(cards.slice(Math.max(from, boardStart), position).map(groupOf));
    if (!taken.has(groupOf(cards[position]!))) continue;
    for (let later = position + 1; later < to; later += 1) {
      if (taken.has(groupOf(cards[later]!))) continue;
      [cards[position], cards[later]] = [cards[later]!, cards[position]!];
      break;
    }
  }
}

/**
 * One cycle's deck. The pool is split once per round into a front half and a back
 * half; each cycle shuffles both halves and deals the front half first. A card in
 * the front half never comes back until the back half has been dealt, and the other
 * way round, so a contract never repeats within about half the pool.
 */
function deck(
  pool: readonly string[],
  seed: string,
  cycle: number,
  slots: number,
  groupOf?: (key: string) => string,
): string[] {
  const front = new Set(shuffled(pool, seed, -1).slice(0, Math.ceil(pool.length / 2)));
  const order = shuffled(pool, seed, cycle);
  const cards = [...order.filter((key) => front.has(key)), ...order.filter((key) => !front.has(key))];
  if (groupOf) {
    spreadGroups(cards, 0, front.size, slots, groupOf);
    spreadGroups(cards, front.size, cards.length, slots, groupOf);
  }
  return cards;
}

/**
 * 1.4.0-A2 deck rotation. Board N deals cards N*slots onward from the round's decks,
 * so every card is dealt once per cycle and a new round gets a different order. Pass
 * groupOf to keep each board's cards in different groups where the pool allows. The
 * result runs on into the next cycle, so a board straddling two cycles still fills.
 */
export function deckOrder(
  keys: readonly string[],
  seed: string,
  boardIndex: number,
  slots: number,
  groupOf?: (key: string) => string,
): string[] {
  const pool = [...new Set(keys)].sort();
  if (pool.length === 0) return [];
  const start = boardIndex * slots;
  const cycle = Math.floor(start / pool.length);
  const offset = start - cycle * pool.length;
  const ordered: string[] = [];
  for (const key of [
    ...deck(pool, seed, cycle, slots, groupOf).slice(offset),
    ...deck(pool, seed, cycle + 1, slots, groupOf),
  ]) {
    if (!ordered.includes(key)) ordered.push(key);
  }
  return ordered;
}

export function roundDeckSeed(ruleset: Ruleset, roundId: string): string {
  return `${ruleset.meta.id}:${ruleset.meta.version}:round:${roundId}`;
}
