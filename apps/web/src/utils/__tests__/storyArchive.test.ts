import { describe, expect, it } from 'vitest';
import type { PlayerQuestDto } from '@streets/shared';
import { buildStoryArchive } from '../storyArchive.js';

function quest(key: string, status: PlayerQuestDto['status'], extra: Partial<PlayerQuestDto> = {}): PlayerQuestDto {
  return {
    key, title: key, status, chosenBranch: null, branchChoices: [], contactName: 'Mama King',
    story: { chapter: key.startsWith('ML_S') ? 'Side · Pip' : 'Act I · A Name in the Rain', speaker: 'Mama King', intro: '', inProgress: '', ready: '', completed: `${key} closed.`, actionHint: '' },
    ...extra,
  } as PlayerQuestDto;
}

describe('buildStoryArchive', () => {
  it('lists reached chapters, main story first, with answers and choices, and hides locked ones', () => {
    const answered = quest('ML_M01_NIGHT_RECEIPT', 'COMPLETED', {
      story: {
        chapter: 'Act I · A Name in the Rain', speaker: 'Mama King', intro: '', inProgress: '', ready: '', completed: 'Kept.', actionHint: '',
        scenes: [{ key: 'night_receipt_handled', title: 'The receipt', prose: '', responses: [], available: true, response: { key: 'examine_line', label: 'Look at the line.', outcome: 'You look.' } }],
      },
    });
    const archive = buildStoryArchive(
      [answered],
      [quest('ML_S01_PIP', 'ACTIVE'), quest('ML_M01_NIGHT_RECEIPT', 'ACTIVE'), quest('ML_M02_SMALL_FAVOR', 'AVAILABLE'), quest('ML_M03_OTHER_DOOR', 'LOCKED'), quest('DAILY_X', 'ACTIVE')],
    );
    expect(archive.sections.map((section) => [section.arc, section.chapter, section.entries.map((entry) => entry.key)])).toEqual([
      ['MAIN', 'Act I · A Name in the Rain', ['ML_M01_NIGHT_RECEIPT', 'ML_M02_SMALL_FAVOR']],
      ['SIDE', 'Side · Pip', ['ML_S01_PIP']],
    ]);
    expect(archive.sections[0]!.entries[0]).toMatchObject({ status: 'COMPLETED', closing: 'Kept.', answers: [{ scene: 'The receipt', label: 'Look at the line.' }] });
    expect(archive.sections[0]!.entries[1]!.closing).toBeNull();
    expect(archive).toMatchObject({ completed: 1, total: 4, ending: null });
  });

  it('names the ending once the finale is turned in', () => {
    const finale = quest('ML_M25_MISSING_LINE', 'COMPLETED', {
      chosenBranch: 'BURN_BOOK',
      branchChoices: [{ key: 'OPEN_BOOK', title: 'Open the book' }, { key: 'BURN_BOOK', title: 'Burn the book' }] as PlayerQuestDto['branchChoices'],
    });
    const archive = buildStoryArchive([finale]);
    expect(archive.ending).toEqual({ key: 'BURN_BOOK', title: 'Burn the book', closing: 'ML_M25_MISSING_LINE closed.' });
    expect(archive.sections[0]!.entries[0]!.choice).toBe('Burn the book');
  });
});
