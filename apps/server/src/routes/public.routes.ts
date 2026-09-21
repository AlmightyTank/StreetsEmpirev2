import type { FastifyPluginAsync } from 'fastify';
import { PublicSiteService } from '../services/public-site.service.js';
import { PublicDirectoryService } from '../services/public-directory.service.js';
import { AppError } from '../utils/errors.js';

const PUBLIC_CACHE = 'public, max-age=30, stale-while-revalidate=60';
const ARCHIVE_CACHE = 'public, max-age=300, stale-while-revalidate=600';

const publicRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/overview', async (_request, reply) => {
    reply.header('Cache-Control', PUBLIC_CACHE);
    return PublicSiteService.overview(fastify.prisma);
  });

  fastify.get('/current-game', async (_request, reply) => {
    reply.header('Cache-Control', PUBLIC_CACHE);
    return {
      currentGame: await PublicSiteService.currentGame(fastify.prisma),
    };
  });

  fastify.get('/games', async (_request, reply) => {
    reply.header('Cache-Control', PUBLIC_CACHE);
    return PublicSiteService.games(fastify.prisma);
  });

  fastify.get('/games/:gameId', async (request, reply) => {
    const { gameId } = request.params as { gameId: string };
    const game = await PublicSiteService.completedGame(fastify.prisma, gameId);
    if (!game) {
      throw AppError.notFound('GAME_NOT_FOUND', 'That completed game is not in the archive.');
    }

    reply.header('Cache-Control', ARCHIVE_CACHE);
    return { game };
  });

  fastify.get('/rankings', async (request, reply) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 100;
    reply.header('Cache-Control', PUBLIC_CACHE);
    return PublicDirectoryService.rankings(fastify.prisma, Number.isFinite(parsedLimit) ? parsedLimit : 100);
  });

  fastify.get('/players/:publicPimpId', async (request, reply) => {
    const { publicPimpId } = request.params as { publicPimpId: string };
    const id = Number.parseInt(publicPimpId, 10);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw AppError.badRequest('INVALID_PLAYER_ID', 'That player id is not valid.');
    }
    const player = await PublicDirectoryService.player(fastify.prisma, id);
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in the current game.');
    reply.header('Cache-Control', PUBLIC_CACHE);
    return { player };
  });

  fastify.get('/alliances', async (_request, reply) => {
    reply.header('Cache-Control', PUBLIC_CACHE);
    return PublicDirectoryService.alliances(fastify.prisma);
  });

  fastify.get('/alliances/:tag', async (request, reply) => {
    const { tag } = request.params as { tag: string };
    const alliance = await PublicDirectoryService.alliance(fastify.prisma, tag);
    if (!alliance) throw AppError.notFound('ALLIANCE_NOT_FOUND', 'That alliance is not in the current game.');
    reply.header('Cache-Control', PUBLIC_CACHE);
    return { alliance };
  });

  fastify.get('/cities', async (_request, reply) => {
    reply.header('Cache-Control', PUBLIC_CACHE);
    return PublicDirectoryService.cities(fastify.prisma);
  });

  fastify.get('/cities/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const city = await PublicDirectoryService.city(fastify.prisma, slug);
    if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That city is not in the current game.');
    reply.header('Cache-Control', PUBLIC_CACHE);
    return { city };
  });

  fastify.get('/turf', async (_request, reply) => {
    reply.header('Cache-Control', PUBLIC_CACHE);
    return PublicDirectoryService.turf(fastify.prisma);
  });

  fastify.get('/hall-of-fame', async (_request, reply) => {
    reply.header('Cache-Control', ARCHIVE_CACHE);
    return PublicDirectoryService.hallOfFame(fastify.prisma);
  });

  fastify.get('/stats', async (_request, reply) => {
    reply.header('Cache-Control', PUBLIC_CACHE);
    return PublicDirectoryService.stats(fastify.prisma);
  });

  fastify.get('/news', async (request, reply) => {
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 50;
    reply.header('Cache-Control', PUBLIC_CACHE);
    return PublicDirectoryService.news(fastify.prisma, Number.isFinite(parsedLimit) ? parsedLimit : 50);
  });

  fastify.get('/news/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const article = await PublicDirectoryService.newsArticle(fastify.prisma, id);
    if (!article) throw AppError.notFound('NEWS_NOT_FOUND', 'That news post is not available.');
    reply.header('Cache-Control', ARCHIVE_CACHE);
    return { article };
  });

  fastify.get('/search', async (request, reply) => {
    const { q = '' } = request.query as { q?: string };
    reply.header('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    return PublicDirectoryService.search(fastify.prisma, q);
  });

  fastify.get('/status', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return PublicDirectoryService.status(fastify.prisma);
  });

};

export default publicRoutes;
