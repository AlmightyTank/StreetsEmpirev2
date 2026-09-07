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
