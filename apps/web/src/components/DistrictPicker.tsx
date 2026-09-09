import type { DistrictDto } from '@streets/shared';

/**
 * The same five blocks, and the only thing posted about any of them is whether
 * your crew can hold a corner there.
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

              <span className="se-choice__meta">
                <span className={exposed > 0 ? 'se-bad' : undefined}>
                  {exposed > 0
                    ? `${exposed}% working alone`
                    : `Covered · 1 thug per ${district.protectionWhoresPerThug}`}
                </span>
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
