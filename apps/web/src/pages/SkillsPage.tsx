import { useEffect, useState } from 'react';
import type { StreetSkillKeyDto, StreetSkillProgressDto, StreetSkillsDto } from '@streets/shared';
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

function SkillCard({ skill, cap }: { skill: StreetSkillProgressDto; cap: number }) {
  const next = nextMilestone(skill);
  const chosen = skill.milestones.filter((milestone) => milestone.choice).map((milestone) => {
    const option = milestone.choices.find((choice) => choice.key === milestone.choice);
    return option?.label ?? milestone.choice!;
  });
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
    </article>
  );
}

export function SkillsPage() {
  const [data, setData] = useState<StreetSkillsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    skillsApi.mine().then((result) => { if (active) setData(result); }).catch((caught: unknown) => {
      if (active) setError(caught instanceof ApiError ? caught.message : 'Could not load street skills.');
    });
    return () => { active = false; };
  }, []);

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
          <div className="se-skills-today__row"><strong>{data.xpToday.toLocaleString()} XP</strong><span>of {data.dailyHalfXp.toLocaleString()} XP in today’s taper window</span><b className={`se-skill-band se-skill-band--${data.taperBand.toLowerCase()}`}>{bandLabel(data.taperBand)}</b></div>
          <div className="se-skill-meter"><span style={{ width: `${Math.min(100, data.xpToday / data.dailyHalfXp * 100)}%` }} /></div>
          <p className="se-muted">Full rate through {data.dailyFullXp.toLocaleString()} XP, half rate through {data.dailyHalfXp.toLocaleString()}, then quarter rate.</p>
        </Panel>
        <section className="se-skills-grid" aria-label="Street skill progress">
          {data.skills.map((skill) => <SkillCard key={skill.skill} skill={skill} cap={data.skillPointCap} />)}
        </section>
      </> : null}
    </div>
  </GameLayout>;
}
