import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/** 0.1.0-H. Cheap production-safe defaults for every API response. */
const securityPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Cache-Control', 'no-store');
    return payload;
  });
};

export default fp(securityPlugin, { name: 'security' });
