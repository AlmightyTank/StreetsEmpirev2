export type PlayerRef = { discordId: string } | { name: string };

/** "<@123…>" (what Discord inserts for an @mention in a text option) or a player name. */
export function parsePlayerRef(value: string): PlayerRef | null {
  const trimmed = value.trim();
  const mention = /^<@!?(\d{17,20})>$/.exec(trimmed);
  if (mention) return { discordId: mention[1]! };
  if (!trimmed || trimmed.length > 40) return null;
  return { name: trimmed };
}

export interface CityChoice {
  slug: string;
  name: string;
}

/** Autocomplete sends the slug; someone who types without picking sends a name. */
export function resolveCity(input: string, cities: CityChoice[]): CityChoice | null {
  const needle = input.trim().toLowerCase();
  return cities.find((city) => city.slug === needle) ?? cities.find((city) => city.name.toLowerCase() === needle) ?? null;
}

/** Name matches first, then names containing the text; Discord allows 25 choices. */
export function cityChoices(query: string, cities: CityChoice[], limit = 25): Array<{ name: string; value: string }> {
  const needle = query.trim().toLowerCase();
  const starts = cities.filter((city) => city.name.toLowerCase().startsWith(needle));
  const contains = cities.filter((city) => !starts.includes(city) && city.name.toLowerCase().includes(needle));
  return [...starts, ...contains].slice(0, limit).map((city) => ({ name: city.name, value: city.slug }));
}

export class Cooldowns {
  private readonly until = new Map<string, number>();

  constructor(private readonly ms: number, private readonly now: () => number = Date.now) {}

  /** Seconds left on the key's cooldown; 0 means allowed, and starts a new one. */
  take(key: string): number {
    const now = this.now();
    const until = this.until.get(key) ?? 0;
    if (until > now) return Math.ceil((until - now) / 1000);
    this.until.set(key, now + this.ms);
    if (this.until.size > 5_000) {
      for (const [entry, expires] of this.until) if (expires <= now) this.until.delete(entry);
    }
    return 0;
  }
}
