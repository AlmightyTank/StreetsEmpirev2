import { Prisma } from '@prisma/client';
import type { FastifyError, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import {
  RulesetNotFoundError,
  RulesetVersionMismatchError,
} from '@streets/rules-engine';
import { AppError } from '../utils/errors.js';
import { ExploitFlagService, type ExploitFlagInput } from '../services/exploit-flag.service.js';
import { areaOf, metrics } from '../services/metrics.service.js';
import { annotateLogContext } from '../utils/request-context.js';

/**
 * 1.0.0-C. Database refusals that mean "the state moved under this request".
 * A CHECK violation is a guard the services should have caught first, so it is
 * logged as an error; a lock conflict or deadlock is ordinary contention.
 */
export function databaseRefusal(error: unknown): { kind: 'check'; constraint: string | null } | { kind: 'contention' } | null {
  const text = error instanceof Error ? error.message : '';
  const meta = (error as { meta?: { code?: unknown } } | null)?.meta;
  const code = typeof meta?.code === 'string' ? meta.code : null;
  if (code === '23514' || /violates check constraint|code: "23514"/.test(text)) {
    return { kind: 'check', constraint: /check constraint \\?"([A-Za-z0-9_]+)\\?"/.exec(text)?.[1] ?? null };
  }
  const prismaCode = (error as { code?: unknown } | null)?.code;
  if (prismaCode === 'P2034' || code === '40001' || code === '40P01' || /code: "(40001|40P01)"/.test(text)) return { kind: 'contention' };
  return null;
}

export interface ErrorOutcome {
  statusCode: number;
  code: string;
  /** validation | auth | not_found | conflict | rate_limit | state_guard | contention | ruleset | invariant | internal | client */
  category: string;
}

/** The answer an error gets, decided the same way the handler below answers it. */
export function classifyError(error: unknown): ErrorOutcome {
  if (error instanceof AppError) {
    const category = error.statusCode === 401 || error.statusCode === 403 ? 'auth'
      : error.statusCode === 404 ? 'not_found'
        : error.statusCode === 429 ? 'rate_limit'
          : error.statusCode === 400 ? 'validation'
            : error.statusCode >= 500 ? 'internal' : 'conflict';
    return { statusCode: error.statusCode, code: error.code, category };
  }
  if (error instanceof ZodError) return { statusCode: 400, code: 'VALIDATION_FAILED', category: 'validation' };
  if (error instanceof RulesetNotFoundError || error instanceof RulesetVersionMismatchError) return { statusCode: 500, code: 'RULESET_UNAVAILABLE', category: 'ruleset' };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { statusCode: 409, code: 'CONFLICT', category: 'conflict' };
  const refusal = databaseRefusal(error);
  if (refusal?.kind === 'check') return { statusCode: 409, code: 'STATE_CHANGED', category: 'state_guard' };
  if (refusal?.kind === 'contention') return { statusCode: 409, code: 'TRY_AGAIN', category: 'contention' };
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  if (typeof statusCode === 'number' && statusCode < 500) return { statusCode, code: String((error as { code?: unknown }).code ?? 'BAD_REQUEST'), category: statusCode === 429 ? 'rate_limit' : 'client' };
  if (error instanceof RangeError && error.message.startsWith('Player-state invariant failed')) return { statusCode: 500, code: 'INTERNAL_ERROR', category: 'invariant' };
  return { statusCode: 500, code: 'INTERNAL_ERROR', category: 'internal' };
}

/**
 * Section 50. Everything that reaches a player is explicit and readable.
 * Anything unexpected is logged in full and answered with one honest line.
 */
const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `No route for ${request.method} ${request.url}.` },
    });
  });

  // 1.0.0-E: refusals that look like an exploit or a bug are kept for admins to review.
  const flag = (request: FastifyRequest, input: Omit<ExploitFlagInput, 'accountId' | 'route'>) => {
    void ExploitFlagService.record(fastify.prisma, {
      ...input,
      accountId: request.auth?.account.id ?? null,
      route: `${request.method} ${request.routeOptions?.url ?? request.url.split('?')[0]}`,
    });
  };

  fastify.setErrorHandler<FastifyError>((error, request, reply) => {
    // 1.0.0-F: every failure is categorized once, on its log line and in the metrics.
    const outcome = classifyError(error);
    annotateLogContext({ errorCategory: outcome.category });
    metrics.recordFailure({ url: request.url, method: request.method, statusCode: outcome.statusCode, code: outcome.code, category: outcome.category });
    if (outcome.statusCode < 500 && (outcome.category === 'auth' || areaOf(request.url) === 'game') && request.method !== 'GET') {
      request.log.info({ code: outcome.code, statusCode: outcome.statusCode }, 'request refused');
    }
    if (error instanceof AppError) {
      if (error.code === 'LINKED_ACCOUNTS') {
        flag(request, { kind: 'LINKED_ATTACK', severity: 'warning', message: error.message });
      } else if (error.code === 'ACTION_ID_REUSED') {
        flag(request, { kind: 'ACTION_REPLAY', severity: 'info', message: error.message });
      }
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, fields: error.fields },
      });
    }

    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) {
        fields[issue.path.join('.') || '_'] ??= issue.message;
      }
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: Object.values(fields)[0] ?? 'That request was not valid.',
          fields,
        },
      });
    }

    if (
      error instanceof RulesetNotFoundError ||
      error instanceof RulesetVersionMismatchError
    ) {
      request.log.error({ err: error }, 'ruleset could not be loaded');
      return reply.status(500).send({
        error: {
          code: 'RULESET_UNAVAILABLE',
          message: 'This round is misconfigured and cannot be played right now.',
        },
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return reply.status(409).send({
        error: { code: 'CONFLICT', message: 'That is already taken.' },
      });
    }

    const refusal = databaseRefusal(error);
    if (refusal?.kind === 'check') {
      request.log.error({ err: error, constraint: refusal.constraint }, 'database guard refused a write');
      flag(request, { kind: 'STATE_GUARD', severity: 'critical', message: `The database refused a write${refusal.constraint ? ` (${refusal.constraint})` : ''}.`, detail: { constraint: refusal.constraint } });
      return reply.status(409).send({
        error: { code: 'STATE_CHANGED', message: 'That no longer adds up. Refresh and try again.' },
      });
    }
    if (refusal?.kind === 'contention') {
      request.log.warn({ err: error }, 'transaction contention');
      return reply.status(409).send({
        error: { code: 'TRY_AGAIN', message: 'Too much happening at once. Try that again.' },
      });
    }

    // Fastify's own routing and body-parsing errors. The framework message is
    // written for a developer, so it is logged rather than shown to a player.
    if (typeof error.statusCode === 'number' && error.statusCode < 500) {
      request.log.warn({ err: error }, 'request rejected');
      return reply.status(error.statusCode).send({
        error: {
          code: error.code ?? 'BAD_REQUEST',
          message: 'That request could not be understood. Try again.',
        },
      });
    }

    request.log.error({ err: error }, 'unhandled error');
    if (error instanceof RangeError && error.message.startsWith('Player-state invariant failed')) {
      flag(request, { kind: 'INVARIANT', severity: 'critical', message: error.message });
    }
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our end. Try that again.',
      },
    });
  });
};

export default fp(errorHandlerPlugin, { name: 'error-handler' });
