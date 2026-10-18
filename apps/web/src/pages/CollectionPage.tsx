import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collectionCovers, profileNameParts, type AvatarParts } from '@streets/shared';
import { authApi } from '../api/auth.js';
import { Alert } from '../components/Alert.js';
import { AvatarPortrait } from '../components/BuiltAvatar.js';
import { CareerGuidance, CareerMetricStrip, CareerNavigation } from '../components/CareerExperience.js';
import { ItemTile } from '../components/ItemTile.js';
import { SiteThemeDecor } from '../components/SiteThemeDecor.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { usePageTheme } from '../stores/pageTheme.js';
import { useSession } from '../stores/session.js';
import { ITEM_ART, type ItemArtKey } from '../items/itemArt.js';
import {
  buildCollectionCatalog,
  buildItemLooks,
  entriesForTab,
  type CollectionEntry,
  type CollectionTab,
  type ItemLookEntry,
} from '../utils/collectionCatalog.js';

const TABS: { key: CollectionTab; label: string; blurb: string }[] = [
  { key: 'themes', label: 'Themes', blurb: 'Full game-shell looks.' },
  { key: 'items', label: 'Item looks', blurb: 'Art collections for weapons, rides, products, supplies and crew.' },
  { key: 'titles', label: 'Titles & badges', blurb: 'Permanent profile titles and badges.' },
  { key: 'frames', label: 'Frames & accents', blurb: 'Profile frames, avatar frames and accent colors.' },
];

/** Candidates for the item-look preview strip, in showcase order. Single-cell
 * art comes first so three previews sit side by side; wide rides anchor the
 * collections that only dress vehicles and crew. */
const PREVIEW_ITEMS: readonly ItemArtKey[] = [
  'PISTOL', 'TEK9', 'THUG', 'HOE', 'WEED', 'METH', 'CRACK', 'LOW_RIDER', 'SEDAN', 'VAN',
] as const;

function previewItemsFor(style: string, count = 3): ItemArtKey[] {
  const covered = PREVIEW_ITEMS.filter((item) => collectionCovers(style, item));
  // Single-cell art sits three-across; wide tiles drop to their own row.
  const single = covered.filter((item) => ITEM_ART[item].cells[0] === 1);
  const wide = covered.filter((item) => ITEM_ART[item].cells[0] !== 1);
  const picked = [...single, ...wide].slice(0, count);
  return picked.length ? picked : ['PISTOL'];
}

function playerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 1
    ? `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase()
    : (words[0]?.slice(0, 2) ?? 'SE').toUpperCase();
}

function SourceLine({ label }: { label: string }) {
  return (
    <p className="se-collection-card__source">
      <span>How to earn</span>
      <strong>{label}</strong>
    </p>
  );
}

function OwnedBadge({ owned }: { owned: boolean }) {
  return (
    <span className={`se-collection-card__own${owned ? ' is-owned' : ''}`}>
      {owned ? 'Owned' : 'Not yet earned'}
    </span>
  );
}

function CardHead({ name, rarity }: { name: string; rarity: string }) {
  return (
    <div className="se-collection-card__head">
      <strong>{name}</strong>
      <span className={`se-collection-card__rarity se-collection-card__rarity--${rarity}`}>{rarity}</span>
    </div>
  );
}

/** A theme card previews the actual shell: theme tokens plus its animated decor. */
function ThemePreview({ entry }: { entry: CollectionEntry }) {
  const styleKey = entry.styleKey ?? entry.key;
  return (
    <div className={`se-collection-theme se-site-theme--${styleKey}`} aria-hidden="true">
      <SiteThemeDecor themeKey={styleKey} />
      <div className="se-collection-theme__topbar">
        <strong>STREETS<em>EMPIRE</em></strong>
      </div>
      <div className="se-collection-theme__stats">
        <span><small>CASH</small><strong>$19K</strong></span>
        <span><small>TURNS</small><strong>144</strong></span>
        <span><small>HEAT</small><strong>0</strong></span>
      </div>
      <div className="se-collection-theme__panel">
        <small>HOME BASE</small>
        <strong>{entry.name}</strong>
        <span className="se-btn se-btn--primary se-btn--sm">Scout</span>
      </div>
    </div>
  );
}

/**
 * Themes are shown one at a time: each preview mounts its animated scene,
 * so only the visible theme's decor ever runs.
 */
function ThemeShowcase({ themes, ownedThemes }: { themes: CollectionEntry[]; ownedThemes: Set<string> | null }) {
  const [index, setIndex] = useState(0);
  const [previewOn, setPreviewOn] = useState(true);
  const setPageTheme = usePageTheme((s) => s.setThemeKey);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const active = themes[Math.min(index, Math.max(0, themes.length - 1))];

  // Trying a theme takes over the whole shell — sidebar and topbar included —
  // like visiting a themed profile. Leaving the viewer restores your own theme.
  useEffect(() => {
    if (!active) return;
    setPageTheme(previewOn ? active.key : null, true);
    return () => setPageTheme(null);
  }, [active, previewOn, setPageTheme]);

  if (!active) return null;

  return (
    <section aria-label="Themes" className="se-collection-showcase">
      <div className="se-collection-themebar" role="status">
        <span>
          {previewOn
            ? `Previewing ${active.name} across this page.`
            : 'Theme preview off — this page uses your own theme.'}
        </span>
        <button type="button" className="se-btn se-btn--sm" onClick={() => setPreviewOn((current) => !current)}>
          {previewOn ? 'Stop preview' : 'Preview theme'}
        </button>
      </div>
      <article
        className="se-collection-showcase__stage"
        data-no-tab-swipe
        aria-label={`${active.name} preview`}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          swipeStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          if (!start || themes.length < 2) return;
          const deltaX = event.clientX - start.x;
          const deltaY = event.clientY - start.y;
          if (Math.abs(deltaX) < 44 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
          setIndex((current) => (current + (deltaX < 0 ? 1 : -1) + themes.length) % themes.length);
        }}
        onPointerCancel={() => { swipeStart.current = null; }}
      >
        <ThemePreview entry={active} />
      </article>
      <nav className="se-collection-showcase__nav" aria-label="Theme previews">
        <button
          type="button"
          className="se-collection-showcase__arrow"
          aria-label="Previous theme"
          onClick={() => setIndex((current) => (current - 1 + themes.length) % themes.length)}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <span className="se-collection-showcase__current" role="status" aria-live="polite" aria-atomic="true">
          <strong>{index + 1} / {themes.length}</strong>
          <span>{active.name}</span>
        </span>
        <button
          type="button"
          className="se-collection-showcase__arrow"
          aria-label="Next theme"
          onClick={() => setIndex((current) => (current + 1) % themes.length)}
        >
          <span aria-hidden="true">›</span>
        </button>
      </nav>
      <div className="se-collection-showcase__details">
        <CardHead name={active.name} rarity={active.rarity} />
        <p className="se-muted">{active.description}</p>
        <SourceLine label={active.source.label} />
        <div className="se-collection-showcase__foot">
          <OwnedBadge owned={ownedThemes?.has(active.key) ?? false} />
          <label className="se-collection-showcase__jump">
            <span className="se-hint">Jump to</span>
            <select
              className="se-input"
              value={active.key}
              onChange={(event) => {
                const next = themes.findIndex((theme) => theme.key === event.target.value);
                if (next >= 0) setIndex(next);
              }}
            >
              {themes.map((theme) => (
                <option key={theme.key} value={theme.key}>{theme.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}

function ItemLookCard({ look, owned }: { look: ItemLookEntry; owned: boolean }) {
  return (
    <article className={`se-collection-card${owned ? ' is-owned' : ''}`}>
      <div className="se-collection-looks" aria-hidden="true">
        {previewItemsFor(look.style).map((item) => (
          <ItemTile key={item} item={item} cosmeticStyle={look.style} />
        ))}
      </div>
      <CardHead name={look.label} rarity={look.fullCollection ? 'full collection' : 'selected items'} />
      <p className="se-muted">{look.description}</p>
      {!look.fullCollection ? (
        <p className="se-hint">Drawn for selected items and crew only.</p>
      ) : null}
      <SourceLine label={look.source.label} />
      <OwnedBadge owned={owned} />
    </article>
  );
}

/** A title card shows the title worn with the viewer's own name. */
function TitleCard({ entry, owned, displayName }: { entry: CollectionEntry; owned: boolean; displayName: string }) {
  return (
    <article className={`se-collection-card${owned ? ' is-owned' : ''}`}>
      <div className="se-collection-title" aria-label={`${displayName} ${entry.name}`}>
        {profileNameParts(displayName, entry.name).map((part, index) => (
          <span className={`se-collection-title__part se-collection-title__part--${part.kind}`} key={index}>
            {part.text}
          </span>
        ))}
      </div>
      <CardHead name={entry.name} rarity={entry.rarity} />
      <p className="se-muted">{entry.description}</p>
      <SourceLine label={entry.source.label} />
      <OwnedBadge owned={owned} />
    </article>
  );
}

interface Portrait {
  imageUrl: string | null | undefined;
  avatar: AvatarParts | null | undefined;
  fallback: string;
}

/** A frame card shows the viewer's avatar inside the frame; accents show their color. */
function FrameCard({ entry, owned, portrait }: {
  entry: CollectionEntry;
  owned: boolean;
  portrait: Portrait;
}) {
  if (entry.kind === 'ACCENT') {
    return (
      <article className={`se-collection-card${owned ? ' is-owned' : ''}`}>
        <div className={`se-collection-accent se-site-accent--${entry.key}`} aria-hidden="true">
          <strong>{portrait.fallback}</strong>
          <span className="se-collection-accent__chip" />
          <span className="se-collection-accent__chip se-collection-accent__chip--dim" />
        </div>
        <CardHead name={entry.name} rarity={entry.rarity} />
        <p className="se-muted">{entry.description}</p>
        <SourceLine label={entry.source.label} />
        <OwnedBadge owned={owned} />
      </article>
    );
  }
  return (
    <article className={`se-collection-card${owned ? ' is-owned' : ''}`}>
      <div className="se-collection-frame" aria-hidden="true">
        <AvatarPortrait
          imageUrl={portrait.imageUrl}
          avatar={portrait.avatar}
          fallback={portrait.fallback}
          frameKey={entry.styleKey ?? entry.catalogKey}
        />
      </div>
      <CardHead name={entry.name} rarity={entry.rarity} />
      <p className="se-muted">{entry.description}</p>
      <SourceLine label={entry.source.label} />
      <OwnedBadge owned={owned} />
    </article>
  );
}

export function CollectionPage() {
  const [tab, setTab] = useState<CollectionTab>('themes');
  const [ownedThemes, setOwnedThemes] = useState<Set<string> | null>(null);
  const [ownedFrames, setOwnedFrames] = useState<Set<string> | null>(null);
  const [ownedAccents, setOwnedAccents] = useState<Set<string> | null>(null);
  const [ownedBadges, setOwnedBadges] = useState<Set<string> | null>(null);
  const [ownedLooks, setOwnedLooks] = useState<Set<string> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const displayName = useSession((s) => s.me?.displayName ?? s.account?.username ?? 'YOU');
  const profileImageUrl = useSession((s) => s.profileSettings.profileImageUrl);
  const profileAvatar = useSession((s) => s.profileSettings.profileAvatar);

  const catalog = useMemo(() => buildCollectionCatalog(), []);
  const looks = useMemo(() => buildItemLooks(catalog), [catalog]);

  useEffect(() => {
    let live = true;
    authApi.profileSettings()
      .then((response) => {
        if (!live) return;
        setOwnedThemes(new Set(response.options.themes.map((option) => option.key)));
        setOwnedFrames(new Set(response.options.frames.map((option) => option.key)));
        setOwnedAccents(new Set(response.options.accents.map((option) => option.key)));
        setOwnedBadges(new Set([
          ...response.options.titles.map((option) => option.key),
          ...response.options.badges.map((option) => option.key),
        ]));
        setOwnedLooks(new Set(
          (response.options.itemStyles ?? []).filter((option) => !option.locked).map((option) => option.key),
        ));
        setLoadError(null);
      })
      .catch(() => {
        if (!live) return;
        // Offline fallback: only Classic is known to be owned.
        setOwnedThemes(new Set());
        setOwnedFrames(new Set());
        setOwnedAccents(new Set());
        setOwnedBadges(new Set());
        setOwnedLooks(new Set(['classic']));
        setLoadError('Could not load which looks you own. Everything is still listed below.');
      });
    return () => { live = false; };
  }, []);

  const counts = useMemo(() => ({
    themes: entriesForTab(catalog, 'themes'),
    titles: entriesForTab(catalog, 'titles'),
    frames: entriesForTab(catalog, 'frames'),
  }), [catalog]);

  const ownedCount =
    (ownedThemes ? counts.themes.filter((e) => ownedThemes.has(e.key)).length : 0)
    + (ownedBadges ? counts.titles.filter((e) => ownedBadges.has(e.catalogKey) || ownedBadges.has(e.key)).length : 0)
    + (ownedFrames || ownedAccents
      ? counts.frames.filter((e) => ownedFrames?.has(e.key) || ownedAccents?.has(e.key)).length
      : 0)
    + (ownedLooks ? looks.filter((l) => ownedLooks.has(l.style)).length : 0);
  const totalCount = counts.themes.length + counts.titles.length + counts.frames.length + looks.length;

  const portrait = {
    imageUrl: profileImageUrl ?? null,
    avatar: profileAvatar ?? null,
    fallback: playerInitials(displayName),
  };
  const pageThemeKey = usePageTheme((s) => s.themeKey);

  return (
    <GameLayout>
      <div className={`se-collection${pageThemeKey ? ` se-collection--themed se-site-theme--${pageThemeKey}` : ''}`}>
        <CareerNavigation active="collection" />
        <header className="se-collection-hero">
          <div>
            <span className="se-eyebrow">Permanent · account-wide</span>
            <h1>Collection</h1>
            <p>
              Every earnable look in one showcase, shown as it really appears, with how to earn it.
              Hidden Easter-egg looks stay secret until you find them.
            </p>
          </div>
          <CareerMetricStrip
            label="Collection summary"
            items={[
              { label: 'Owned', value: `${ownedCount} / ${totalCount}`, tone: 'accent' },
              { label: 'Themes', value: String(counts.themes.length) },
              { label: 'Item looks', value: String(looks.length) },
            ]}
          />
        </header>

        {loadError ? <Alert>{loadError}</Alert> : null}

        <div className="se-collection-tabs" role="tablist" aria-label="Collection categories">
          {TABS.map((candidate) => (
            <button
              key={candidate.key}
              type="button"
              role="tab"
              aria-selected={tab === candidate.key}
              className={`se-collection-tab${tab === candidate.key ? ' is-active' : ''}`}
              onClick={() => setTab(candidate.key)}
            >
              <strong>{candidate.label}</strong>
              <small>{candidate.blurb}</small>
            </button>
          ))}
        </div>

        {tab === 'items' ? (
          <section aria-label="Item looks" className="se-collection-grid">
            {looks.map((look) => (
              <ItemLookCard key={look.style} look={look} owned={ownedLooks?.has(look.style) ?? look.style === 'classic'} />
            ))}
          </section>
        ) : tab === 'themes' ? (
          <ThemeShowcase themes={counts.themes} ownedThemes={ownedThemes} />
        ) : tab === 'titles' ? (
          <section aria-label="Titles and badges" className="se-collection-grid">
            {counts.titles.map((entry) => (
              <TitleCard
                key={entry.key}
                entry={entry}
                displayName={displayName}
                owned={(ownedBadges?.has(entry.catalogKey) || ownedBadges?.has(entry.key)) ?? false}
              />
            ))}
          </section>
        ) : (
          <section aria-label="Frames and accents" className="se-collection-grid">
            {counts.frames.map((entry) => (
              <FrameCard
                key={entry.key}
                entry={entry}
                portrait={portrait}
                owned={(ownedFrames?.has(entry.key) || ownedAccents?.has(entry.key)) ?? false}
              />
            ))}
          </section>
        )}

        <CareerGuidance title="Where to equip what you earn" summary="How the collection works">
          <p>
            Equip themes, frames, titles and item looks from <Link to="/account">account settings</Link>.
            Street Pass rewards are claimed on the <Link to="/game/street-pass">Street Pass</Link> page;
            supporter looks live on the <Link to="/game/supporter">supporter</Link> page.
          </p>
          <p>Easter-egg looks are hidden on purpose: they appear here only after you have earned them.</p>
        </CareerGuidance>
      </div>
    </GameLayout>
  );
}
