import { useEffect, useRef, useState } from 'react';
import { KONAMI_CODE, easterEggDay, type ClientEasterEggId, type EasterEggDay } from '@streets/shared';
import '../styles/easter-eggs.css';
import { easterEggsApi, type EasterEggFoundDto } from '../api/easterEggs.js';
import { useSession } from '../stores/session.js';
import { showGameToast } from './GameEventToasts.js';

/** Report a browser-found egg; null when signed out or the server said no. */
async function reportEgg(id: ClientEasterEggId): Promise<EasterEggFoundDto | null> {
  try {
    return await easterEggsApi.found(id);
  } catch {
    return null;
  }
}

function toastFound(found: EasterEggFoundDto | null): void {
  if (!found) return;
  const unlocked = found.collection ? `New title and the ${found.collection} look unlocked` : 'New title unlocked';
  showGameToast(found.isNew
    ? { title: `Easter egg: ${found.title}`, detail: `${found.description} ${unlocked}. Equip them from Account settings.`, tone: 'good', href: '/account' }
    : { title: found.title, detail: 'You already found this one.', tone: 'info' });
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Up, up, down, down, left, right, left, right, B, A. Listens everywhere except
 * inside form fields, plays a short burst, and pays the title when signed in.
 */
export function KonamiCode() {
  const signedIn = useSession((s) => Boolean(s.account));
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    let position = 0;
    function onKey(event: KeyboardEvent) {
      if (event.repeat || isTyping(event.target)) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      position = key === KONAMI_CODE[position] ? position + 1 : key === KONAMI_CODE[0] ? 1 : 0;
      if (position < KONAMI_CODE.length) return;
      position = 0;
      setBurst((count) => count + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!burst) return;
    const root = document.documentElement;
    root.classList.add('se-konami');
    const timer = window.setTimeout(() => root.classList.remove('se-konami'), 2_600);
    if (signedInRef.current) void reportEgg('KONAMI').then(toastFound);
    return () => {
      window.clearTimeout(timer);
      root.classList.remove('se-konami');
    };
  }, [burst]);

  return burst ? <div key={burst} className="se-konami-burst" aria-hidden="true">+30 LIVES</div> : null;
}

function todayKey(at: Date): string {
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;
}

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Private windows can refuse storage; the banner just comes back next load.
  }
}

const JOKE_DAYS: Record<EasterEggDay, { egg: ClientEasterEggId; tag: string; text: string; action: string; reveal: string; className: string }> = {
  APRIL_FOOLS: {
    egg: 'APRIL_FOOL',
    tag: 'NEW',
    text: 'To fight inflation, every price on StreetsEmpire is now listed in Monopoly money.',
    action: 'Wait, what?',
    reveal: 'April Fool. Your cash is real. Probably.',
    className: 'se-april-fools',
  },
  BACK_TO_THE_FUTURE: {
    egg: 'GREAT_SCOTT',
    tag: 'GREAT SCOTT',
    text: 'It is the 21st of October. Somebody parked a stainless-steel car outside the garage with the engine still ticking.',
    action: 'Hit 88 mph',
    reveal: 'Where we’re going, we don’t need roads.',
    className: 'se-bttf-day',
  },
  FRIDAY_THE_13TH: {
    egg: 'FRIDAY_THE_13TH',
    tag: 'FRIDAY THE 13TH',
    text: 'The cops are wearing hockey masks tonight. Nobody is sure they are cops.',
    action: 'Go out anyway',
    reveal: 'Brave. Stay away from the lake.',
    className: 'se-friday-13',
  },
};

/**
 * The joke days, in the viewer's own time zone: a banner in the game frame and
 * a class on the page for the day's look. The server checks the date again
 * before it pays the title.
 */
export function JokeDayBanner() {
  const now = new Date();
  const day = easterEggDay(now);
  const storageKey = `se-joke-day:${todayKey(now)}`;
  const [dismissed, setDismissed] = useState(() => readDismissed(storageKey));
  const [revealed, setRevealed] = useState<string | null>(null);
  const joke = day ? JOKE_DAYS[day] : null;

  useEffect(() => {
    if (!joke) return;
    const root = document.documentElement;
    root.classList.add(joke.className);
    return () => root.classList.remove(joke.className);
  }, [joke]);

  if (!joke || dismissed) return null;

  async function play() {
    if (!joke) return;
    const found = await reportEgg(joke.egg);
    const look = found?.collection ? ` and the ${found.collection} look` : '';
    setRevealed(found?.isNew ? `${joke.reveal} Unlocked: the ${found.title} title${look}.` : joke.reveal);
    writeDismissed(storageKey);
  }

  return (
    <div className="se-beta-banner se-joke-day" role="status">
      <strong>{joke.tag}</strong>
      <span>{revealed ?? joke.text}</span>
      {revealed ? (
        <button type="button" className="se-btn se-btn--sm se-btn--secondary" onClick={() => setDismissed(true)}>Close</button>
      ) : (
        <button type="button" className="se-btn se-btn--sm se-btn--secondary" onClick={() => void play()}>{joke.action}</button>
      )}
    </div>
  );
}

/** How many times the player looked away before the statue reached them. */
const STATUE_REACHES_YOU_AFTER = 3;

/**
 * The statue only moves when nobody is looking. Each time the tab is hidden
 * while it is on screen it comes a step closer; the third time, it reaches
 * you and onReached runs once (the page picks "Run" for the player).
 */
export function useStatueStare(active: boolean, onReached: () => void): number {
  const [looks, setLooks] = useState(0);
  const reached = useRef(false);
  const callback = useRef(onReached);
  callback.current = onReached;

  useEffect(() => {
    if (!active) return;
    function onVisibility() {
      if (document.visibilityState === 'hidden') setLooks((count) => Math.min(STATUE_REACHES_YOU_AFTER, count + 1));
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [active]);

  useEffect(() => {
    if (!active || looks < STATUE_REACHES_YOU_AFTER || reached.current) return;
    reached.current = true;
    callback.current();
  }, [active, looks]);

  return Math.min(looks, STATUE_REACHES_YOU_AFTER - 1);
}

const STATUE_CAPTIONS = [
  'Don’t look away.',
  'It moved. You looked away, didn’t you?',
  'Whatever you do, don’t blink.',
];

function StatueArms({ stage }: { stage: number }) {
  // Each limb is drawn twice: a dark outline stroke, then the stone on top.
  const limbs = stage === 0
    ? ['M47 73 Q36 86 41 94 Q48 78 54 50', 'M73 73 Q84 86 79 94 Q72 78 66 50']
    : stage === 1
      ? ['M47 73 Q37 88 44 96 Q52 92 60 84', 'M73 73 Q83 88 76 96 Q68 92 60 84']
      : ['M47 73 Q30 70 16 54', 'M73 73 Q90 70 104 54'];
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {limbs.map((d) => <path key={`o${d}`} d={d} stroke="#2e2c28" strokeWidth={9.5} />)}
      {limbs.map((d) => <path key={`s${d}`} d={d} stroke="url(#se-statue-stone)" strokeWidth={7} />)}
      {stage === 0 ? (
        <g fill="url(#se-statue-stone)" stroke="#2e2c28" strokeWidth={1.4}>
          <ellipse cx={54} cy={45} rx={7} ry={9.5} transform="rotate(-12 54 45)" />
          <ellipse cx={66} cy={45} rx={7} ry={9.5} transform="rotate(12 66 45)" />
        </g>
      ) : null}
      {stage === 2 ? (
        <g stroke="#2e2c28" strokeWidth={1.6} fill="url(#se-statue-stone)">
          <path d="M16 54 l-6 -9 M16 54 l-8 -4 M16 54 l-3 -11 M16 54 l-9 1" />
          <path d="M104 54 l6 -9 M104 54 l8 -4 M104 54 l3 -11 M104 54 l9 1" />
          <circle cx={16} cy={54} r={4.2} />
          <circle cx={104} cy={54} r={4.2} />
        </g>
      ) : null}
    </g>
  );
}

function StatueFace({ stage }: { stage: number }) {
  if (stage === 0) return null;
  if (stage === 1) {
    return (
      <g stroke="#3d3a35" strokeWidth={1.3} fill="none" strokeLinecap="round">
        <path d="M53 43 q3 -2 6 0 M61 43 q3 -2 6 0" />
        <path d="M56 52 h8" />
      </g>
    );
  }
  return (
    <g strokeLinecap="round">
      <path d="M51 38 l8 4 M69 38 l-8 4" stroke="#2e2c28" strokeWidth={1.8} />
      <ellipse cx={55} cy={44} rx={2.6} ry={2} fill="#1d1b18" />
      <ellipse cx={65} cy={44} rx={2.6} ry={2} fill="#1d1b18" />
      <ellipse cx={60} cy={53} rx={5.5} ry={4.2} fill="#1d1b18" />
      <path d="M55.6 50.4 l1.4 3 1.4 -3 M60.4 50.4 l1.4 3 1.4 -3 M57.4 56 l1.2 -2.6 1.2 2.6 M60.6 56 l1.2 -2.6 1.2 2.6" fill="#ece8de" stroke="#ece8de" strokeWidth={0.6} />
    </g>
  );
}

/** The statue, closer at each stage. Drawn in the item-art style: stone, dark outline, soft shadow. */
export function StatueArt({ stage }: { stage: number }) {
  return (
    <svg className={`se-statue__art se-statue__art--${stage}`} viewBox="0 0 120 200" aria-hidden="true">
      <defs>
        <linearGradient id="se-statue-stone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dedad1" />
          <stop offset=".5" stopColor="#aeaaa1" />
          <stop offset="1" stopColor="#7a776f" />
        </linearGradient>
        <filter id="se-statue-shadow" x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity=".6" />
        </filter>
      </defs>
      <ellipse cx={60} cy={196} rx={40} ry={4} fill="#000" opacity={0.45} />
      <g filter="url(#se-statue-shadow)" stroke="#2e2c28" strokeWidth={1.6} strokeLinejoin="round">
        {/* wings */}
        <path d="M50 74 C26 44 8 52 6 92 C9 124 20 150 38 174 L50 118 Z" fill="url(#se-statue-stone)" />
        <path d="M70 74 C94 44 112 52 114 92 C111 124 100 150 82 174 L70 118 Z" fill="url(#se-statue-stone)" />
        {/* gown */}
        <path d="M44 92 C40 130 33 166 27 196 L93 196 C87 166 80 130 76 92 Z" fill="url(#se-statue-stone)" />
        <path d="M46 70 Q60 64 74 70 L78 96 L42 96 Z" fill="url(#se-statue-stone)" />
        <rect x={55} y={54} width={10} height={12} fill="url(#se-statue-stone)" />
        <ellipse cx={60} cy={45} rx={12} ry={14} fill="url(#se-statue-stone)" />
        <circle cx={60} cy={29} r={6.5} fill="url(#se-statue-stone)" />
      </g>
      <g stroke="#6d6a63" strokeWidth={1} fill="none" strokeLinecap="round" opacity={0.85}>
        <path d="M14 78 C20 70 30 68 40 76 M12 98 C20 90 32 90 44 98 M16 120 C24 114 34 114 46 120" />
        <path d="M106 78 C100 70 90 68 80 76 M108 98 C100 90 88 90 76 98 M104 120 C96 114 86 114 74 120" />
        <path d="M52 100 C50 140 46 168 42 194 M60 100 V194 M68 100 C70 140 74 168 78 194" />
        <path d="M49 36 Q60 28 71 36" />
      </g>
      <StatueFace stage={stage} />
      <StatueArms stage={stage} />
    </svg>
  );
}

/** The statue encounter's picture and caption. */
export function StatueEncounterArt({ stage }: { stage: number }) {
  return (
    <figure className={`se-statue se-statue--${stage}`}>
      <StatueArt stage={stage} />
      <figcaption>{STATUE_CAPTIONS[stage]}</figcaption>
    </figure>
  );
}

/** The statue for an open encounter: watches the tab and creeps closer. */
export function StatueWatch({ active, onReached }: { active: boolean; onReached: () => void }) {
  const stage = useStatueStare(active, onReached);
  return <StatueEncounterArt stage={stage} />;
}

/** The line under an encounter result when a choice found an egg. */
export function EncounterEggNote({ egg }: { egg: { title: string; description: string; isNew: boolean } | undefined }) {
  if (!egg) return null;
  return (
    <span className="se-egg-found">
      {egg.isNew ? <>Easter egg found: <strong>{egg.title}</strong>. {egg.description}</> : <>You already hold <strong>{egg.title}</strong>.</>}
    </span>
  );
}
