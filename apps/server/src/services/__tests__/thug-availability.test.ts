import { describe, expect, it } from 'vitest';
import { fitThugs } from '../action.service.js';

describe('fitThugs', () => {
  it('keeps dealer-assigned thugs in the owned crew but out of the available pool', () => {
    expect(fitThugs({
      thugs: 20,
      woundedThugs: 2,
      busyThugs: 1,
      postedThugs: 3,
      businessThugs: 4,
      dealerThugs: 5,
    })).toBe(5);
  });

  it('supports older callers that do not supply an assignment count', () => {
    expect(fitThugs({ thugs: 10, woundedThugs: 1 })).toBe(9);
  });
});
