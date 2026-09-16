import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import type { ProduceCrackResult, ProductTypeDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { actionsApi } from '../api/actions.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { TurnSpend } from '../components/TurnSpend.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

const PRODUCT_PROFILES: Array<{ key: ProductTypeDto; name: string; role: string }> = [
  { key: 'WEED', name: 'Weed', role: 'Safe baseline product for keeping the block supplied.' },
  { key: 'COKE', name: 'Coke', role: 'High-demand product for bigger money runs.' },
  { key: 'DOWNERS', name: 'Downers', role: 'Utility supply for keeping unhappy people listening.' },
  { key: 'ECSTASY', name: 'Ecstasy', role: 'Nightlife product for timing-heavy street work.' },
  { key: 'HEROIN', name: 'Heroin', role: 'Dangerous top-end product with future risk hooks.' },
  { key: 'ACID', name: 'Acid', role: 'Niche product for swingy, event-driven demand.' },
];

export function ProducePage() {
  const me = useSession((s) => s.me);
  const action = useGameAction<ProduceCrackResult>();

  const [turns, setTurns] = useState<number | ''>(10);
  const [productType, setProductType] = useState<ProductTypeDto>('WEED');

  if (!me) return <Navigate to="/join" replace />;

  const available = me.turns.turns;
  const hasFitThugs = me.resources.fitThugs > 0;
  const selectedProfile = PRODUCT_PROFILES.find((profile) => profile.key === productType) ?? PRODUCT_PROFILES[0]!;
  const producedName = action.result?.result.productName ?? selectedProfile.name;
  const workshopBonusProduct = action.result?.result.hideoutBonusProduct ?? action.result?.result.hideoutBonusCrack ?? 0;
  const backOfficeBonusCents = action.result?.result.hideoutBonusCents ?? 0;
  const canProduce =
    !action.busy &&
    hasFitThugs &&
    typeof turns === 'number' &&
    turns >= 1 &&
    turns <= available;
  const produceBlock = action.busy
    ? 'The last batch is still producing.'
    : !hasFitThugs
      ? 'Production takes a fit thug. Scout for more, buy some at Tommy\u2019s, or let the wounded recover.'
      : typeof turns !== 'number' || turns < 1
        ? 'Say how many turns to spend - at least one.'
        : turns > available
          ? `You only have ${formatNumber(available)} turns.`
          : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canProduce || typeof turns !== 'number') return;

    await action.run((actionId) => actionsApi.produceCrack({ turns, productType, actionId }));
  }

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Produce Product</h1>
          <p className="se-eyebrow">Turns and money in, product out</p>
        </div>
      </div>

      {action.error ? <Alert>{action.error}</Alert> : null}
      {!hasFitThugs ? (
        <Alert tone="info">
          You need at least one fit thug to produce. Scout for more, pick some up at
          Tek9 Tommy&rsquo;s, or let the wounded recover.
        </Alert>
      ) : null}

      <div className="se-grid se-grid--sidebar">
        <Panel title="Produce">
          <form onSubmit={onSubmit}>
            <div className="se-field">
              <span className="se-label">Batch</span>
              <div className="se-choices se-product-choices">
                {PRODUCT_PROFILES.map((profile) => (
                  <label
                    className={`se-choice${productType === profile.key ? ' se-choice--on' : ''}`}
                    key={profile.key}
                  >
                    <input
                      type="radio"
                      name="productType"
                      className="se-choice__input"
                      checked={productType === profile.key}
                      disabled={action.busy || !hasFitThugs}
                      onChange={() => setProductType(profile.key)}
                    />
                    <span className="se-choice__body">
                      <span className="se-choice__name">{profile.name}</span>
                      <span className="se-choice__meta">{profile.role}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <TurnSpend
              value={turns}
              onChange={setTurns}
              available={available}
              disabled={action.busy || !hasFitThugs}
              disabledReason={action.busy ? 'The last batch is still producing.' : !hasFitThugs ? 'Production takes a fit thug, and none of yours can work.' : null}
            />

            <Button className="se-btn se-btn--primary se-btn--block" disabledReason={produceBlock}>
              {action.busy ? 'Producing...' : `Produce ${selectedProfile.name}`}
            </Button>
          </form>

          <p className="se-hint">
            Thugs handle production, so a batch is only as good as their happiness
            &mdash; and the girls still work while they produce, just for a
            fraction of a scouted night. What you get for that lost income is
            product at the workshop price, against Pip&rsquo;s markup for finished supply.
          </p>
        </Panel>

        {/*
          Manual 3.2 sends the girls out too, so production is not a thugs-only
          screen: the same crew, cut and shelf apply as on a scouting trip.
          This mirrors the scouting sidebar for that reason.
        */}
        <aside className="se-grid">
          <Panel title="The crew" flush>
            <div className="se-rows">
              <Row
                label="Turns"
                value={`${formatNumber(me.turns.turns)} / ${formatNumber(me.turns.turnCap)}`}
                strong
              />
              <Row label="Whores" value={formatNumber(me.resources.whores)} strong />
              <Row label="Thugs" value={formatNumber(me.resources.thugs)} strong />
              {me.resources.woundedThugs > 0 ? <Row label="Fit / wounded" value={`${formatNumber(me.resources.fitThugs)} / ${formatNumber(me.resources.woundedThugs)}`} /> : null}
              <Row label="They keep" value={`${me.payoutPercent}%`} />
              <Row label="You keep" value={`${100 - me.payoutPercent}%`} />
              <Row label="Whore happiness" value={`${me.happiness.whore}%`} />
              <Row label="Thug happiness" value={`${me.happiness.thug}%`} />
            </div>
          </Panel>

          {/* Production burns the shelf the same way a trip does. */}
          <Panel title="Supplies for the run" flush>
            <div className="se-rows">
              <Row label="Condoms" value={formatNumber(me.resources.condoms)} />
              <Row label="Medicine" value={formatNumber(me.resources.medicine)} />
              <Row label="Product" value={formatNumber(me.resources.product)} />
              <Row label="Beer" value={formatNumber(me.resources.beer)} />
              <Row label="Cash" value={formatCents(me.resources.cashCents)} strong />
            </div>
          </Panel>
        </aside>
      </div>

      {action.result ? (
        <div className="se-mt">
          {/*
            Cash moves twice on this receipt - ingredients out, then the
            girls' takings in - so each money line carries the balance at
            that point rather than the final total repeated twice.
          */}
          <ActionResult
            title={`${producedName} Production Results`}
            onDismiss={action.clear}
            result={action.result}
            lines={[
              { label: 'Turns used', value: formatNumber(action.result.result.turnsUsed) },

              // The batch itself.
              {
                label: 'Product produced',
                delta: action.result.result.productProduced,
                remaining: action.result.after.resources.product,
              },
              ...(workshopBonusProduct > 0
                ? [
                    {
                      label: 'Workshop bonus',
                      value: `${formatNumber(workshopBonusProduct)} included`,
                    },
                  ]
                : []),
              {
                label: 'Ingredients',
                delta: -action.result.result.ingredientCents,
                money: true,
                remaining:
                  action.result.before.cashCents - action.result.result.ingredientCents,
              },
              ...(action.result.result.limitedByCash
                ? [{ label: 'Short on cash', value: 'batch cut down', muted: true }]
                : []),

              // Manual 3.2: the girls are still out while the thugs produce.
              {
                label: 'Brought in',
                value: formatCents(action.result.result.grossEarnedCents),
              },
              {
                label: `Their cut (${action.result.result.payoutPercent}%)`,
                delta: -action.result.result.crewTakeCents,
                money: true,
                muted: true,
              },
              {
                label: 'Your cut',
                delta: action.result.result.cashEarnedCents,
                money: true,
                remaining:
                  action.result.before.cashCents -
                  action.result.result.ingredientCents +
                  action.result.result.cashEarnedCents,
              },
              ...(backOfficeBonusCents > 0
                ? [
                    {
                      label: 'Back Office bonus',
                      value: `${formatCents(backOfficeBonusCents)} included`,
                    },
                  ]
                : []),
              ...(action.result.result.crackFound > 0
                ? [
                    {
                      label: 'Product found',
                      delta: action.result.result.crackFound,
                      remaining: action.result.after.resources.product,
                    },
                  ]
                : []),

              // What the shift cost the shelf.
              {
                label: 'Condoms used',
                delta: -action.result.result.condomsUsed,
                remaining: action.result.after.resources.condoms,
                muted: true,
              },
              ...(action.result.result.condomsMissing > 0
                ? [
                    {
                      label: 'Worked without condoms',
                      value: `${formatNumber(action.result.result.condomsMissing)} short`,
                    },
                  ]
                : []),
              {
                label: 'Product used',
                delta: -action.result.result.crackUsed,
                remaining: action.result.after.resources.product,
                muted: true,
              },
              {
                label: 'Beer used',
                delta: -action.result.result.beerUsed,
                remaining: action.result.after.resources.beer,
                muted: true,
              },

              ...(action.result.result.infected > 0
                ? [
                    {
                      label: 'Caught something',
                      delta: -action.result.result.infected,
                    },
                    ...(action.result.result.treated > 0
                      ? [
                          {
                            label: 'Treated with medicine',
                            delta: -action.result.result.medicineUsed,
                            remaining: action.result.after.resources.medicine,
                            muted: true,
                          },
                        ]
                      : []),
                    ...(action.result.result.lostToInfection > 0
                      ? [
                          {
                            label: 'Lost, no medicine',
                            delta: -action.result.result.lostToInfection,
                            remaining: action.result.after.resources.whores,
                          },
                        ]
                      : []),
                  ]
                : []),
              ...(action.result.result.whoresLeft > 0
                ? [
                    {
                      label: 'Whores walked out',
                      delta: -action.result.result.whoresLeft,
                      remaining: action.result.after.resources.whores,
                    },
                  ]
                : []),
              ...(action.result.result.thugsLeft > 0
                ? [
                    {
                      label: 'Thugs walked out',
                      delta: -action.result.result.thugsLeft,
                      remaining: action.result.after.resources.thugs,
                    },
                  ]
                : []),

              {
                label: 'Turns remaining',
                value: formatNumber(action.result.result.turnsRemaining),
              },
            ]}
          />
        </div>
      ) : null}
    </GameLayout>
  );
}
