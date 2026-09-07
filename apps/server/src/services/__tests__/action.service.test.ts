import { describe, expect, it } from 'vitest';
import { assertTurns } from '../action.service.js';
import { AppError } from '../../utils/errors.js';

describe('assertTurns', () => {
  it('allows spending what you have', () => {
    expect(() => assertTurns(18, 18)).not.toThrow();
    expect(() => assertTurns(18, 1)).not.toThrow();
  });

  // Section 50: the message is the example from the spec, not "400 Bad Request".
  it('names both numbers when there are not enough', () => {
    try {
      assertTurns(18, 25);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const app = error as AppError;
      expect(app.statusCode).toBe(400);
      expect(app.code).toBe('NOT_ENOUGH_TURNS');
      expect(app.message).toBe(
        'You tried to spend 25 Turns, but only 18 are available.',
      );
      expect(app.fields).toEqual({ turns: 'Only 18 available.' });
    }
  });

  it('reads correctly in the singular', () => {
    try {
      assertTurns(1, 2);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as AppError).message).toBe(
        'You tried to spend 2 Turns, but only 1 is available.',
      );
    }
  });

  it('refuses to spend a single turn you do not have', () => {
    try {
      assertTurns(0, 1);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as AppError).message).toBe(
        'You tried to spend 1 Turn, but only 0 are available.',
      );
    }
  });
});
