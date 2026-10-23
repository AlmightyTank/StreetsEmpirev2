import { useEffect, useState } from 'react';
import { useSession } from '../stores/session.js';
import { adminApi } from '../api/admin.js';
import { previewEncounterAlert, type EncounterAlert, type EncounterAlertOutcome } from './CinematicEncounterAlerts.js';

const SCENARIOS = {
  'driveby-hit': {
    kind: 'driveby', outcome: 'defeat', title: 'Drive-by hit your block',
    description: 'A rival crew rolled through your corner. Your lookouts report wounded crew members.',
    location: 'Old Depot', opponent: 'The Ash Street Crew',
  },
  'driveby-stopped': {
    kind: 'driveby', outcome: 'victory', title: 'Drive-by stopped',
    description: 'Your lookouts spotted the car early. Your crew held the block.',
    location: 'Old Depot', opponent: 'The Ash Street Crew',
  },
  'raid-incoming': {
    kind: 'raid', outcome: 'incoming', title: 'Rivals are on the way',
    description: 'Lookouts spotted a rival squad moving toward your hideout. Prepare your defense.',
    location: 'Downtown', opponent: 'The Northside Crew',
  },
  'raid-hit': {
    kind: 'raid', outcome: 'defeat', title: 'Your hideout was raided',
    description: 'An enemy crew breached your defenses. Review the damage and plan your next move.',
    location: 'Downtown', opponent: 'The Northside Crew',
  },
  'raid-defended': {
    kind: 'raid', outcome: 'victory', title: 'Raid defended',
    description: 'Your crew drove the attackers back and protected the stash.',
    location: 'Downtown', opponent: 'The Northside Crew',
  },
  'turf-invasion': {
    kind: 'turf', outcome: 'incoming', title: 'Your turf is under attack',
    description: 'Rivals are pushing onto your block. Open Turf to send backup before the fight lands.',
    location: 'River Market', opponent: 'The Iron Vultures',
  },
  'turf-lost': {
    kind: 'turf', outcome: 'defeat', title: 'Your crew lost the block',
    description: 'The rival push broke through. Your control over the corner has fallen.',
    location: 'River Market', opponent: 'The Iron Vultures',
  },
  'turf-held': {
    kind: 'turf', outcome: 'victory', title: 'Your block held',
    description: 'Your crew stood its ground. Rivals retreated from the corner.',
    location: 'River Market', opponent: 'The Iron Vultures',
  },
  'convoy-tail': {
    kind: 'convoy', outcome: 'incoming', title: 'Your convoy is being followed',
    description: 'A suspicious vehicle is trailing your run. Move before the ambush lands.',
    location: 'South Junction', opponent: 'Unknown pursuers',
  },
  'convoy-escaped': {
    kind: 'convoy', outcome: 'victory', title: 'Convoy escaped the ambush',
    description: 'Your drivers shook the tail and delivered the cargo safely.',
    location: 'South Junction', opponent: 'Unknown pursuers',
  },
  'street-encounter': {
    kind: 'encounter', outcome: 'warning', title: 'Something is happening on the street',
    description: 'A stranger waves your crew down with an unusual offer. This is a visual preview; it does not create a choice or grant rewards.',
    location: 'The Back Alleys', opponent: 'Unknown contact',
    encounter: {
      key: 'qa-street-opportunity', title: 'Something is happening on the street',
      text: 'A stranger waves your crew down with an unusual offer.', tone: 'neutral', effects: {},
      status: 'PENDING',
      choices: [
        { key: 'listen', label: 'Hear the offer', text: 'Ask the stranger what they want.', effects: {} },
        { key: 'question', label: 'Press for answers', text: 'Find out who sent them.', effects: {} },
        { key: 'leave', label: 'Walk away', text: 'Keep moving.', effects: {} },
      ],
    },
  },
  'hidden-encounter': {
    kind: 'encounter', outcome: 'victory', title: 'You discovered a hidden secret',
    description: 'A rare encounter has revealed a clue. The tester never awards cosmetics, XP, or loot.',
    location: 'Old Foundry', opponent: 'Mysterious stranger',
  },
} satisfies Record<string, EncounterAlert>;

type ScenarioKey = keyof typeof SCENARIOS;

/** Only shown inside the already protected admin event page. No server mutations. */
export function AdminEncounterTester() {
  const isAdmin = useSession((state) => state.account?.isAdmin ?? false);
  const [scenario, setScenario] = useState<ScenarioKey>('driveby-hit');
  const [outcomeOverride, setOutcomeOverride] = useState<EncounterAlertOutcome | 'default'>('default');
  const [location, setLocation] = useState('');
  const [opponent, setOpponent] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  if (!isAdmin) return null;
  const selected = SCENARIOS[scenario];

  function buildPreview(): EncounterAlert {
    return {
      ...selected,
      outcome: outcomeOverride === 'default' ? selected.outcome : outcomeOverride,
      location: location.trim() || selected.location,
      opponent: opponent.trim() || selected.opponent,
      title: title.trim() || selected.title,
      description: description.trim() || selected.description,
    };
  }

  function previewSequence() {
    for (const key of ['driveby-hit', 'raid-defended', 'turf-invasion'] as const) {
      previewEncounterAlert(SCENARIOS[key]);
    }
  }

  return (
    <>
    <details className="se-admin-encounter-tester se-mb">
      <summary>Internal QA · hidden encounter / combat popup tester</summary>
      <div className="se-admin-encounter-tester__body">
        <p className="se-admin-encounter-tester__note">
          Visual preview only. Nothing is sent to the server: no live encounter is rolled, no player is attacked,
          and no rewards, cooldowns, balances, or battle records change. Test with your normal player theme,
          on desktop or mobile. Preview labels remain visible.
        </p>
        <div className="se-admin-encounter-tester__controls">
          <label>Scenario
            <select className="se-input" value={scenario} onChange={(event) => {
              setScenario(event.target.value as ScenarioKey);
              setOutcomeOverride('default');
              setLocation('');
              setOpponent('');
              setTitle('');
              setDescription('');
            }}>
              {Object.entries(SCENARIOS).map(([key, option]) =>
                <option key={key} value={key}>{option.title} ({option.kind})</option>,
              )}
            </select>
          </label>
          <label>Outcome / visual theme
            <select className="se-input" value={outcomeOverride} onChange={(event) => setOutcomeOverride(event.target.value as EncounterAlertOutcome | 'default')}>
              <option value="default">Use scenario outcome</option>
              <option value="incoming">Incoming threat</option>
              <option value="victory">Victory</option>
              <option value="defeat">Defeat</option>
              <option value="warning">Warning</option>
            </select>
          </label>
          <label>Location override
            <input className="se-input" value={location} maxLength={90} onChange={(event) => setLocation(event.target.value)} placeholder={selected.location} />
          </label>
          <label>Opponent override
            <input className="se-input" value={opponent} maxLength={90} onChange={(event) => setOpponent(event.target.value)} placeholder={selected.opponent} />
          </label>
          <label>Alert headline override
            <input className="se-input" value={title} maxLength={130} onChange={(event) => setTitle(event.target.value)} placeholder={selected.title} />
          </label>
          <label>Description override
            <textarea className="se-input" value={description} maxLength={600} rows={3}
              onChange={(event) => setDescription(event.target.value)} placeholder={selected.description} />
          </label>
        </div>
        <div className="se-actions">
          <button type="button" className="se-btn se-btn--primary" onClick={() => previewEncounterAlert(buildPreview())}>Open cinematic preview</button>
          <button type="button" className="se-btn se-btn--secondary" onClick={previewSequence}>Test three-alert queue</button>
        </div>
      </div>
    </details>
    { /* The server returns 404 outside beta; this keeps beta controls out of production UI. */ }
    <BetaTerritoryTester />
    </>
  );
}

function BetaTerritoryTester() {
  const isAdmin = useSession((state) => state.account?.isAdmin ?? false);
  const [enabled, setEnabled] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; username: string }>>([]);
  const [pools, setPools] = useState<Record<string, Array<{ key: string; title: string }>>>({});
  const [accountId, setAccountId] = useState('');
  const [roundPlayerId, setRoundPlayerId] = useState('');
  const [trigger, setTrigger] = useState('SCOUT');
  const [district, setDistrict] = useState('LOW_RENT');
  const [seed, setSeed] = useState('territory-preview-1');
  const [simulation, setSimulation] = useState<unknown>(null);
  const [reason, setReason] = useState('Beta territory encounter QA');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    void adminApi.territoryEncounterTester().then((result) => {
      setEnabled(result.enabled);
      setAccounts(result.accounts);
      setPools(result.pools);
    }).catch(() => setEnabled(false));
  }, [isAdmin]);

  if (!isAdmin || !enabled) return null;
  async function mark(enabled: boolean) {
    try {
      await adminApi.setTerritoryTestAccount(accountId, enabled, reason);
      setMessage(enabled ? 'Test account enabled.' : 'Test account disabled.');
      const result = await adminApi.territoryEncounterTester();
      setAccounts(result.accounts);
    } catch { setMessage('Could not update the test account.'); }
  }
  async function reward(grant: boolean) {
    try {
      await adminApi.territoryTestReward(roundPlayerId, 'territory-national-kingpin-frame', grant, reason);
      setMessage(grant ? 'Test reward granted.' : 'Tester reward revoked.');
    } catch { setMessage('Could not update the test reward. Check that the player is a marked test account.'); }
  }
  async function simulate() {
    try {
      setSimulation(await adminApi.simulateTerritoryEncounter({ roundPlayerId, trigger, district, seed }));
      setMessage('Simulation completed without changing game state.');
    } catch { setMessage('Simulation failed. Check the player, trigger, and district.'); }
  }
  return (
    <details className="se-admin-encounter-tester se-mb">
      <summary>Beta QA · territory encounter tester</summary>
      <div className="se-admin-encounter-tester__body">
        <p className="se-admin-encounter-tester__note">Beta only. Every mutation is audited and reward grants are restricted to accounts marked for testing.</p>
        <label>Test account ID<input className="se-input" value={accountId} onChange={(event) => setAccountId(event.target.value)} /></label>
        <label>Reason<input className="se-input" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <button className="se-btn" type="button" disabled={!accountId || reason.trim().length < 5} onClick={() => void mark(true)}>Mark test account</button>
        <button className="se-btn" type="button" disabled={!accountId || reason.trim().length < 5} onClick={() => void mark(false)}>Unmark</button>
        <p>Marked accounts: {accounts.map((account) => `${account.username} (${account.id})`).join(', ') || 'none'}</p>
        <label>Round player ID<input className="se-input" value={roundPlayerId} onChange={(event) => setRoundPlayerId(event.target.value)} /></label>
        <label>Trigger<select className="se-input" value={trigger} onChange={(event) => setTrigger(event.target.value)}>{['SCOUT', 'PRODUCE', 'STORE', 'TURF', 'COMBAT', 'TRAVEL'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>District<input className="se-input" value={district} onChange={(event) => setDistrict(event.target.value)} /></label>
        <label>Deterministic seed<input className="se-input" value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
        <button className="se-btn" type="button" disabled={!roundPlayerId || !seed.trim()} onClick={() => void simulate()}>Simulate trigger and outcome</button>
        <button className="se-btn" type="button" disabled={!roundPlayerId || reason.trim().length < 5} onClick={() => void reward(true)}>Grant Kingpin frame</button>
        <button className="se-btn" type="button" disabled={!roundPlayerId || reason.trim().length < 5} onClick={() => void reward(false)}>Revoke tester frame</button>
        <h3>Territory encounter pools</h3>
        {Object.entries(pools).map(([trigger, entries]) => <p key={trigger}>{trigger}: {entries.map((entry) => `${entry.title} (${entry.key})`).join(', ') || 'no territory entries'}</p>)}
        {simulation ? <pre>{JSON.stringify(simulation, null, 2)}</pre> : null}
        {message ? <p role="status">{message}</p> : null}
      </div>
    </details>
  );
}
