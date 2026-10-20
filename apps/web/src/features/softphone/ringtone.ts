let ctx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let gain: GainNode | null = null;
let interval: number | null = null;

export function startRingtone(): void {
  stopRingtone();
  try {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = 0.15;
    scheduleTone();
    interval = window.setInterval(scheduleTone, 1500);
  } catch {
    /* ignore */
  }
}

function scheduleTone(): void {
  if (!ctx || !gain) return;
  const now = ctx.currentTime;
  for (let i = 0; i < 2; i++) {
    osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = i === 0 ? 440 : 480;
    osc.connect(gain);
    osc.start(now + i * 0.2);
    osc.stop(now + i * 0.2 + 0.4);
  }
}

export function stopRingtone(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  if (osc) {
    try {
      osc.stop();
    } catch {
      /* ignore */
    }
    osc = null;
  }
  if (gain) {
    try {
      gain.disconnect();
    } catch {
      /* ignore */
    }
    gain = null;
  }
  if (ctx && ctx.state !== 'closed') {
    ctx.close().catch(() => undefined);
    ctx = null;
  }
}
