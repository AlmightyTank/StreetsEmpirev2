import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { SurveyService } from '../services/survey.service.js';
import { parseBody } from '../utils/validate.js';

const surveyParamsSchema = z.object({
  surveyId: z.string().trim().min(1, 'Invalid survey.').max(64, 'Invalid survey.'),
}).strict();

/** Phase B: read-only player survey board and survey detail. */
const surveyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get('/surveys', async (request) =>
    SurveyService.page(app.prisma, request.auth!.account.id));

  app.get('/surveys/:surveyId', async (request) => {
    const { surveyId } = parseBody(surveyParamsSchema, request.params);
    return SurveyService.detail(app.prisma, request.auth!.account.id, surveyId);
  });
};

export default surveyRoutes;
