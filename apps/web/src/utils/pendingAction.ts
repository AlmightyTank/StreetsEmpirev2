const PENDING_TTL_MS = 8 * 60_000;
const PREFIX = 'se.pending-action.';

export interface PendingAction<T> {
  actionId: string;
  payload: T;
  savedAt: number;
  expiresAt: number;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function browserSessionStorage(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function savePendingAction<T>(
  storage: StorageLike | null,
  key: string,
  actionId: string,
  payload: T,
  now = Date.now(),
): void {
  if (!storage) return;

  const pending: PendingAction<T> = {
    actionId,
    payload,
    savedAt: now,
    // Shorter than the server's 10-minute replay record. We never offer a
    // replay after the server may have forgotten whether the action ran.
    expiresAt: now + PENDING_TTL_MS,
  };

  try {
    storage.setItem(`${PREFIX}${key}`, JSON.stringify(pending));
  } catch {
    // Storage can be disabled. In-memory retry still works for this page load.
  }
}

export function loadPendingAction<T>(
  storage: StorageLike | null,
  key: string,
  now = Date.now(),
): PendingAction<T> | null {
  if (!storage) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(`${PREFIX}${key}`);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<PendingAction<T>>;
    if (
      typeof value.actionId !== 'string' ||
      value.actionId.length < 8 ||
      typeof value.savedAt !== 'number' ||
      typeof value.expiresAt !== 'number' ||
      value.payload === undefined ||
      value.expiresAt <= now
    ) {
      clearPendingAction(storage, key);
      return null;
    }

    return value as PendingAction<T>;
  } catch {
    clearPendingAction(storage, key);
    return null;
  }
}

export function clearPendingAction(storage: StorageLike | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(`${PREFIX}${key}`);
  } catch {
    // Nothing useful to do if storage disappeared mid-session.
  }
}
