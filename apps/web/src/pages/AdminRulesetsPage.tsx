import { useEffect, useMemo, useState } from 'react';
import type { AdminRulesetOptionDto, AdminRulesetViewDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';

export function AdminRulesetsPage() {
  const [options, setOptions] = useState<AdminRulesetOptionDto[]>([]);
  const [rulesetId, setRulesetId] = useState('');
  const [compareId, setCompareId] = useState('');
  const [view, setView] = useState<AdminRulesetViewDto | null>(null);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.rounds()
      .then((rounds) => {
        setOptions(rounds.rulesets);
        setRulesetId(rounds.rulesets[0]?.id ?? '');
        setCompareId(rounds.rulesets[1]?.id ?? '');
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load rulesets.'));
  }, []);

  useEffect(() => {
    if (!rulesetId) return;
    let cancelled = false;
    adminApi.ruleset(rulesetId, compareId || undefined)
      .then((result) => {
        if (!cancelled) {
          setView(result);
          setError(null);
        }
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load that ruleset.'));
    return () => {
      cancelled = true;
    };
  }, [rulesetId, compareId]);

  const sections = useMemo(() => {
    if (!view) return [];
    const needle = filter.trim().toLowerCase();
    return view.sections
      .map((section) => ({
        ...section,
        rows: section.rows.filter((row) => (!onlyChanges || row.changed) && (!needle || row.path.toLowerCase().includes(needle))),
      }))
      .filter((section) => section.rows.length > 0);
  }, [view, onlyChanges, filter]);

  const comparing = Boolean(view?.compareTo);

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Rulesets</h1>
          <p className="se-eyebrow">Admin · the numbers each round runs on</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <Panel title="Choose" aside={view && comparing ? `${formatNumber(view.changedCount)} values differ` : undefined} className="se-mb">
        <div className="se-admin-filters">
          <div className="se-field">
            <label className="se-label" htmlFor="admin-ruleset">Ruleset</label>
            <select id="admin-ruleset" className="se-input" value={rulesetId} onChange={(event) => setRulesetId(event.target.value)}>
              {options.map((option) => <option key={option.id} value={option.id}>{option.version} · {option.name}</option>)}
            </select>
          </div>
          <div className="se-field">
            <label className="se-label" htmlFor="admin-ruleset-compare">Compare with</label>
            <select id="admin-ruleset-compare" className="se-input" value={compareId} onChange={(event) => setCompareId(event.target.value)}>
              <option value="">Nothing</option>
              {options.filter((option) => option.id !== rulesetId).map((option) => <option key={option.id} value={option.id}>{option.version} · {option.name}</option>)}
            </select>
          </div>
          <Field id="admin-ruleset-filter" label="Filter paths" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="e.g. turns or hideout" />
          <label className="se-checkrow se-checkrow--inline">
            <input type="checkbox" checked={onlyChanges} disabled={!comparing} onChange={(event) => setOnlyChanges(event.target.checked)} />
            <span><strong>Only differences</strong><small>{comparing ? 'Hide values both rulesets share.' : 'Pick a ruleset to compare with first.'}</small></span>
          </label>
          <p className="se-hint se-narrow-only">Ruleset values keep their wide table. Scroll it sideways to line both versions up.</p>
        </div>
      </Panel>

      {!view ? (
        <p className="se-muted">Loading ruleset...</p>
      ) : sections.length === 0 ? (
        <p className="se-muted">{onlyChanges ? 'These rulesets have the same numbers.' : 'No values match that filter.'}</p>
      ) : (
        sections.map((section) => (
          <Panel key={section.key} title={section.key} aside={comparing && section.changed ? `${section.changed} changed` : undefined} flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table">
                <thead>
                  <tr>
                    <th>Path</th>
                    <th>{view.ruleset.version}</th>
                    {comparing ? <th>{view.compareTo!.version}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={row.path} className={row.changed ? 'se-admin-row--changed' : undefined}>
                      <td className="se-admin-ruleset-value">{row.path}</td>
                      <td className="se-admin-ruleset-value">{row.value === 'null' ? <span className="se-muted">none</span> : row.value ?? <span className="se-muted">not set</span>}</td>
                      {comparing ? <td className="se-admin-ruleset-value">{row.compareValue === 'null' ? <span className="se-muted">none</span> : row.compareValue ?? <span className="se-muted">not set</span>}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))
      )}
    </GameLayout>
  );
}
