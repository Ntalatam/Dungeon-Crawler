// Audio System - Procedural sound effects using Web Audio API
// All sounds are generated programmatically (no external files needed)

let audioCtx = null;
let masterGain = null;
let muted = false;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(audioCtx.destination);
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function getMaster() {
  getCtx();
  return masterGain;
}

export function toggleMute() {
  muted = !muted;
  if (masterGain) {
    masterGain.gain.value = muted ? 0 : 0.3;
  }
  return muted;
}

export function isMuted() {
  return muted;
}

// --- Sound effects ---

// Player attack hit
export function playHit() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(getMaster());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
}

// Player miss
export function playMiss() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  osc.connect(gain);
  gain.connect(getMaster());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.1);
}

// Enemy death
export function playEnemyDeath() {
  const ctx = getCtx();
  // Low thud
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(120, ctx.currentTime);
  osc1.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.3);
  gain1.gain.setValueAtTime(0.4, ctx.currentTime);
  gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  osc1.connect(gain1);
  gain1.connect(getMaster());
  osc1.start(ctx.currentTime);
  osc1.stop(ctx.currentTime + 0.3);

  // Noise burst
  const bufferSize = ctx.sampleRate * 0.1;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.15, ctx.currentTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
  noise.connect(noiseGain);
  noiseGain.connect(getMaster());
  noise.start(ctx.currentTime);
  noise.stop(ctx.currentTime + 0.1);
}

// Player takes damage
export function playPlayerHit() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(150, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.2);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc.connect(gain);
  gain.connect(getMaster());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.2);
}

// Pickup item (potion, weapon, scroll)
export function playPickup() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(getMaster());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
}

// Key pickup (special chime)
export function playKeyPickup() {
  const ctx = getCtx();
  const times = [0, 0.08, 0.16];
  const freqs = [523, 659, 784]; // C5, E5, G5 arpeggio
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freqs[i];
    gain.gain.setValueAtTime(0.2, ctx.currentTime + times[i]);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + times[i] + 0.2);
    osc.connect(gain);
    gain.connect(getMaster());
    osc.start(ctx.currentTime + times[i]);
    osc.stop(ctx.currentTime + times[i] + 0.2);
  }
}

// Level up fanfare
export function playLevelUp() {
  const ctx = getCtx();
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  const times = [0, 0.1, 0.2, 0.35];
  for (let i = 0; i < notes.length; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = notes[i];
    gain.gain.setValueAtTime(0.25, ctx.currentTime + times[i]);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + times[i] + 0.3);
    osc.connect(gain);
    gain.connect(getMaster());
    osc.start(ctx.currentTime + times[i]);
    osc.stop(ctx.currentTime + times[i] + 0.3);
  }
}

// Stairs descend
export function playDescend() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.6);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  osc.connect(gain);
  gain.connect(getMaster());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.6);
}

// Boss reveal dramatic sound
export function playBossReveal() {
  const ctx = getCtx();
  // Deep rumble
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(50, ctx.currentTime);
  osc1.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.8);
  gain1.gain.setValueAtTime(0.3, ctx.currentTime);
  gain1.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.5);
  gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
  osc1.connect(gain1);
  gain1.connect(getMaster());
  osc1.start(ctx.currentTime);
  osc1.stop(ctx.currentTime + 1.0);

  // High stinger
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.value = 220;
  gain2.gain.setValueAtTime(0, ctx.currentTime);
  gain2.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.4);
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);
  osc2.connect(gain2);
  gain2.connect(getMaster());
  osc2.start(ctx.currentTime);
  osc2.stop(ctx.currentTime + 1.0);
}

// Player death
export function playPlayerDeath() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.8);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
  osc.connect(gain);
  gain.connect(getMaster());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.8);
}

// Ranged attack (arrow whoosh)
export function playArrowShoot() {
  const ctx = getCtx();
  const bufferSize = ctx.sampleRate * 0.15;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * (1 - t) * Math.sin(t * 30);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2000;
  filter.Q.value = 2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(getMaster());
  noise.start(ctx.currentTime);
  noise.stop(ctx.currentTime + 0.15);
}

// Hazard damage (lava/spikes)
export function playHazard() {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(100, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(getMaster());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.15);
}
