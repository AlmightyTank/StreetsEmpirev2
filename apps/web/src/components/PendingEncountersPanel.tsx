import type { RandomEncounterChoiceResult, RandomEncounterDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { actionsApi } from '../api/actions.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';

function effectLabel(cashCents: number | undefined): string | null {
  if (!cashCents) return null;
  return `${cashCents > 0 ? '+' : '-'}${formatCents(Math.abs(cashCents))}`;
}

function effectSummary(effects: RandomEncounterDto['effects']): string | null {
  const parts = [
    effects.cashCents ? effectLabel(effects.cashCents) : null,
    effects.heat ? `${effects.heat > 0 ? '+' : '-'}${formatNumber(Math.abs(effects.heat))} Heat` : null,
    effects.condoms ? `${effects.condoms > 0 ? '+' : '-'}${formatNumber(Math.abs(effects.condoms))} Condoms` : null,
    effects.medicine ? `${effects.medicine > 0 ? '+' : '-'}${formatNumber(Math.abs(effects.medicine))} Medicine` : null,
    effects.crack ? `${effects.crack > 0 ? '+' : '-'}${formatNumber(Math.abs(effects.crack))} Product` : null,
    effects.beer ? `${effects.beer > 0 ? '+' : '-'}${formatNumber(Math.abs(effects.beer))} Beer` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(' · ') : null;
}

export function PendingEncountersPanel({ encounters }: { encounters: RandomEncounterDto[] }) {
  const action = useGameAction<RandomEncounterChoiceResult>();
  const pending = encounters.filter((encounter) => encounter.id && encounter.choices?.length);

  if (pending.length === 0 && !action.result) return null;

  async function resolve(encounterId: string, choice: string) {
    await action.run((actionId) => actionsApi.resolveEncounter(encounterId, { choice, actionId }));
  }

  return (
    <Panel
      title={pending.length > 1 ? 'Street situations' : pending[0]?.title ?? action.result?.result.title ?? 'Street situation'}
      className="se-dashboard-panel se-encounters"
    >
      {action.error ? <Alert>{action.error}</Alert> : null}
      {action.result ? (
        <div className="se-encounter-result">
          <strong>{action.result.result.choiceLabel}</strong>
          <span>{action.result.result.text}</span>
          {effectSummary(action.result.result.effects) ? <em>{effectSummary(action.result.result.effects)}</em> : null}
        </div>
      ) : null}
      {pending.map((encounter) => (
        <article key={encounter.id} className={`se-encounter se-encounter--${encounter.tone}`}>
          <div className="se-encounter__copy">
            <span className="se-eyebrow">{encounter.status === 'PENDING' ? 'Needs a call' : 'Street situation'}</span>
            <h3>{encounter.title}</h3>
            <p>{encounter.text}</p>
          </div>
          <div className="se-encounter__choices">
            {encounter.choices!.map((choice) => {
              const label = effectSummary(choice.effects);
              return (
                <Button
                  key={choice.key}
                  type="button"
                  className="se-btn se-btn--secondary se-btn--sm"
                  disabledReason={action.busy ? 'Working that response...' : null}
                  onClick={() => void resolve(encounter.id!, choice.key)}
                  title={choice.text}
                >
                  {choice.label}{label ? ` ${label}` : ''}
                </Button>
              );
            })}
          </div>
        </article>
      ))}
    </Panel>
  );
}
