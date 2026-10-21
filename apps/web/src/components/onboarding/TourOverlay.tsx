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
  const order = TOUR_STEP_KEYS;
  let index = order.indexOf(current) + direction;
  while (index >= 0 && index < order.length) {
    const key = order[index]!;
    if (!steps.find((step) => step.key === key)?.done) return key;
    index += direction;
  }
  return null;
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
  const { pathname } = useLocation();
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [pendingGuide, setPendingGuide] = useState(false);
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
    measure();
    const target = document.querySelector(`[data-tour="${copy.target}"]`);
    const observer = target && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (observer && target) observer.observe(target);
    const mutationObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(measure) : null;
    mutationObserver?.observe(document.body, { childList: true, subtree: true, attributes: true });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      observer?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [visible, measure]);

  useEffect(() => {
    if (!visible) return;
    cardRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void act({ action: 'dismiss-tour' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, act]);

  useEffect(() => {
    if (!pendingGuide || !copy) return undefined;
    const targetPath = copy.to.split('#')[0];
    if (pathname !== targetPath) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector(`[data-tour="${copy.target}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setPendingGuide(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [copy, pathname, pendingGuide]);

  if (!visible || !tour || !step || !copy) return null;

  const index = tourStepIndex(step);
  const previous = neighborStep(tour.steps, step, -1);
  const anchored = Boolean(rect);
  const guideMe = () => {
    setPendingGuide(true);
    navigate(copy.to);
  };
  const cardStyle =
    anchored && rect && typeof window !== 'undefined'
      ? {
          top: Math.max(8, Math.min(window.innerHeight - 190, rect.top + rect.height + 12)),
          left: Math.max(8, Math.min(window.innerWidth - 336, rect.left)),
        }
      : undefined;

  return (
    <div className="se-tour" data-testid="tour-overlay" aria-hidden={false}>
      <div className="se-tour__scrim" aria-hidden="true" />
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
        <p className="se-eyebrow">Guided tour · Step {index + 1} of {TOUR_STEP_KEYS.length}</p>
        <h2 id="se-tour-title">{copy.title}</h2>
        <p>{copy.detail}</p>
        {!anchored ? (
          <p><button type="button" className="se-link-button" onClick={guideMe}>Guide me to the action →</button></p>
        ) : null}
        <ol className="se-tour__dots" aria-label="Tour progress">
          {tour.steps.map((item) => (
            <li key={item.key} className={item.done ? 'is-done' : item.key === step ? 'is-current' : ''} aria-label={`${item.key}${item.done ? ', done' : item.key === step ? ', current' : ''}`} />
          ))}
        </ol>
        <div className="se-tour__actions">
          {previous ? (
            <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'advance-tour', step: previous })}>
              Back
            </button>
          ) : null}
          <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={guideMe}>
            Guide me
          </button>
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void act({ action: 'dismiss-tour' })}>
            Skip tour
          </button>
        </div>
      </section>
    </div>
  );
}
