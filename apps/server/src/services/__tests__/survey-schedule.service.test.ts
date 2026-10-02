import { describe, expect, it, vi } from 'vitest';
import { settleSurveySchedules } from '../survey-schedule.service.js';

describe('Survey Phase E schedule settlement', () => {
  it('closes expired surveys before opening due scheduled surveys', async () => {
    const updateMany = vi.fn()
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    const db = { survey: { updateMany } } as never;
    const now = new Date('2026-10-04T12:00:00.000Z');

    await expect(settleSurveySchedules(db, now)).resolves.toEqual({ closed: 2, opened: 1 });
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[0]![0]).toMatchObject({
      where: { status: { in: ['SCHEDULED', 'LIVE'] }, endsAt: { lte: now } },
      data: { status: 'CLOSED', closedAt: now },
    });
    expect(updateMany.mock.calls[1]![0]).toMatchObject({
      where: { status: 'SCHEDULED', startsAt: { lte: now } },
      data: { status: 'LIVE', publishedAt: now },
    });
  });
});
