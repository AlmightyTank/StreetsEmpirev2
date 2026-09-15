/** Admin screens care about the time of day, not just the date. */
export function adminWhen(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** datetime-local inputs hold local time with no zone; the API takes ISO timestamps. */
export function localInputToIso(local: string): string | undefined {
  if (!local) return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** The value a datetime-local input needs to show an ISO timestamp in local time. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function snapshotJson(value: unknown): string {
  return value === null || value === undefined ? 'nothing' : JSON.stringify(value, null, 2);
}
