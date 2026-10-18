import type { DistrictDto } from '@streets/shared';
import { Link } from 'react-router-dom';
import { LockedChoiceOverlay } from './LockedChoiceOverlay.js';

/**
 * The same five mechanical district archetypes, dressed for the city the crew
 * currently lives in. The public name and flavor can change by city; the hidden
 * balance key does not.
 *
 * Nothing else is: not what a block pays, not who is standing around. Both
 * change with the hour or depend on how big you already are, so a printed rate
 * would be a spoiler at best and a lie at worst. The name is the hint, and the
 * receipt from a trip is the answer.
 */
export function DistrictPicker({
  districts,
  value,
  onChange,
  disabled,
}: {
  districts: DistrictDto[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="se-choices">
      {districts.map((district) => {
        const exposed = Math.round(district.exposedFraction * 100);
        const locked = district.districtAccess?.unlocked === false;

        return (
          <label
            key={district.key}
            className={`se-choice${!locked && value === district.key ? ' se-choice--on' : ''}${locked ? ' se-choice--gated' : ''}`}
            aria-disabled={locked || undefined}
          >
            <input
              type="radio"
              name="district"
              className="se-choice__input"
              checked={!locked && value === district.key}
              disabled={disabled || locked}
              aria-label={locked ? `${district.name}. Locked. Requires ${district.districtAccess?.unlockName}.` : district.name}
              onChange={() => { if (!locked && !disabled) onChange(district.key); }}
            />
            <span className="se-choice__body">
              <span className="se-choice__name">{district.name}</span>
              {district.blurb ? <span className="se-choice__blurb">{district.blurb}</span> : null}

              <span className="se-choice__meta">
                <span className={exposed > 0 ? 'se-bad' : undefined}>
                  {exposed > 0
                    ? `${exposed}% working alone`
                    : `Covered · 1 ${district.requiresArmedThugs ? 'armed thug' : 'thug'} per ${district.protectionWhoresPerThug}`}
                </span>
                {district.requiresArmedThugs && district.unarmedThugs > 0 ? (
                  <span className="se-bad" title="Unarmed thugs do not count as street cover in this round.">
                    {district.unarmedThugs} unarmed not covering
                  </span>
                ) : null}
              </span>
            </span>
            {locked ? (
              <LockedChoiceOverlay requirement={`Requires ${district.districtAccess!.unlockName} to scout this district.`}>
                {district.districtAccess!.unlockDescription ? (
                  <span>{district.districtAccess!.unlockDescription} </span>
                ) : null}
                {district.districtAccess!.unlockQuest ? (
                  <Link to={`/game/quests?focus=${encodeURIComponent(district.districtAccess!.unlockQuest!.key)}`}>
                    View “{district.districtAccess!.unlockQuest!.title}”
                  </Link>
                ) : (
                  <Link to="/game/quests">See available quests</Link>
                )}
              </LockedChoiceOverlay>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
