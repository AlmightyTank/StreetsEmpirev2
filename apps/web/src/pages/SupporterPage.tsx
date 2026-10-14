import { Link } from 'react-router-dom';
import { SupporterPanel } from '../components/SupporterPanel.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';

const SHOWCASE = [
  {
    title: 'Midnight Chrome Low-Rider',
    detail: 'A permanent chrome-and-crimson ride look for supporters.',
    image: '/items/cosmetics/rides/low-rider-midnight-chrome.webp',
  },
  {
    title: 'Signature Profile Card',
    detail: 'A public profile frame, supporter mark and banner accent.',
  },
  {
    title: 'Monthly Supporter Drops',
    detail: 'A cosmetic badge or title for each month you support.',
  },
] as const;

const BENEFITS = [
  'The Midnight Chrome collection for the Thug, Hoe, Sedan, Van and Low-Rider.',
  'The Signature Profile Card, supporter mark and supporter banner accent.',
  'A supporter badge for every month you support, plus tenure badges for cumulative paid months.',
  'Supporter voting and previews for upcoming supporter-funded drops when a vote is active.',
  'Expanded cosmetic convenience limits: 4 profile presets, 4 loadout slots, 5 notification rules and longer activity history.',
  'Optional public thank-you listing and optional release-note credit — both off unless you choose them.',
] as const;

/** Dedicated supporter page: explains the cosmetic-only value, then hosts Stripe/supporter account controls. */
export function SupporterPage() {
  // Same access model as account settings: playable accounts keep the game shell; blocked/pre-join accounts get the plain shell.
  const canPlay = useSession((s) => Boolean(s.me && !s.account?.verificationRequired && !s.account?.rulesAcceptanceRequired));
  const Frame = canPlay ? GameLayout : Shell;

  return (
    <Frame>
      <div className="se-supporter-page">
        <section className="se-supporter-hero" aria-labelledby="supporter-title">
          <div className="se-supporter-hero__copy">
            <span className="se-eyebrow">Support the project · Cosmetic only</span>
            <h1 id="supporter-title">Keep StreetsEmpire running without buying power.</h1>
            <p>
              Supporting funds hosting and development while keeping seasons fair. No cash, turns, weapons,
              product, combat strength or hidden intelligence is ever sold here.
            </p>
            <div className="se-supporter-hero__actions">
              <a className="se-btn se-btn--primary" href="#supporting">Manage or start support</a>
              <Link className="se-btn se-btn--ghost" to="/game/profile">Preview your profile</Link>
            </div>
          </div>
          <div className="se-supporter-hero__card" aria-hidden="true">
            <span>Midnight Chrome</span>
            <strong>Supporter rewards</strong>
            <small>Permanent cosmetics · monthly drops · community credit</small>
          </div>
        </section>

        <section className="se-supporter-showcase" aria-label="Supporter reward showcase">
          {SHOWCASE.map((item) => (
            <article className="se-supporter-showcase__item" key={item.title}>
              <div className="se-supporter-showcase__art">
                {'image' in item ? <img src={item.image} alt="" loading="lazy" /> : <span>{item.title.slice(0, 1)}</span>}
              </div>
              <div>
                <h2>{item.title}</h2>
                <p>{item.detail}</p>
              </div>
            </article>
          ))}
        </section>

        <div className="se-supporter-grid">
          <Panel title="What supporters get">
            <ul className="se-supporter-benefits">
              {BENEFITS.map((benefit) => <li key={benefit}>{benefit}</li>)}
            </ul>
          </Panel>
          <Panel title="Fair-play promise">
            <p>
              Supporter rewards are visual, profile and account-comfort perks only. They do not change action outcomes,
              season ranking strength, combat math, casino odds, scouting, supplies or economy output.
            </p>
            <p className="se-hint">If you stop supporting, permanent rewards you already earned stay on your account.</p>
          </Panel>
        </div>

        <SupporterPanel />
      </div>
    </Frame>
  );
}
