import { Prisma } from '@prisma/client';
import type { FastifyError, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import {
  RulesetNotFoundError,
  RulesetVersionMismatchError,
} from '@streets/rules-engine';
import { AppError } from '../utils/errors.js';

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

  fastify.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof AppError) {
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
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our end. Try that again.',
      },
    });
  });
};

export default fp(errorHandlerPlugin, { name: 'error-handler' });
