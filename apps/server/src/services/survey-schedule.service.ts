import type { Prisma } from '@prisma/client';

type SurveyDb = {
  survey: {
    updateMany(args: Prisma.SurveyUpdateManyArgs): Promise<Prisma.BatchPayload>;
  };
};

/**
 * Settle survey lifecycle by wall clock. Closing runs first so a survey whose
 * start/end are both in the past never flashes LIVE.
 */
export async function settleSurveySchedules(db: SurveyDb, now = new Date()): Promise<{ opened: number; closed: number }> {
  const closed = await db.survey.updateMany({
    where: {
      status: { in: ['SCHEDULED', 'LIVE'] },
      endsAt: { lte: now },
    },
    data: { status: 'CLOSED', closedAt: now },
  });

  const opened = await db.survey.updateMany({
    where: {
      status: 'SCHEDULED',
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    data: { status: 'LIVE', publishedAt: now },
  });

  return { opened: opened.count, closed: closed.count };
}
