import type { FastifyPluginAsync } from 'fastify';
import type { GameNewsDto } from '@streets/shared';
import { RoundService } from '../services/round.service.js';

const roundInfoRoutes: FastifyPluginAsync = async (fastify) => {
  /** 0.1.0-E: global announcements plus posts for the current round. */
  fastify.get('/current/news', async () => {
    const round = await RoundService.getCurrent(fastify.prisma);
    if (!round) return { news: [] as GameNewsDto[] };

    const rows = await fastify.prisma.gameNews.findMany({
      where: {
        publishedAt: { lte: new Date() },
        OR: [{ roundId: null }, { roundId: round.id }],
      },
      include: { createdBy: { select: { username: true } } },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
      take: 50,
    });

    const news: GameNewsDto[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      isPinned: row.isPinned,
      publishedAt: row.publishedAt.toISOString(),
      authorName: row.createdBy?.username ?? null,
    }));

    return { news };
  });
};

export default roundInfoRoutes;
