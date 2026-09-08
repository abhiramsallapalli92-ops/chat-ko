// Web Audio API Sound Effects Engine
// Zero external files, zero latency, 100% royalty-free synthesized audio feedback

let audioCtx: AudioContext | null = null;
let isUnlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('chatko_sound_enabled') !== 'false';
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('chatko_sound_enabled', enabled ? 'true' : 'false');
}

/**
 * Ensures AudioContext is resumed on the first user interaction (mobile constraint)
 */
export function initSoundUnlock(): void {
  if (typeof window === 'undefined' || isUnlocked) return;

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        isUnlocked = true;
      }).catch(() => {});
    } else {
      isUnlocked = true;
    }
    window.removeEventListener('touchstart', unlock, true);
    window.removeEventListener('click', unlock, true);
  };

  window.addEventListener('touchstart', unlock, { capture: true, once: true });
  window.addEventListener('click', unlock, { capture: true, once: true });
}

/**
 * Message Sent: Short, light whoosh/pop (iMessage style)
 */
export function playSentSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  // Pitch sweep up (whoosh/pop)
  osc.type = 'sine';
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

  // Soft attack and snappy release
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.15);
}

/**
 * Message Received: Clean, pleasant double-tone pop/chime
 */
export function playReceivedSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;

  // Tone 1: 880Hz
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, now);

  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.linearRampToValueAtTime(0.15, now + 0.01);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.13);

  // Tone 2: 1320Hz (harmonic pleasant bell-like tail)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1320, now + 0.05);

  gain2.gain.setValueAtTime(0.001, now + 0.05);
  gain2.gain.linearRampToValueAtTime(0.12, now + 0.065);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.05);
  osc2.stop(now + 0.23);
}

/**
 * Optional subtle tap sound for key interactions
 */
export function playTapSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1200, now);
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.025);
}
