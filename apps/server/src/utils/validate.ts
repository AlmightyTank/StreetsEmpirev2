import type { z } from 'zod';
import { AppError } from './errors.js';

/**
 * Parse a request body with a shared Zod schema and turn any failure into a
 * player-facing error with per-field messages the form can render inline.
 */
export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
): z.infer<T> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }

  const first = Object.values(fields)[0] ?? 'That request was not valid.';

  throw AppError.badRequest('VALIDATION_FAILED', first, fields);
}
