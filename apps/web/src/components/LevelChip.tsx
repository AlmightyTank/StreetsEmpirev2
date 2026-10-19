import { accountLevelBadge, formatNumber } from '@streets/shared';

/** Account level beside a player name: "Lv 63" plus a star per prestige (every 50 levels). */
export function LevelChip({ level }: { level: number | null | undefined }) {
  if (!level) return null;
  const badge = accountLevelBadge(level);
  const title = `Account level ${formatNumber(badge.level)}${badge.prestige ? ` · Prestige ${formatNumber(badge.prestige)}` : ''}`;
  return (
    <span className={`se-xp-chip se-xp-chip--${badge.tier} se-level-chip`} title={title} aria-label={title}>
      Lv {formatNumber(badge.level)}
      {badge.prestige ? <span className="se-level-chip__stars" aria-hidden="true">{'★'.repeat(Math.min(badge.prestige, 3))}{badge.prestige > 3 ? formatNumber(badge.prestige) : ''}</span> : null}
    </span>
  );
}
