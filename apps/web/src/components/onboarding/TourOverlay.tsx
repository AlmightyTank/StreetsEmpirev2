import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TOUR_STEP_KEYS, type OnboardingStateDto, type TourStepKey } from '@streets/shared';
import { TOUR_STEPS } from '../../help/catalog.js';
import { useOnboarding } from '../../stores/onboarding.js';

export function tourStepIndex(step: TourStepKey | null): number {
  if (!step) return -1;
  return TOUR_STEP_KEYS.indexOf(step);
}

/** First step at or after the current one that is still open, for Next/Back. */
export function neighborStep(steps: Array<{ key: TourStepKey; done: boolean }>, current: TourStepKey, direction: 1 | -1): TourStepKey | null {
  const order = steps.map((step) => step.key);
  let index = order.indexOf(current) + direction;
  while (index >= 0 && index < order.length) {
    const key = order[index]!;
    if (!steps.find((step) => step.key === key)?.done) return key;
    index += direction;
  }
  return null;
}

/** Adjacent walkthrough step, including completed steps, for explicit arrow navigation. */
export function adjacentStep(current: TourStepKey, direction: 1 | -1, steps: readonly TourStepKey[] = TOUR_STEP_KEYS): TourStepKey | null {
  const index = steps.indexOf(current) + direction;
  return index >= 0 && index < steps.length ? steps[index]! : null;
}

type TargetRect = { top: number; left: number; width: number; height: number };

/**
 * Guided walkthrough spotlight. Highlights the current step's real action
 * without ever blocking the page: the overlay itself ignores pointer events
 * and only the tooltip card takes focus and clicks.
 */
export function TourOverlay({ tour: tourOverride }: { tour?: OnboardingStateDto['tour'] }) {
  const storeTour = useOnboarding((s) => s.state?.tour ?? null);
  const tour = tourOverride ?? storeTour;
  const act = useOnboarding((s) => s.act);
  const navigate = useNavigate();
  const location = useLocation();
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const cardRef = useRef<HTMLElement>(null);

  const step = tour?.step ?? null;
  const copy = step ? TOUR_STEPS[step] : null;
  const visible = Boolean(tour && tour.active && !tour.dismissed && !tour.complete && step && copy);

  const measure = useCallback(() => {
    if (!copy || typeof document === 'undefined') return;
    const target = document.querySelector(`[data-tour="${copy.target}"]`);
    if (!target) {
      setRect(null);
      return;
    }
    const box = target.getBoundingClientRect();
    setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
  }, [copy]);

  useEffect(() => {
    if (!visible || !copy) return;
    const markTargets = () => {
      document.querySelectorAll(`[data-tour="${copy.target}"]`).forEach((element, index) => {
        element.classList.add('se-tour__page-target');
        element.classList.toggle('se-tour__page-target--blocked', index > 0);
        element.setAttribute('data-tour-focus', index === 0 ? 'active' : 'blocked');
      });
    };
    measure();
    markTargets();
    const target = document.querySelector(`[data-tour="${copy.target}"]`);
    const observer = target && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (observer && target) observer.observe(target);
    const mutationObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => {
      markTargets();
      measure();
    }) : null;
    mutationObserver?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      document.querySelectorAll(`[data-tour="${copy.target}"]`).forEach((element) => {
        element.classList.remove('se-tour__page-target', 'se-tour__page-target--blocked');
        element.removeAttribute('data-tour-focus');
      });
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      observer?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [visible, measure]);

  // Every guided destination owns its target, but the walkthrough owns the
  // promise that "Go to the action" leaves that target in view. This covers
  // pages that do not need a bespoke destination effect.
  useEffect(() => {
    if (!visible || !copy || typeof window === 'undefined') return;
    let firstFrame = 0;
    let secondFrame = 0;
    const scrollTargetIntoView = () => {
      const target = document.querySelector(`[data-tour="${copy.target}"]`);
      if (!target) return;
      target.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    };
    firstFrame = window.requestAnimationFrame(() => {
      scrollTargetIntoView();
      secondFrame = window.requestAnimationFrame(scrollTargetIntoView);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [visible, copy, location.pathname]);

  useEffect(() => {
    if (!visible) return;
    cardRef.current?.focus();
    const measureCard = () => {
      const height = cardRef.current?.getBoundingClientRect().height;
      if (height && height !== cardHeight) setCardHeight(height);
    };
    measureCard();
    const cardObserver = cardRef.current && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measureCard)
      : null;
    if (cardObserver && cardRef.current) cardObserver.observe(cardRef.current);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void act({ action: 'dismiss-tour' });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      cardObserver?.disconnect();
    };
  }, [visible, act, cardHeight]);

  if (!visible || !tour || !step || !copy) return null;

  const stepOrder = tour.steps.map((item) => item.key);
  const index = stepOrder.indexOf(step);
  const previous = adjacentStep(step, -1, stepOrder);
  const next = adjacentStep(step, 1, stepOrder);
  const anchored = Boolean(rect);
  const preferAbove = copy.target === 'build-street-sign' || copy.target === 'scout-plan' || copy.target === 'produce-plan' || copy.target === 'upgrade-hideout' || copy.target === 'combat-intel' || copy.target === 'first-raid';
  const cardAnchor = preferAbove && typeof document !== 'undefined'
    ? document.querySelector(`[data-tour-card-anchor="${copy.target}"]`)
    : null;
  const cardAnchorRect = cardAnchor?.getBoundingClientRect();
  const cardAnchorTop = cardAnchorRect?.top ?? rect?.top ?? 0;
  const guideMe = () => {
    navigate(copy.to.split('#')[0]!, { state: { tourTarget: copy.target } });
  };
  const goToStep = (nextStep: TourStepKey) => {
    const nextCopy = TOUR_STEPS[nextStep];
    void act({ action: 'advance-tour', step: nextStep });
    navigate(nextCopy.to.split('#')[0]!, { state: { tourTarget: nextCopy.target } });
  };
  const cardStyle =
    anchored && rect && typeof window !== 'undefined'
      ? {
          top: preferAbove
            ? Math.max(8, Math.min(window.innerHeight - cardHeight - 8, cardAnchorTop - cardHeight))
            : rect.top + rect.height + 12 <= window.innerHeight - cardHeight
            ? rect.top + rect.height + 12
            : Math.max(8, rect.top - cardHeight - 12),
          left: Math.max(8, Math.min(window.innerWidth - 336, rect.left)),
        }
      : undefined;

  return (
    <div className="se-tour" data-testid="tour-overlay" aria-hidden={false}>
      <div className={`se-tour__scrim${anchored ? '' : ' se-tour__scrim--full'}`} aria-hidden="true">
        {anchored && rect ? (
          <>
            <span className="se-tour__scrim-pane" style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top - 8) }} />
            <span className="se-tour__scrim-pane" style={{ top: rect.top - 8, left: 0, width: Math.max(0, rect.left - 8), height: rect.height + 16 }} />
            <span className="se-tour__scrim-pane" style={{ top: rect.top - 8, right: 0, left: rect.left + rect.width + 8, height: rect.height + 16 }} />
            <span className="se-tour__scrim-pane" style={{ top: rect.top + rect.height + 8, right: 0, bottom: 0, left: 0 }} />
          </>
        ) : null}
      </div>
      {anchored && rect ? (
        <div
          className="se-tour__spotlight"
          aria-hidden="true"
          style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }}
        />
      ) : null}
      <section
        ref={cardRef}
        tabIndex={-1}
        aria-labelledby="se-tour-title"
        className={`se-tour__card${anchored ? ' se-tour__card--anchored' : ' se-tour__card--fallback'}`}
        style={cardStyle}
      >
        <p className="se-eyebrow">{copy.chapter} · Step {index + 1} of {tour.steps.length}</p>
        <h2 id="se-tour-title">Next step: {copy.title}</h2>
        <p className="se-tour__mentor">{copy.mentor} says: {copy.detail}</p>
        <p className="se-hint">Your place is saved. Come back when you’re ready, including after turns refill.</p>
        <div
          className="se-tour__progress"
          role="progressbar"
          aria-label="Walkthrough progress"
          aria-valuemin={0}
          aria-valuemax={tour.steps.length}
          aria-valuenow={tour.steps.filter((item) => item.done).length}
        >
          <span style={{ width: `${Math.round((tour.steps.filter((item) => item.done).length / tour.steps.length) * 100)}%` }} />
        </div>
        <ol className="se-tour__dots" aria-label="Walkthrough progress">
          {tour.steps.map((item) => (
            <li key={item.key} className={item.done ? 'is-done' : item.key === step ? 'is-current' : ''} aria-label={`${TOUR_STEPS[item.key].title}${item.done ? ', done' : item.key === step ? ', current' : ''}`} />
          ))}
        </ol>
        <div className="se-tour__actions">
          {previous ? (
            <button type="button" className="se-btn se-btn--ghost se-btn--sm" aria-label={`Go back to ${TOUR_STEPS[previous].title}`} onClick={() => goToStep(previous)}>
              ← <span className="se-tour__arrow-label">Back</span>
            </button>
          ) : null}
          <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={guideMe}>
             Go to the action
          </button>
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'dismiss-tour' })}>
              Skip walkthrough
          </button>
          {next ? (
            <button type="button" className="se-btn se-btn--ghost se-btn--sm" aria-label={`Go forward to ${TOUR_STEPS[next].title}`} onClick={() => goToStep(next)}>
              <span className="se-tour__arrow-label">Next</span> →
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
