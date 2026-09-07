import type { DistrictDto } from '@streets/shared';

const BAND: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/**
 * The same five blocks, described by what you are going there to do.
 *
 * Scouting cares who is standing around; working cares what the block pays and
 * whether you have the muscle to hold a corner on it.
 */
export function DistrictPicker({
  districts,
  value,
  onChange,
  mode,
  disabled,
}: {
  districts: DistrictDto[];
  value: string;
  onChange: (key: string) => void;
  mode: 'scout' | 'work';
  disabled?: boolean;
}) {
  return (
    <div className="se-choices">
      {districts.map((district) => {
        const exposed = Math.round(district.exposedFraction * 100);
        const thin = mode === 'work' && exposed > 0;

        return (
          <label
            key={district.key}
            className={`se-choice${value === district.key ? ' se-choice--on' : ''}`}
          >
            <input
              type="radio"
              name="district"
              className="se-choice__input"
              checked={value === district.key}
              disabled={disabled}
              onChange={() => onChange(district.key)}
            />
            <span className="se-choice__body">
              <span className="se-choice__name">{district.name}</span>

              {mode === 'scout' ? (
                <span className="se-choice__meta">
                  <span>
                    <b className="se-num se-dim">{district.expectedWhoresPerTurn}</b> whores
                    {' / '}
                    <b className="se-num se-dim">{district.expectedThugsPerTurn}</b> thugs
                    per turn
                  </span>
                </span>
              ) : (
                <span className="se-choice__meta">
                  <span>
                    Pay <b className="se-dim">{BAND[district.money]}</b>
                  </span>
                  <span className={thin ? 'se-bad' : undefined}>
                    {thin
                      ? `${exposed}% working alone`
                      : `Covered · 1 thug per ${district.protectionWhoresPerThug}`}
                  </span>
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
