import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import {
  FixedWindowRateLimiter,
  rateLimitPolicyFor,
} from '../services/rate-limit.service.js';
import { apiAbuse } from '../services/api-abuse.service.js';
import { ExploitFlagService } from '../services/exploit-flag.service.js';
import { matchKey } from '../services/admin-signals.service.js';

/** Refusals in a day before a subject is flagged for review. */
export const API_ABUSE_FLAG_AT = 30;

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
    // 1.0.0-C: remembered for Admin Signals, so repeated refusals show up as a pattern.
    const refused = apiAbuse.record({ accountId: request.auth?.account.id ?? null, ip: request.ip }, policy.name);
    // 1.0.0-E: past a day's worth of normal impatience, it goes to the review queue.
    if (refused === API_ABUSE_FLAG_AT) {
      void ExploitFlagService.record(fastify.prisma, {
        kind: 'API_ABUSE', severity: 'warning', accountId: request.auth?.account.id ?? null,
        // Signed out, each network is its own flag, by an opaque key rather than the address.
        route: request.auth ? policy.name : `${policy.name} · network ${matchKey('network', request.ip)}`,
        message: `${refused} requests refused by the ${policy.name} rate limit within a day.`,
        detail: { bucket: policy.name, refused, signedIn: Boolean(request.auth) },
      });
    }
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
