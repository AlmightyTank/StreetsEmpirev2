/**
 * Section 52. One id per submission attempt.
 *
 * A retry of the same submission reuses its id, so a dropped response or a
 * double click replays the original result instead of spending turns twice.
 */
export function newActionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
