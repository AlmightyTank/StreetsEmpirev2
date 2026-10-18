import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

// Deliberately kept server-side. These are the terms that must never enter game
// communication; the optional provider is only a monitoring aid, not the gate.
const SEVERE_TERMS = [
  'nigger', 'nigga', 'coon', 'chink', 'spic', 'wetback', 'kike', 'gook',
  'faggot', 'fag', 'dyke', 'tranny', 'retard',
];
const ORDINARY_TERMS = [
  ...SEVERE_TERMS,
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'piss', 'cunt',
];

function normalized(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\u0000-\u001f]/g, ' ');
}

function termPattern(term: string, global = false): RegExp {
  return new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`, global ? 'gi' : 'i');
}

const severePatterns = SEVERE_TERMS.map((term) => termPattern(term));

function maskTerms(value: string, terms: string[]): string {
  let result = value;
  for (const term of terms) {
    result = result.replace(termPattern(term, true), (match, prefix: string) => `${prefix}${'*'.repeat(term.length)}`);
  }
  return result;
}

export function containsSevereSlur(value: string): boolean {
  const text = normalized(value);
  return severePatterns.some((pattern) => pattern.test(text));
}

export function maskOrdinaryProfanity(value: string): string {
  return maskTerms(value, ORDINARY_TERMS);
}

/** Severe terms stay masked even when a player opts into ordinary profanity. */
export function maskSevereSlurs(value: string): string {
  return maskTerms(value, SEVERE_TERMS);
}

export function assertCommunicationContent(subject: string, body: string): void {
  if (containsSevereSlur(subject) || containsSevereSlur(body)) {
    throw AppError.badRequest('MESSAGE_CONTENT_BLOCKED', 'That message contains language that cannot be sent.');
  }
}

/** Fire-and-forget provider telemetry. Never logs or returns message content. */
export function monitorCommunicationContent(subject: string, body: string): void {
  if (!env.PROFANITY_MODERATION_API_KEY || !env.PROFANITY_MODERATION_URL) return;
  void fetch(env.PROFANITY_MODERATION_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.PROFANITY_MODERATION_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: `${subject}\n${body}` }),
    signal: AbortSignal.timeout(env.PROFANITY_MODERATION_TIMEOUT_MS),
  }).catch(() => undefined);
}
