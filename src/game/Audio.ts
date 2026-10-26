// Soft, cozy audio using WebAudio synthesis
// No external files needed — everything generated procedurally

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.6;
      masterGain.connect(audioCtx.destination);
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function initAudio() {
  getCtx();
}

export function setMuted(m: boolean) {
  muted = m;
  if (masterGain) masterGain.gain.value = m ? 0 : 0.6;
}

export function isMuted(): boolean {
  return muted;
}

// Soft bell/chime for eating food
export function playEat(combo: number = 0) {
  const ctx = getCtx();
  if (!ctx || !masterGain) return;

  const baseFreq = 660 + combo * 80; // pitch rises with combo
  const now = ctx.currentTime;

  // Main tone (sine + triangle blend for glassy feel)
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(baseFreq, now);
  osc1.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.08);

  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(baseFreq * 2, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  const gain2 = ctx.createGain();
  gain2.gain.value = 0.1;

  osc1.connect(gain);
  osc2.connect(gain2);
  gain2.connect(gain);
  gain.connect(masterGain);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.5);
  osc2.stop(now + 0.5);
}

// Soft shimmer for power-up pickup
export function playPowerUp() {
  const ctx = getCtx();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const freqs = [880, 1100, 1320, 1760];

  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now + i * 0.05);
    gain.gain.linearRampToValueAtTime(0.15, now + i * 0.05 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.4);

    osc.connect(gain);
    gain.connect(masterGain!);
    osc.start(now + i * 0.05);
    osc.stop(now + i * 0.05 + 0.4);
  });
}

// Soft descending sigh for combo break
export function playComboBreak() {
  const ctx = getCtx();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(300, now + 0.3);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.4);
}

// Soft whoosh for near-miss
export function playNearMiss() {
  const ctx = getCtx();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const bufferSize = ctx.sampleRate * 0.2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2000, now);
  filter.frequency.exponentialRampToValueAtTime(500, now + 0.2);
  filter.Q.value = 2;

  const gain = ctx.createGain();
  gain.gain.value = 0.15;

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start(now);
}

// Low warm thud for death
export function playDeath() {
  const ctx = getCtx();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;

  // Low thud
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.8);

  // Soft noise layer
  const bufferSize = ctx.sampleRate * 0.6;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.1;

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(now);
}

// Soft UI tick
export function playClick() {
  const ctx = getCtx();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 1200;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.08);
}

// Triumphant chime for new record
export function playNewRecord() {
  const ctx = getCtx();
  if (!ctx || !masterGain) return;

  const now = ctx.currentTime;
  const notes = [523, 659, 784, 1047]; // C E G C

  notes.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = f * 2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now + i * 0.12);
    gain.gain.linearRampToValueAtTime(0.2, now + i * 0.12 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.8);

    const gain2 = ctx.createGain();
    gain2.gain.value = 0.08;

    osc.connect(gain);
    osc2.connect(gain2);
    gain2.connect(gain);
    gain.connect(masterGain!);
    osc.start(now + i * 0.12);
    osc2.start(now + i * 0.12);
    osc.stop(now + i * 0.12 + 0.8);
    osc2.stop(now + i * 0.12 + 0.8);
  });
}
