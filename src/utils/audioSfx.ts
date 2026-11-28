/**
 * Web Audio API synthesized camera sound effects
 * Zero external network dependencies, reliable and instant.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Pre-warms Web Audio context on first user interaction to eliminate shutter click latency.
 */
export function prewarmAudioSfx(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {
    // Ignore audio context autoplay restrictions safely
  }
}

/**
 * Play authentic camera shutter sound: two fast mechanical clicks
 */
export function playShutterSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // First curtain click
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(450, now);
  osc1.frequency.exponentialRampToValueAtTime(120, now + 0.04);
  gain1.gain.setValueAtTime(0.3, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.04);

  // Second curtain click (after 45ms)
  const t2 = now + 0.045;
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(600, t2);
  osc2.frequency.exponentialRampToValueAtTime(80, t2 + 0.06);
  gain2.gain.setValueAtTime(0.35, t2);
  gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.06);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(t2);
  osc2.stop(t2 + 0.06);
}

/**
 * Video recording start tone: rising dual beep
 */
export function playRecordStartSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.setValueAtTime(880, now + 0.08);

  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

/**
 * Video recording stop tone: falling tone
 */
export function playRecordStopSound() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(660, now);
  osc.frequency.setValueAtTime(330, now + 0.08);

  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

/**
 * Focus locked blip
 */
export function playFocusBeep() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, now);

  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}
