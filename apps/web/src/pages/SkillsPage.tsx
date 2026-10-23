import { useCallback, useEffect, useState } from 'react';
import { formatCents, type StreetSkillKeyDto, type StreetSkillMilestoneDto, type StreetSkillProgressDto, type StreetSkillsDto } from '@streets/shared';
import { skillsApi } from '../api/skills.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';

const labels: Record<StreetSkillKeyDto, string> = {
  HUSTLE: 'Hustle', MUSCLE: 'Muscle', WHEELS: 'Wheels', FIXER: 'Fixer', CONNECTIONS: 'Connections', LUCK: 'Luck',
};

function bandLabel(band: StreetSkillsDto['taperBand']): string {
  return band === 'FULL' ? 'Full rate' : band === 'HALF' ? 'Half rate' : 'Quarter rate';
}

function nextMilestone(skill: StreetSkillProgressDto) {
  return skill.milestones.find((milestone) => !milestone.unlocked) ?? null;
}

type SkillAction = (run: () => Promise<unknown>) => void;

function Milestone({ skill, milestone, busy, act }: { skill: StreetSkillProgressDto; milestone: StreetSkillMilestoneDto; busy: boolean; act: SkillAction }) {
  const open = milestone.unlocked && !milestone.choice;
  return (
    <div className="se-skill-milestone">
      <span className="se-skill-milestone__head">{milestone.threshold} points · {milestone.choice ? 'Chosen' : milestone.unlocked ? 'Pick one' : 'Locked'}</span>
      <div className="se-skill-milestone__choices">
        {milestone.choices.map((choice) => {
          const chosen = milestone.choice === choice.key;
          return (
            <div key={choice.key} className={`se-skill-perk${chosen ? ' se-skill-perk--chosen' : ''}${choice.requires ? ' se-skill-perk--soon' : ''}`}>
              <strong>{choice.label}</strong>
              <span className="se-muted">{choice.description}</span>
              {choice.requires ? <span className="se-skill-perk__soon">Coming with {choice.requires}</span> : null}
              {open && !choice.requires ? (
                <button type="button" className="se-btn se-btn--primary se-btn--sm" disabled={busy}
                  onClick={() => act(() => skillsApi.choose(skill.skill, milestone.threshold, choice.key))}>Choose</button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkillCard({ skill, cap, busy, act }: { skill: StreetSkillProgressDto; cap: number; busy: boolean; act: SkillAction }) {
  const next = nextMilestone(skill);
  const chosen = skill.milestones.filter((milestone) => milestone.choice).map((milestone) => {
    const option = milestone.choices.find((choice) => choice.key === milestone.choice);
    return option?.label ?? milestone.choice!;
  });
  const cooling = skill.respecReadyAt && new Date(skill.respecReadyAt) > new Date();
  return (
    <article className="se-skill-card">
      <div className="se-skill-card__head">
        <div><span className="se-eyebrow">Street skill</span><h2>{labels[skill.skill]}</h2></div>
        <strong className="se-skill-card__points">{skill.points}<small> / {cap}</small></strong>
      </div>
      <div className="se-skill-meter" aria-label={`${skill.points} of ${cap} points`}><span style={{ width: `${Math.min(100, skill.points / cap * 100)}%` }} /></div>
      <div className="se-skill-card__meta"><span>{skill.xp.toLocaleString()} XP total</span><span>{skill.xpToday.toLocaleString()} XP today · {bandLabel(skill.taperBand)}</span></div>
      <div className="se-skill-card__milestone">
        <span className="se-muted">{next ? `Next milestone · ${next.threshold} points` : 'All milestones unlocked'}</span>
        {chosen.length ? <span>Chosen perks · {chosen.join(' · ')}</span> : <span className="se-muted">No perks chosen yet</span>}
      </div>
      {skill.milestones.map((milestone) => <Milestone key={milestone.threshold} skill={skill} milestone={milestone} busy={busy} act={act} />)}
      {chosen.length ? (
        <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={busy || Boolean(cooling)}
          onClick={() => { if (window.confirm(`Reset your ${labels[skill.skill]} perks for ${formatCents(skill.respecCostCents)}?`)) act(() => skillsApi.respec(skill.skill)); }}>
          {cooling ? `Respec ready ${new Date(skill.respecReadyAt!).toLocaleString()}` : `Respec perks · ${formatCents(skill.respecCostCents)}`}
        </button>
      ) : null}
    </article>
  );
}

export function SkillsPage() {
  const [data, setData] = useState<StreetSkillsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => skillsApi.mine().then(setData), []);
  useEffect(() => {
    let active = true;
    skillsApi.mine().then((result) => { if (active) setData(result); }).catch((caught: unknown) => {
      if (active) setError(caught instanceof ApiError ? caught.message : 'Could not load street skills.');
    });
    return () => { active = false; };
  }, []);
  const act: SkillAction = (run) => {
    setBusy(true);
    setError(null);
    run().then(load).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'That did not go through.');
    }).finally(() => setBusy(false));
  };

  return <GameLayout>
    <div className="se-skills-page">
      <header className="se-pagehead se-skills-hero">
        <div><span className="se-eyebrow">Round identity</span><h1 className="se-title">Street skills</h1><p className="se-muted">Build the way you run the streets. Points and perks belong to this round.</p></div>
        {data ? <div className="se-skills-hero__total"><strong>{data.totalPoints} <small>/ {data.totalPointCap}</small></strong><span>points earned</span></div> : null}
      </header>
      {error ? <Alert>{error}</Alert> : null}
      {!data && !error ? <p className="se-muted">Reading your street record...</p> : null}
      {data ? <>
        <Panel title="Today’s pace" className="se-skills-today">
          <div className="se-skills-today__row"><strong>{data.xpToday.toLocaleString()} XP</strong><span>in your busiest skill today</span><b className={`se-skill-band se-skill-band--${data.taperBand.toLowerCase()}`}>{bandLabel(data.taperBand)}</b></div>
          <div className="se-skill-meter"><span style={{ width: `${Math.min(100, data.xpToday / data.dailyHalfXp * 100)}%` }} /></div>
          <p className="se-muted">Each skill earns full rate through {data.dailyFullXp.toLocaleString()} XP a day, half rate through {data.dailyHalfXp.toLocaleString()}, then quarter rate.{data.totalPoints >= data.totalPointCap ? ' You have reached the total point cap: skills keep their points but earn no more.' : ''}</p>
        </Panel>
        <section className="se-skills-grid" aria-label="Street skill progress">
          {data.skills.map((skill) => <SkillCard key={skill.skill} skill={skill} cap={data.skillPointCap} busy={busy} act={act} />)}
        </section>
      </> : null}
    </div>
  </GameLayout>;
}
