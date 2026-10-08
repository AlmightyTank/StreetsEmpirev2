import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Choices a player makes on a page (the block they work, the product they cook, the
 * store basket, the raid squad) come back the next time they open it. Stored per
 * browser in localStorage and keyed by player, so two accounts or two rounds on one
 * machine never share a choice. Storage can be blocked or wiped at any time, so every
 * read and write is guarded and the page simply starts from its default without it.
 */

const PREFIX = 'streets.remember.v1.';

interface Stored<T> {
  value: T;
  at: number;
}

export interface RememberOptions<T> {
  /** Reject a stored value that no longer fits (wrong type, a block that is gone). */
  accept?: (value: unknown) => value is T;
  /** Forget a stored value older than this, e.g. a half-built basket. */
  maxAgeMs?: number;
}

export function rememberedKey(name: string, playerId: string | null | undefined): string | null {
  return playerId ? `${name}:${playerId}` : null;
}

export function readRemembered<T>(key: string | null, options: RememberOptions<T> = {}, now = Date.now()): { found: true; value: T } | { found: false } {
  if (!key) return { found: false };
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return { found: false };
    const parsed = JSON.parse(raw) as Partial<Stored<unknown>>;
    if (!parsed || typeof parsed !== 'object' || !('value' in parsed)) return { found: false };
    if (options.maxAgeMs !== undefined && (typeof parsed.at !== 'number' || now - parsed.at > options.maxAgeMs)) return { found: false };
    if (options.accept && !options.accept(parsed.value)) return { found: false };
    return { found: true, value: parsed.value as T };
  } catch {
    return { found: false };
  }
}

export function writeRemembered<T>(key: string | null, value: T, now = Date.now()): void {
  if (!key) return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify({ value, at: now } satisfies Stored<T>));
  } catch {
    // Full or blocked storage: the choice just is not remembered.
  }
}

export function forgetRemembered(key: string | null): void {
  if (!key) return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing to do.
  }
}

/**
 * `useState` that remembers. Pass `null` as the key until the player is known; once the
 * key arrives, a stored choice replaces the default, and every later change is saved.
 */
export function useRememberedState<T>(key: string | null, initial: T | (() => T), options: RememberOptions<T> = {}): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const stored = readRemembered(key, options);
    if (stored.found) return stored.value;
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  const loadedKey = useRef(key);

  useEffect(() => {
    if (key !== loadedKey.current) {
      loadedKey.current = key;
      const stored = readRemembered(key, options);
      if (stored.found) {
        // Picked up after the first render (the session loaded late); saved on the next pass.
        setValue(stored.value);
        return;
      }
    }
    writeRemembered(key, value);
    // `options` is read only when the key changes; callers pass it inline.
  }, [key, value]);

  return [value, setValue];
}

export const isString = (value: unknown): value is string => typeof value === 'string';
export const isTurns = (value: unknown): value is number | '' => value === '' || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
