import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DistrictDto } from '@streets/shared';
import { DistrictPicker } from './DistrictPicker.js';

const districts = [
  { key: 'MIDTOWN', name: 'Midtown Back Rooms', districtAccess: { unlocked: false, unlockName: 'Casino Access' }, exposedFraction: 0 } as DistrictDto,
  { key: 'BOWERY', name: 'Bowery Row', districtAccess: { unlocked: true }, exposedFraction: 0 } as DistrictDto,
];

describe('DistrictPicker locked choices', () => {
  it('covers locked districts with their requirement and disables their radio', () => {
    const html = renderToStaticMarkup(<DistrictPicker districts={districts} value="BOWERY" onChange={() => {}} />);
    expect(html).toContain('se-choice--gated');
    expect(html).toContain('Requires Casino Access to scout this district.');
    expect(html).toContain('se-locked-choice__banner');
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html.match(/checked=""/g)).toHaveLength(1);
  });

  it('does not mark a stale locked value as selected', () => {
    const html = renderToStaticMarkup(<DistrictPicker districts={districts} value="MIDTOWN" onChange={() => {}} />);
    expect(html).not.toContain('se-choice--on');
    expect(html).not.toContain('checked=""');
  });
});
