export interface AnchorCandidate {
  id: string;
  top: number;
  /** The acted-on card, or a section that contains it. */
  containsCard: boolean;
  fixedOrSticky: boolean;
  visible: boolean;
}

export interface QuestViewportAnchor {
  scrollY: number;
  aboveId: string | null;
  aboveTop: number | null;
}

/**
 * The closest laid-out element above the card the player just accepted or
 * collected. Following the card itself throws the window into whichever group
 * the board moved that job to.
 */
export function nearestAnchorAbove(cardTop: number, candidates: readonly AnchorCandidate[]): { id: string; top: number } | null {
  let best: { id: string; top: number } | null = null;
  for (const candidate of candidates) {
    if (!candidate.id || !candidate.visible || candidate.fixedOrSticky || candidate.containsCard) continue;
    if (!Number.isFinite(candidate.top) || candidate.top >= cardTop - 1) continue;
    if (!best || candidate.top > best.top) best = { id: candidate.id, top: candidate.top };
  }
  return best;
}

/** Keep that anchor on the same pixel after the board reflows. */
export function nextQuestViewportTop(
  anchor: Pick<QuestViewportAnchor, 'scrollY' | 'aboveTop'>,
  aboveTopAfter: number | null,
): number {
  if (anchor.aboveTop === null || aboveTopAfter === null) return Math.max(0, anchor.scrollY);
  return Math.max(0, anchor.scrollY + (aboveTopAfter - anchor.aboveTop));
}

export function captureQuestViewport(questKey: string): QuestViewportAnchor {
  const scrollY = window.scrollY;
  const card = document.getElementById(`quest-${questKey}`);
  if (!card) return { scrollY, aboveId: null, aboveTop: null };
  const cardTop = card.getBoundingClientRect().top;
  const candidates: AnchorCandidate[] = [];
  for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
    const style = getComputedStyle(element);
    candidates.push({
      id: element.id,
      top: element.getBoundingClientRect().top,
      containsCard: element.contains(card),
      fixedOrSticky: style.position === 'fixed' || style.position === 'sticky',
      visible: element.getClientRects().length > 0,
    });
  }
  const above = nearestAnchorAbove(cardTop, candidates);
  return { scrollY, aboveId: above?.id ?? null, aboveTop: above?.top ?? null };
}

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/** The pin stays up for the whole request. `settleAt` starts only after the board update lands. */
export function pinStillHolding(now: number, settleAt: number | null): boolean {
  return settleAt === null || now < settleAt;
}

export interface QuestViewportPin {
  /** Stop immediately. Player scrolling and leaving the page use this. */
  stop: () => void;
  /** The quest update has been applied. Keep correcting while the board reflows. */
  settle: () => void;
}

/**
 * Virtuoso lists on this page share the window scroller. Accepting or
 * collecting a job changes several of them at once, and each one compensates
 * scroll on its own. Hold the pre-action anchor until the caller says the
 * update has landed, then briefly after that so the reflow can finish.
 */
export function pinQuestViewport(anchor: QuestViewportAnchor, settleMs = 800): QuestViewportPin {
  const noop: QuestViewportPin = { stop: () => undefined, settle: () => undefined };
  if (typeof window === 'undefined') return noop;
  let frame = 0;
  let stopped = false;
  let settleAt: number | null = null;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frame) window.cancelAnimationFrame(frame);
    window.removeEventListener('wheel', stop, true);
    window.removeEventListener('touchstart', stop, true);
    window.removeEventListener('pointerdown', stop, true);
    window.removeEventListener('keydown', onKey, true);
  };
  const settle = () => {
    if (stopped || settleAt !== null) return;
    settleAt = performance.now() + settleMs;
  };
  const onKey = (event: KeyboardEvent) => {
    if (SCROLL_KEYS.has(event.key)) stop();
  };
  const restore = () => {
    frame = 0;
    if (stopped) return;
    const above = anchor.aboveId ? document.getElementById(anchor.aboveId) : null;
    const top = nextQuestViewportTop(anchor, above ? above.getBoundingClientRect().top : null);
    if (Math.abs(window.scrollY - top) > 1) {
      window.scrollTo({ top, left: window.scrollX, behavior: 'auto' });
    }
    if (!pinStillHolding(performance.now(), settleAt)) {
      stop();
      return;
    }
    frame = window.requestAnimationFrame(restore);
  };
  window.addEventListener('wheel', stop, { capture: true, passive: true });
  window.addEventListener('touchstart', stop, { capture: true, passive: true });
  window.addEventListener('pointerdown', stop, true);
  window.addEventListener('keydown', onKey, true);
  frame = window.requestAnimationFrame(restore);
  return { stop, settle };
}

/** Deep links scroll once. Later board updates must not scroll back to them. */
export function shouldScrollFocusedQuest(input: {
  focusKey: string | null;
  requestId: number;
  handledRequestId: number;
  questIndex: number;
}): boolean {
  if (!input.focusKey || input.questIndex < 0) return false;
  if (input.requestId <= 0 || input.handledRequestId === input.requestId) return false;
  return true;
}
