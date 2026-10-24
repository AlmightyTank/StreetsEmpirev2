import type { PlayerQuestDto, QuestStorySceneDto } from '@streets/shared';
import { Button } from './Button.js';

/** Authored prose keeps its paragraph breaks: a blank line starts a new paragraph. */
export function StoryProse({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </>
  );
}

function lockedHint(quest: PlayerQuestDto): string {
  if (quest.status === 'AVAILABLE' || quest.status === 'LOCKED') return 'Take the job to play this scene.';
  if (quest.status === 'ACTIVE' || quest.status === 'READY_TO_TURN_IN') return 'Opens once the work before it is done.';
  return 'This scene was not played.';
}

function Scene({
  quest,
  scene,
  busy,
  onRespond,
}: {
  quest: PlayerQuestDto;
  scene: QuestStorySceneDto;
  busy: string | null;
  onRespond: (questKey: string, sceneKey: string, responseKey: string, responseLabel: string) => void;
}) {
  const titleId = `quest-scene-${quest.key}-${scene.key}`;
  const state = scene.response ? 'answered' : scene.available ? 'open' : 'locked';
  return (
    <section className={`se-quest-scene se-quest-scene--${state}`} aria-labelledby={titleId}>
      <h4 id={titleId} className="se-quest-scene__title">{scene.title}</h4>
      {state === 'locked' ? (
        <p className="se-hint">{lockedHint(quest)}</p>
      ) : (
        <div className="se-quest-scene__prose"><StoryProse text={scene.prose} /></div>
      )}
      {scene.response ? (
        <div className="se-quest-scene__outcome" aria-live="polite">
          <span className="se-eyebrow">You chose · {scene.response.label}</span>
          <StoryProse text={scene.response.outcome} />
        </div>
      ) : null}
      {state === 'open' ? (
        <div className="se-quest-scene__responses" role="group" aria-label={`Your response to ${scene.title}`}>
          {scene.responses.map((response) => (
            <Button
              key={response.key}
              className="se-btn se-quest-scene__response"
              disabledReason={busy}
              onClick={() => onRespond(quest.key, scene.key, response.key, response.label)}
            >
              {response.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Story campaign scenes on a quest card: locked, open to answer, or answered with its outcome. */
export function QuestStoryScenes({
  quest,
  busy,
  onRespond,
}: {
  quest: PlayerQuestDto;
  busy: string | null;
  onRespond: (questKey: string, sceneKey: string, responseKey: string, responseLabel: string) => void;
}) {
  const scenes = quest.story?.scenes;
  if (!scenes?.length) return null;
  return (
    <div className="se-quest-scenes">
      {scenes.map((scene) => (
        <Scene key={scene.key} quest={quest} scene={scene} busy={busy} onRespond={onRespond} />
      ))}
    </div>
  );
}

/** True when a scene on the card can be answered right now, so the card should open to it. */
export function hasOpenScene(quest: PlayerQuestDto): boolean {
  return quest.story?.scenes?.some((scene) => scene.available) ?? false;
}
