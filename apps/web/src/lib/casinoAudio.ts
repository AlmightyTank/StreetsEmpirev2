export type CasinoSound =
  | 'SPIN'
  | 'ANTICIPATION'
  | 'REEL_STOP'
  | 'PAYOUT_TICK'
  | 'NEAR_MISS'
  | 'LOSS'
  | 'CHIP_PLACE'
  | 'CARD_DEAL'
  | 'CARD_FLIP'
  | 'TABLE_PUSH'
  | 'BLACKJACK'
  | 'ROULETTE_SPIN'
  | 'ROULETTE_TICK'
  | 'BALL_DROP'
  | 'DICE_SHAKE'
  | 'DICE_LAND'
  | 'POKER_CHECK'
  | 'POKER_FOLD'
  | 'POKER_ALL_IN'
  | 'SPORTS_PICK'
  | 'TICKET_PRINT'
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

function noiseBurst(ctx: AudioContext, at: number, duration: number, gainValue: number, highpass = 700): void {
  const frameCount = Math.max(1, Math.ceil(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(highpass, at);
  gain.gain.setValueAtTime(gainValue, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(at);
  source.stop(at + duration + 0.01);
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
      tone(ctx, now, 72, 0.42, 0.022, 'sawtooth', 165);
      tone(ctx, now + 0.035, 125, 0.28, 0.016, 'triangle', 280);
      // A short accelerating ratchet sells the physical pull without looping forever.
      for (let index = 0; index < 12; index++) {
        const progress = index / 11;
        noiseBurst(ctx, now + index * (0.064 - progress * 0.021), 0.018, 0.012 + progress * 0.004, 1_100);
      }
      break;
    case 'ANTICIPATION':
      tone(ctx, now, 330, 0.12, 0.025, 'square');
      tone(ctx, now + 0.14, 392, 0.12, 0.025, 'square');
      tone(ctx, now + 0.28, 494, 0.18, 0.03, 'square');
      break;
    case 'REEL_STOP': {
      const base = 170 + Math.min(5, accent) * 22;
      noiseBurst(ctx, now, 0.045, 0.032, 420);
      tone(ctx, now, base, 0.055, 0.04, 'square');
      tone(ctx, now + 0.015, base / 2, 0.08, 0.02, 'triangle');
      break;
    }
    case 'PAYOUT_TICK':
      tone(ctx, now, 880 + (accent % 4) * 70, 0.045, 0.018, 'sine');
      noiseBurst(ctx, now, 0.025, 0.009, 1_600);
      break;
    case 'NEAR_MISS':
      tone(ctx, now, 494, 0.11, 0.025, 'triangle');
      tone(ctx, now + 0.1, 466, 0.16, 0.022, 'triangle', 392);
      break;
    case 'LOSS':
      tone(ctx, now, 145, 0.1, 0.018, 'triangle', 116);
      noiseBurst(ctx, now, 0.04, 0.012, 500);
      break;
    case 'CHIP_PLACE':
      tone(ctx, now, 1_150 + (accent % 3) * 90, 0.045, 0.018, 'sine');
      tone(ctx, now + 0.018, 760, 0.055, 0.012, 'triangle');
      break;
    case 'CARD_DEAL':
      noiseBurst(ctx, now, 0.075, 0.028, 900);
      tone(ctx, now, 210 + (accent % 4) * 18, 0.05, 0.012, 'triangle', 150);
      break;
    case 'CARD_FLIP':
      noiseBurst(ctx, now, 0.11, 0.025, 1_250);
      tone(ctx, now + 0.035, 280, 0.07, 0.014, 'triangle', 190);
      break;
    case 'TABLE_PUSH':
      tone(ctx, now, 392, 0.11, 0.02, 'triangle');
      tone(ctx, now + 0.09, 392, 0.14, 0.018, 'triangle');
      break;
    case 'BLACKJACK':
      chord(ctx, [523, 659, 784, 1047], 0.075, 0.04);
      tone(ctx, now + 0.34, 1_568, 0.28, 0.034, 'sine');
      break;
    case 'ROULETTE_SPIN':
      noiseBurst(ctx, now, 0.12, 0.025, 500);
      tone(ctx, now, 105, 0.38, 0.018, 'sawtooth', 185);
      break;
    case 'ROULETTE_TICK':
      noiseBurst(ctx, now, 0.028, 0.017, 1_450);
      tone(ctx, now, 720 + (accent % 5) * 34, 0.035, 0.012, 'square');
      break;
    case 'BALL_DROP':
      noiseBurst(ctx, now, 0.08, 0.03, 650);
      tone(ctx, now, 340, 0.08, 0.026, 'triangle', 180);
      tone(ctx, now + 0.08, 210, 0.12, 0.02, 'triangle');
      break;
    case 'DICE_SHAKE':
      tone(ctx, now, 105, 0.24, 0.018, 'triangle', 155);
      for (let index = 0; index < 7; index++) {
        noiseBurst(ctx, now + index * 0.055, 0.025, 0.014, 520 + index * 55);
      }
      break;
    case 'DICE_LAND':
      noiseBurst(ctx, now, 0.07, 0.04, 280);
      tone(ctx, now, 150 + (accent % 6) * 12, 0.09, 0.032, 'triangle', 92);
      tone(ctx, now + 0.07, 235, 0.055, 0.018, 'square');
      break;
    case 'POKER_CHECK':
      tone(ctx, now, 260, 0.055, 0.016, 'triangle');
      tone(ctx, now + 0.07, 260, 0.055, 0.014, 'triangle');
      break;
    case 'POKER_FOLD':
      noiseBurst(ctx, now, 0.14, 0.024, 780);
      tone(ctx, now + 0.025, 175, 0.13, 0.016, 'triangle', 105);
      break;
    case 'POKER_ALL_IN':
      for (let index = 0; index < 4; index++) {
        tone(ctx, now + index * 0.045, 720 + index * 95, 0.075, 0.022, 'square');
        noiseBurst(ctx, now + index * 0.045, 0.035, 0.014, 1_100);
      }
      tone(ctx, now + 0.19, 330, 0.18, 0.026, 'triangle');
      break;
    case 'SPORTS_PICK':
      tone(ctx, now, 520 + (accent % 4) * 45, 0.055, 0.018, 'sine');
      tone(ctx, now + 0.045, 780 + (accent % 3) * 60, 0.07, 0.015, 'triangle');
      break;
    case 'TICKET_PRINT':
      for (let index = 0; index < 6; index++) {
        noiseBurst(ctx, now + index * 0.038, 0.022, 0.011, 1_150 + index * 45);
      }
      tone(ctx, now + 0.23, 880, 0.075, 0.024, 'sine');
      tone(ctx, now + 0.29, 1_175, 0.11, 0.022, 'sine');
      break;
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
