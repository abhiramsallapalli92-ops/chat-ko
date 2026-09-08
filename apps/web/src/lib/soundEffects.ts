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

function resumeCtx(ctx: AudioContext) {
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

/**
 * Message Sent: Short, light whoosh/pop — rising pitch sweep (iMessage style)
 */
export function playSentSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeCtx(ctx);

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.09);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.16, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.17);
}

/**
 * Message Received: Pleasant two-tone notification chime
 */
export function playReceivedSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeCtx(ctx);

  const now = ctx.currentTime;

  // Tone 1: 880 Hz
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, now);
  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.linearRampToValueAtTime(0.14, now + 0.01);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.15);

  // Tone 2: 1320 Hz harmonic tail
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1320, now + 0.05);
  gain2.gain.setValueAtTime(0.001, now + 0.05);
  gain2.gain.linearRampToValueAtTime(0.11, now + 0.065);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.05);
  osc2.stop(now + 0.25);
}

/**
 * Tap / button press: crisp, premium click — very short noise burst
 */
export function playTapSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeCtx(ctx);

  const now = ctx.currentTime;

  // White noise burst for the click body
  const bufferSize = ctx.sampleRate * 0.018;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const bpf = ctx.createBiquadFilter();
  bpf.type = 'bandpass';
  bpf.frequency.value = 2800;
  bpf.Q.value = 2.2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

  source.connect(bpf);
  bpf.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
  source.stop(now + 0.02);
}

/**
 * Modal / sheet open: soft upward swell
 */
export function playModalOpenSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeCtx(ctx);

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.18);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.09, now + 0.06);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

/**
 * Modal / sheet close: soft descending swoop
 */
export function playModalCloseSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeCtx(ctx);

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(560, now);
  osc.frequency.exponentialRampToValueAtTime(240, now + 0.18);

  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}

/**
 * Pull-to-refresh spring snap: quick rising chirp
 */
export function playPullRefreshSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeCtx(ctx);

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(1100, now + 0.07);
  osc.frequency.exponentialRampToValueAtTime(800, now + 0.14);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.11, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.22);
}

/**
 * Call connect: ascending 3-note chime (pleasant, not jarring)
 */
export function playCallConnectSound(): void {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  resumeCtx(ctx);

  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  notes.forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.12;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  });
}

/**
 * Call ringing: repeating 2-tone ring pattern.
 * Returns a stop function — call it when the call is answered or dismissed.
 */
export function playCallRingSound(): () => void {
  if (!isSoundEnabled()) return () => {};
  const ctx = getAudioContext();
  if (!ctx) return () => {};
  resumeCtx(ctx);

  let stopped = false;
  const ringDuration = 0.4;
  const ringGap = 0.2;
  const groupGap = 1.5;

  const scheduleRing = (startTime: number) => {
    if (stopped) return;

    const tones = [480, 620];
    tones.forEach((freq, i) => {
      const t = startTime + i * (ringDuration + ringGap);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.setValueAtTime(0.18, t + ringDuration - 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + ringDuration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + ringDuration + 0.02);
    });

    // Schedule next ring group
    const nextStart = startTime + tones.length * (ringDuration + ringGap) + groupGap;
    const delay = (nextStart - ctx.currentTime) * 1000;
    if (delay > 0) {
      setTimeout(() => scheduleRing(nextStart), delay);
    }
  };

  scheduleRing(ctx.currentTime);

  return () => { stopped = true; };
}
