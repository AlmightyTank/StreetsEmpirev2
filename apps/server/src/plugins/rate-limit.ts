import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import {
  FixedWindowRateLimiter,
  rateLimitPolicyFor,
} from '../services/rate-limit.service.js';

/**
 * 0.1.0-F. Per-process abuse protection.
 *
 * Auth attempts are keyed by IP. Once signed in, normal game traffic is keyed
 * by account so a household on one address does not punish every player in it.
 */
const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  const limiter = new FixedWindowRateLimiter();

  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?', 1)[0] ?? request.url;
    const policy = rateLimitPolicyFor(request.method, path);
    if (!policy) return;

    const identity = request.auth
      ? `account:${request.auth.account.id}`
      : `ip:${request.ip}`;
    const decision = limiter.hit(identity, policy);

    reply.header('RateLimit-Limit', String(decision.limit));
    reply.header('RateLimit-Remaining', String(decision.remaining));
    reply.header('RateLimit-Reset', String(decision.retryAfterSeconds));

    if (decision.allowed) return;

    reply.header('Retry-After', String(decision.retryAfterSeconds));
    request.log.warn(
      { bucket: policy.name, accountId: request.auth?.account.id ?? null },
      'rate limit exceeded',
    );

    return reply.status(429).send({
      error: {
        code: 'RATE_LIMITED',
        message: `Too many requests. Try again in ${decision.retryAfterSeconds} seconds.`,
      },
    });
  });
};

export default fp(rateLimitPlugin, { name: 'rate-limit', dependencies: ['auth'] });
