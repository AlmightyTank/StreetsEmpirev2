import { useRef, useState } from 'react';
import { formatCents, type CasinoPageDto, type CasinoSignatureGameDto } from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
import { Button } from './Button.js';
import { Panel, Row } from './Panel.js';
import { newActionId } from '../utils/actionId.js';
import { formatWhen } from '../utils/time.js';

const SIGNATURE_LABEL: Record<CasinoSignatureGameDto, string> = {
  SLOTS: 'Slots',
  BLACKJACK: 'Blackjack',
  ROULETTE: 'Roulette',
  STREET_DICE: 'Street Dice',
  POKER: 'Poker',
};

function percent(bps: number): string {
  const value = bps / 100;
  return (Number.isInteger(value) ? value : value.toFixed(1)) + '%';
}

/**
 * 1.2.0-E. Casino status, comps, the VIP door and the Boss Trips comp hook.
 * Everything here is read from the server; status never changes any game's odds.
 */
export function CasinoStatusPanel({
  page,
  busy,
  onPage,
  onError,
}: {
  page: CasinoPageDto;
  busy: boolean;
  onPage: (next: CasinoPageDto, notice: string) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const status = page.status;
  const [working, setWorking] = useState(false);
  const compAction = useRef(newActionId());
  if (!status) return null;

  const venue = page.currentVenue;
  const room = venue?.vipRoom ?? null;
  const vip = status.vipHere;
  const comp = status.hotelComp;
  const nextNeeded = status.nextTier ? Math.max(0, status.nextTier.minTheoCents - status.theoCents) : 0;

  async function compHotel() {
    setWorking(true);
    try {
      const next = await casinoApi.compHotel({ blocks: 1, actionId: compAction.current });
      compAction.current = newActionId();
      await onPage(next, 'The house comped another block at the hotel.');
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'The front desk could not comp the room.');
    } finally {
      setWorking(false);
    }
  }

  const accent = venue?.identity?.accent.toLowerCase() ?? 'gold';

  return (
    <div className={'se-casino-status se-casino-status--' + accent}>
      <Panel title="High roller status" aside={status.tier.name}>
        <div className="se-casino-status__tier">
          <div>
            <span className="se-eyebrow">Network status</span>
            <strong>{status.tier.name}</strong>
          </div>
          <div className="se-casino-status__comps">
            <small>Comps to spend</small>
            <strong>{formatCents(status.compBalanceCents)}</strong>
          </div>
        </div>
        <div
          className="se-casino-status__meter"
          role="progressbar"
          aria-label={status.nextTier ? 'Progress to ' + status.nextTier.name : 'Top status reached'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(status.progressBps / 100)}
        >
          <span style={{ width: (status.progressBps / 100) + '%' }} />
        </div>
        <p className="se-hint">
          {status.nextTier
            ? formatCents(nextNeeded) + ' more theo to ' + status.nextTier.name + '.'
            : 'Top of the ladder. Every room in the country knows your name.'}
          {' '}Theo is each wager times the game&rsquo;s posted house edge, win or lose. True odds rate at zero.
        </p>
        <Row label="Rated theo" value={formatCents(status.theoCents)} />
        <Row label="Total action" value={formatCents(status.wageredCents)} />
        <Row label="Comp rate" value={percent(status.tier.compRateBps + status.frontCompBonusBps) + ' of theo'} />
        <Row label="Bankroll ceiling" value={formatCents(status.maxBankrollCents)} strong />
        <details className="se-casino-status__ladder">
          <summary>Status ladder</summary>
          <ol>
            {status.tiers.map((tier) => (
              <li key={tier.key} className={tier.key === status.tier.key ? 'is-current' : ''}>
                <strong>{tier.name}</strong>
                <span>{formatCents(tier.minTheoCents)} theo · {percent(tier.compRateBps)} comps · {formatCents(tier.maxBankrollCents)} bankroll</span>
              </li>
            ))}
          </ol>
          <p className="se-hint">Status opens rooms and raises limits. It never changes a deck, a wheel, a reel or a payout.</p>
        </details>
      </Panel>

      <Panel title={room ? room.name : 'VIP room'} aside={venue ? venue.name : 'No casino in reach'}>
        {venue?.identity ? (
          <p className="se-casino-status__identity">
            <em>&ldquo;{venue.identity.tagline}&rdquo;</em>
            <span>House game: {SIGNATURE_LABEL[venue.identity.signatureGame]}</span>
          </p>
        ) : null}
        {room ? (
          <>
            <p>{room.blurb}</p>
            <Row label="Door" value={room.minTierName + ' and up'} />
            {room.visitorMinBodyguards > 0 ? (
              <Row label="Visitors" value={room.visitorMinBodyguards + ' bodyguard' + (room.visitorMinBodyguards === 1 ? '' : 's') + ' at your side'} />
            ) : null}
            <p className={'se-casino-status__door' + (vip?.allowed ? ' is-open' : ' is-closed')}>
              {vip?.allowed
                ? vip.via === 'FRONT'
                  ? 'Your Casino Front crew walks you straight in.'
                  : 'The door staff wave you through. VIP tables are open.'
                : vip?.reason ?? 'The VIP room is closed to you.'}
            </p>
          </>
        ) : (
          <p className="se-muted">Get the boss into a casino city to see its VIP room.</p>
        )}

        {status.casinoFronts.length ? (
          <div className="se-casino-status__fronts">
            <span className="se-eyebrow">House pass</span>
            {status.casinoFronts.map((front) => (
              <Row
                key={front.citySlug}
                label={front.venueName + ' · ' + front.cityName}
                value={'Casino Front L' + front.level + (front.grantsVip ? ' · VIP access' : '')}
              />
            ))}
          </div>
        ) : (
          <p className="se-hint">Run a Casino Front in a casino city and that room&rsquo;s VIP door opens for you, with extra comps on its floor.</p>
        )}

        {comp ? (
          <div className="se-casino-status__hotel">
            <span className="se-eyebrow">Boss trip · {comp.cityName}</span>
            <Row label="Checked out at" value={formatWhen(comp.stayUntil)} />
            <Row label={'Comp ' + comp.blockMinutes / 60 + ' more hours'} value={formatCents(comp.blockCompCents) + ' in comps'} />
            <Button
              className="se-btn"
              type="button"
              disabledReason={comp.blockedReason ?? (busy || working ? 'Another casino action is running.' : null)}
              onClick={() => void compHotel()}
            >
              {working ? 'Calling the front desk...' : 'Comp the suite'}
            </Button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
