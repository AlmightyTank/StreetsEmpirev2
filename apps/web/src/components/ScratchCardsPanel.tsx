import { useCallback, useEffect, useRef, useState } from 'react';
import { formatCents, type CasinoPageDto, type CasinoScratchCardDto, type CasinoScratchCardStateDto } from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';
import { casinoSoundEnabled, playCasinoSound, setCasinoSoundEnabled } from '../lib/casinoAudio.js';
import { newActionId } from '../utils/actionId.js';

type Props = { casinoPage: CasinoPageDto; onPageChange: (page: CasinoPageDto) => void };

function signed(value: number): string {
  if (value === 0) return '$0.00';
  const sign = value > 0 ? '+' : '-';
  return sign + formatCents(Math.abs(value));
}

const SCRATCH_RADIUS = 22;
const SCRATCH_THRESHOLD = 0.55;

interface ScratchCanvasProps {
  width: number;
  height: number;
  onRevealProgress: (ratio: number) => void;
  onComplete: () => void;
  resetKey: string;
}

function ScratchCanvas({ width, height, onRevealProgress, onComplete, resetKey }: ScratchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const revealedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#b9bec3');
    gradient.addColorStop(0.25, '#e9ecef');
    gradient.addColorStop(0.5, '#9ba1a7');
    gradient.addColorStop(0.75, '#d4d8dc');
    gradient.addColorStop(1, '#a8adb2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    for (let i = -height; i < width; i += 6) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + height, height);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(77,81,85,0.6)';
    ctx.font = '900 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCRATCH HERE', width / 2, height / 2);

    revealedRef.current = false;
  }, [resetKey, width, height]);

  const scratch = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = SCRATCH_RADIUS * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const last = lastPoint.current;
    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, SCRATCH_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    lastPoint.current = { x, y };

    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    let clear = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i]! < 128) clear++;
    }
    const ratio = clear / (width * height);
    onRevealProgress(ratio);

    if (ratio >= SCRATCH_THRESHOLD && !revealedRef.current) {
      revealedRef.current = true;
      ctx.clearRect(0, 0, width, height);
      onComplete();
    }
  }, [width, height, onRevealProgress, onComplete]);

  const getPos = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="se-scratch__canvas"
      onPointerDown={(e) => {
        isDrawing.current = true;
        lastPoint.current = null;
        const pos = getPos(e);
        if (pos) scratch(pos.x, pos.y);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!isDrawing.current) return;
        const pos = getPos(e);
        if (pos) scratch(pos.x, pos.y);
      }}
      onPointerUp={() => {
        isDrawing.current = false;
        lastPoint.current = null;
      }}
      onPointerCancel={() => {
        isDrawing.current = false;
        lastPoint.current = null;
      }}
      onPointerLeave={() => {
        isDrawing.current = false;
        lastPoint.current = null;
      }}
    />
  );
}

export function ScratchCardsPanel({ casinoPage, onPageChange }: Props) {
  const [state, setState] = useState<CasinoScratchCardStateDto | null>(null);
  const [denomination, setDenomination] = useState(100);
  const [card, setCard] = useState<CasinoScratchCardDto | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(() => casinoSoundEnabled());
  const [error, setError] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState(() => localStorage.getItem('streets:scratch-canvas') === '1');
  const [, setSpotRevealProgress] = useState<Map<number, number>>(new Map());
  const actionId = useRef(newActionId());

  useEffect(() => {
    void casinoApi.scratchCards().then((next) => {
      setState(next);
      if (!next.denominationsCents.includes(denomination)) setDenomination(next.denominationsCents[0] ?? 100);
      setCard(next.history[0] ?? null);
      setRevealed(next.history[0] ? new Set(next.history[0].spots.map((_, index) => index)) : new Set());
    }).catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Could not open the scratch-card counter.'));
  }, [casinoPage.currentCitySlug, casinoPage.openSession?.id]);

  const bankroll = casinoPage.openSession?.bankrollCents ?? 0;
  const blocked = !casinoPage.openSession
    ? 'Open a casino bankroll first.'
    : denomination > bankroll
      ? 'There are not enough chips for this ticket.'
      : busy ? 'The clerk is printing your ticket.' : null;
  const allRevealed = Boolean(card && revealed.size === card.spots.length);

  function finish(next: CasinoScratchCardDto) {
    if (next.payoutCents >= next.denominationCents * 25) playCasinoSound('BIG_WIN', soundEnabled);
    else if (next.netCents > 0) playCasinoSound('SMALL_WIN', soundEnabled);
    else if (next.netCents === 0) playCasinoSound('TABLE_PUSH', soundEnabled);
    else playCasinoSound('LOSS', soundEnabled);
  }

  function reveal(index: number) {
    if (!card || revealed.has(index)) return;
    playCasinoSound('SCRATCH_SCRAPE', soundEnabled, index);
    const next = new Set(revealed);
    next.add(index);
    setRevealed(next);
    if (next.size === card.spots.length) window.setTimeout(() => finish(card), 180);
  }

  async function revealAll() {
    if (!card || allRevealed) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let index = 0; index < card.spots.length; index += 1) {
      if (revealed.has(index)) continue;
      playCasinoSound('SCRATCH_SCRAPE', soundEnabled, index);
      setRevealed((current) => {
        const next = new Set(current);
        next.add(index);
        return next;
      });
      if (!reduced) await new Promise((resolve) => window.setTimeout(resolve, 90));
    }
    window.setTimeout(() => finish(card), reduced ? 0 : 180);
  }

  function handleCanvasComplete(index: number) {
    reveal(index);
  }

  function toggleCanvasMode() {
    const next = !canvasMode;
    setCanvasMode(next);
    localStorage.setItem('streets:scratch-canvas', next ? '1' : '0');
  }

  async function buy() {
    if (blocked) return;
    setBusy(true); setError(null);
    playCasinoSound('TICKET_PRINT', soundEnabled);
    try {
      const result = await casinoApi.scratchCardPlay({ denominationCents: denomination, actionId: actionId.current });
      actionId.current = newActionId();
      onPageChange(result.page);
      setState(result.scratchCards);
      setCard(result.card);
      setRevealed(new Set());
      setSpotRevealProgress(new Map());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The scratch card could not be issued.');
    } finally { setBusy(false); }
  }

  return (
    <Panel title="Scratch Cards" aside={state ? `${(state.rtpBps / 100).toFixed(0)}% posted return` : 'Winning symbols'}>
      <div className="se-scratch">
        <div className="se-scratch__toolbar">
          <span>{busy ? 'PRINTING TICKET' : card && !allRevealed ? 'SCRATCH TO REVEAL' : allRevealed ? (card!.netCents >= 0 ? 'WINNER CHECKED' : 'TICKET CHECKED') : 'TICKET COUNTER'}</span>
          <div className="se-scratch__toolbar-actions">
            <button type="button" className="se-btn se-btn--ghost" aria-pressed={canvasMode} onClick={toggleCanvasMode}>{canvasMode ? 'Canvas mode' : 'Tap mode'}</button>
            <button type="button" className="se-btn se-btn--ghost" aria-pressed={soundEnabled} onClick={() => { const next = !soundEnabled; setSoundEnabledState(next); setCasinoSoundEnabled(next); if (next) playCasinoSound('SCRATCH_SCRAPE', true); }}>{soundEnabled ? 'Sound on' : 'Muted'}</button>
          </div>
        </div>
        {error ? <Alert>{error}</Alert> : null}
        {!state ? <p className="se-muted">Opening the ticket case…</p> : null}
        {state && !state.enabled ? <p className="se-muted">Scratch cards are not enabled in this round.</p> : null}
        {state?.enabled ? <>
          <div className="se-scratch__denoms" role="group" aria-label="Scratch-card prices">
            {state.denominationsCents.map((value) => <button key={value} type="button" disabled={busy} aria-pressed={denomination === value} className={denomination === value ? 'is-selected' : ''} onClick={() => { setDenomination(value); actionId.current = newActionId(); playCasinoSound('CHIP_PLACE', soundEnabled, value); }}>{formatCents(value)}</button>)}
          </div>
          <div className={`se-scratch__ticket${allRevealed ? card!.netCents > 0 ? ' is-win' : card!.netCents === 0 ? ' is-push' : ' is-loss' : ''}`}>
            <header><div><span>STREETS EMPIRE</span><strong>WINNING SYMBOLS</strong></div><b>{card ? formatCents(card.denominationCents) : formatCents(denomination)}</b></header>
            <div className="se-scratch__winners" aria-label="Winning symbols">
              {(card?.winningSymbols ?? []).map((symbol) => <span key={symbol.key}><b>{symbol.glyph}</b><small>{symbol.label}</small></span>)}
              {!card ? <p>Buy a ticket to post three winning symbols.</p> : null}
            </div>
            <div className="se-scratch__grid">
              {(card?.spots ?? Array.from({ length: 9 }, () => null)).map((spot, index) => {
                const shown = revealed.has(index);
                if (canvasMode && spot && !shown) {
                  return (
                    <div key={`${card?.actionId ?? 'blank'}-${index}`} className="se-scratch__canvas-wrap">
                      <div className="se-scratch__prize"><b>{spot.glyph}</b><small>{spot.label}</small><strong>{formatCents(spot.prizeCents)}</strong></div>
                      <ScratchCanvas
                        width={180}
                        height={140}
                        resetKey={`${card?.actionId}-${index}`}
                        onRevealProgress={(ratio) => setSpotRevealProgress(prev => new Map(prev).set(index, ratio))}
                        onComplete={() => handleCanvasComplete(index)}
                      />
                    </div>
                  );
                }
                return <button key={`${card?.actionId ?? 'blank'}-${index}`} type="button" disabled={!spot || shown} className={shown ? `is-revealed${spot?.winning ? ' is-winning' : ''}` : ''} onPointerEnter={(event) => { if (event.buttons) reveal(index); }} onPointerDown={() => reveal(index)} aria-label={spot ? shown ? `${spot.label}, ${formatCents(spot.prizeCents)}${spot.winning ? ', winner' : ''}` : `Scratch spot ${index + 1}` : `Empty spot ${index + 1}`}><span className="se-scratch__foil">SCRATCH</span>{spot ? <span className="se-scratch__prize"><b>{spot.glyph}</b><small>{spot.label}</small><strong>{formatCents(spot.prizeCents)}</strong></span> : null}</button>;
              })}
            </div>
            <footer><span>{card && allRevealed ? `Paid ${formatCents(card.payoutCents)} · Net ${signed(card.netCents)}` : 'Match any posted symbol to win the prize under it.'}</span>{card && !allRevealed ? <button type="button" className="se-btn se-btn--ghost" onClick={() => void revealAll()}>Scratch all</button> : null}</footer>
          </div>
          <Button type="button" className="se-btn se-btn--primary se-scratch__buy" disabledReason={blocked} onClick={() => void buy()}>{busy ? 'Printing…' : `Buy ${formatCents(denomination)} ticket`}</Button>
          <p className="se-hint">Each ticket is generated and settled on the server when purchased. Scratching only reveals the saved result.</p>
        </> : null}
      </div>
    </Panel>
  );
}
