/**
 * The rules every player accepts before they play. Changing what they agree to means
 * bumping RULES_VERSION: everyone is asked to accept again on their next visit.
 */
export const RULES_VERSION = '2026-09-27';

export const RULES_AGREEMENT: ReadonlyArray<{ title: string; body: string }> = [
  { title: 'One player, one account', body: 'Play with one account. Accounts that are shared, or several accounts one person uses to help themselves (feeding cash, goods or turf between them, or attacking your own accounts), are not allowed.' },
  { title: 'No cheating', body: 'No bots, scripts or automated requests playing for you, and no using bugs to get ahead. Found a bug that gives you something you should not have? Report it instead of using it.' },
  { title: 'Be decent', body: 'Rivalry is the game; harassment is not. No threats, hate, sexual content involving minors, doxxing or spam in messages, alliance wires, names or profiles.' },
  { title: 'Staff decisions', body: 'Staff can warn, mute, suspend or ban accounts, rename offensive names, and void fights or correct what cheating or a bug produced. Every action has a recorded reason.' },
  { title: 'Seasons reset', body: 'Cash, crew and turf end with the season; the next one starts fresh. Final standings and the Hall of Fame are permanent. Nothing in the game has real-world value.' },
];
