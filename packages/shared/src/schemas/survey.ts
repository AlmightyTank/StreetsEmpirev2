import { z } from 'zod';
import { actionIdSchema } from './game.js';

export const SURVEY_MAX_ANSWERS = 100;
export const SURVEY_MAX_TEXT_LENGTH = 5_000;
export const SURVEY_MAX_MULTI_SELECTIONS = 25;

export const surveyAnswerValueSchema = z.union([
  z.boolean(),
  z.string().max(SURVEY_MAX_TEXT_LENGTH, 'That answer is too long.'),
  z.number().int('Ratings must be whole numbers.').min(1).max(10),
  z.array(z.string().min(1).max(120))
    .max(SURVEY_MAX_MULTI_SELECTIONS, 'Too many choices selected.')
    .refine((values) => new Set(values).size === values.length, 'Choose each option only once.'),
]);

export const surveyAnswerSchema = z.object({
  questionId: z.string().trim().min(1, 'Invalid survey question.').max(64, 'Invalid survey question.'),
  value: surveyAnswerValueSchema,
}).strict();

/**
 * Shape-only submission validation. SurveyService owns question-aware checks:
 * required answers, option membership, rating bounds and per-question text
 * limits. Reward eligibility depends only on completing those validation rules,
 * never on the opinion expressed.
 */
export const surveySubmitSchema = z.object({
  actionId: actionIdSchema,
  answers: z.array(surveyAnswerSchema)
    .max(SURVEY_MAX_ANSWERS, 'That survey has too many answers.'),
}).strict().superRefine((input, ctx) => {
  const seen = new Set<string>();
  input.answers.forEach((answer, index) => {
    if (seen.has(answer.questionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answers', index, 'questionId'],
        message: 'Answer each question only once.',
      });
    }
    seen.add(answer.questionId);
  });
});

export type SurveySubmitInput = z.infer<typeof surveySubmitSchema>;
