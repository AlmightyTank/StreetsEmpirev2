export type CasinoSound =
  | 'SPIN'
  | 'ANTICIPATION'
  | 'REEL_STOP'
  | 'SMALL_WIN'
  | 'BIG_WIN'
  | 'MEGA_WIN'
  | 'FREE_SPINS'
  | 'JACKPOT';

const STORAGE_KEY = 'streets:casino:sound-enabled';
let context: AudioContext | null = null;

export function casinoSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(STORAGE_KEY) !== '0';
}

export function setCasinoSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
}

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtor = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!context) context = new AudioCtor();
  if (context.state === 'suspended') void context.resume();
  return context;
}

function tone(
  ctx: AudioContext,
  at: number,
  frequency: number,
  duration: number,
  gainValue: number,
  type: OscillatorType = 'sine',
  endFrequency?: number,
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  if (endFrequency !== undefined) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(gainValue, at + Math.min(0.02, duration / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

function chord(ctx: AudioContext, notes: number[], spacing = 0.08, gain = 0.035): void {
  const now = ctx.currentTime;
  notes.forEach((note, index) => tone(ctx, now + index * spacing, note, 0.18, gain, 'triangle'));
}

export function playCasinoSound(sound: CasinoSound, enabled = casinoSoundEnabled(), accent = 0): void {
  if (!enabled) return;
  const ctx = audioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  switch (sound) {
    case 'SPIN':
      tone(ctx, now, 92, 0.28, 0.025, 'sawtooth', 180);
      tone(ctx, now + 0.04, 140, 0.18, 0.018, 'triangle', 260);
      break;
    case 'ANTICIPATION':
      tone(ctx, now, 330, 0.12, 0.025, 'square');
      tone(ctx, now + 0.14, 392, 0.12, 0.025, 'square');
      tone(ctx, now + 0.28, 494, 0.18, 0.03, 'square');
      break;
    case 'REEL_STOP': {
      const base = 170 + Math.min(5, accent) * 22;
      tone(ctx, now, base, 0.055, 0.04, 'square');
      tone(ctx, now + 0.015, base / 2, 0.08, 0.02, 'triangle');
      break;
    }
    case 'SMALL_WIN':
      chord(ctx, [523, 659, 784], 0.09, 0.03);
      break;
    case 'BIG_WIN':
      chord(ctx, [392, 523, 659, 784, 1047], 0.085, 0.04);
      break;
    case 'MEGA_WIN':
      chord(ctx, [330, 440, 554, 659, 880, 1109, 1319], 0.075, 0.045);
      break;
    case 'FREE_SPINS':
      chord(ctx, [523, 659, 784, 1047, 1319], 0.1, 0.045);
      tone(ctx, now + 0.55, 1568, 0.3, 0.035, 'sine');
      break;
    case 'JACKPOT':
      chord(ctx, [262, 330, 392, 523, 659, 784, 1047, 1319], 0.07, 0.05);
      tone(ctx, now + 0.62, 1568, 0.55, 0.045, 'triangle', 2093);
      break;
  }
}
