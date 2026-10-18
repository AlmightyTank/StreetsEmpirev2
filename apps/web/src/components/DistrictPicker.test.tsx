import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { DistrictDto } from '@streets/shared';
import { DistrictPicker } from './DistrictPicker.js';

const districts = [
  { key: 'MIDTOWN', name: 'Midtown Back Rooms', districtAccess: { unlocked: false, unlockName: 'Casino Access', unlockDescription: 'Win the back-room introduction.', unlockQuest: { key: 'CASINO_INTRO', title: 'Casino Introduction' } }, exposedFraction: 0 } as DistrictDto,
  { key: 'BOWERY', name: 'Bowery Row', districtAccess: { unlocked: true }, exposedFraction: 0 } as DistrictDto,
];

describe('DistrictPicker locked choices', () => {
  it('covers locked districts with their requirement and disables their radio', () => {
    const html = renderToStaticMarkup(<MemoryRouter><DistrictPicker districts={districts} value="BOWERY" onChange={() => {}} /></MemoryRouter>);
    expect(html).toContain('se-choice--gated');
    expect(html).toContain('Requires Casino Access to scout this district.');
    expect(html).toContain('se-locked-choice__banner');
    expect(html).toContain('Win the back-room introduction.');
    expect(html).toContain('/game/quests?focus=CASINO_INTRO');
    expect(html).toContain('Casino Introduction');
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html.match(/checked=""/g)).toHaveLength(1);
  });

  it('offers a quest fallback when the district has no specific unlock quest', () => {
    const noQuest = { ...districts[0], districtAccess: { unlocked: false, unlockName: 'Casino Access', unlockDescription: 'Unlock this through your contacts.' } } as DistrictDto;
    const html = renderToStaticMarkup(<MemoryRouter><DistrictPicker districts={[noQuest]} value="" onChange={() => {}} /></MemoryRouter>);
    expect(html).toContain('Unlock this through your contacts.');
    expect(html).toContain('href="/game/quests"');
  });

  it('does not mark a stale locked value as selected', () => {
    const html = renderToStaticMarkup(<MemoryRouter><DistrictPicker districts={districts} value="MIDTOWN" onChange={() => {}} /></MemoryRouter>);
    expect(html).not.toContain('se-choice--on');
    expect(html).not.toContain('checked=""');
  });
});
