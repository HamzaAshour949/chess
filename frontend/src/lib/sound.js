/**
 * Game sounds, synthesised with the Web Audio API.
 *
 * No audio files to download or cache, and every sound is a few milliseconds
 * of computation. Honours the player's "sound effects" setting; a visitor who
 * is not signed in can toggle it too, and that choice is kept in localStorage.
 */

const STORAGE_KEY = "sound_enabled";

let enabled = readStoredPreference();
let context = null;
let unlocked = false;

function readStoredPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(value) {
  enabled = Boolean(value);
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* private mode: the in-memory value still applies */
  }
}

function audio() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === "suspended") void context.resume();
  return context;
}

/**
 * Browsers only start audio after a user gesture. The first click or key press
 * anywhere unlocks it, so a move pushed by the opponent later can be heard.
 */
export function installAudioUnlock() {
  if (unlocked || typeof window === "undefined") return;
  const unlock = () => {
    unlocked = true;
    audio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

function tone(ctx, { frequency, start = 0, duration = 0.12, type = "sine", gain = 0.12, glideTo }) {
  const at = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, at);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + duration);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** A short filtered noise burst: the "wood on wood" of a piece being set down. */
function knock(ctx, { start = 0, gain = 0.5, frequency = 1800 } = {}) {
  const at = ctx.currentTime + start;
  const length = Math.floor(ctx.sampleRate * 0.05);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = 1.2;
  const amp = ctx.createGain();
  amp.gain.value = gain;
  source.connect(filter).connect(amp).connect(ctx.destination);
  source.start(at);
}

const SOUNDS = {
  move: (ctx) => knock(ctx),
  capture: (ctx) => {
    knock(ctx, { frequency: 1400, gain: 0.6 });
    knock(ctx, { start: 0.06, frequency: 2200, gain: 0.35 });
  },
  check: (ctx) => {
    knock(ctx);
    tone(ctx, { frequency: 880, start: 0.03, duration: 0.14, type: "triangle", gain: 0.08 });
  },
  start: (ctx) => {
    tone(ctx, { frequency: 523, duration: 0.14, type: "triangle" });
    tone(ctx, { frequency: 784, start: 0.12, duration: 0.2, type: "triangle" });
  },
  end: (ctx) => {
    tone(ctx, { frequency: 659, duration: 0.18, type: "triangle" });
    tone(ctx, { frequency: 494, start: 0.16, duration: 0.3, type: "triangle" });
  },
  notify: (ctx) => {
    tone(ctx, { frequency: 988, duration: 0.1, gain: 0.08 });
    tone(ctx, { frequency: 1319, start: 0.09, duration: 0.16, gain: 0.08 });
  },
  lowTime: (ctx) => tone(ctx, { frequency: 1200, duration: 0.05, type: "square", gain: 0.03 }),
};

export function playSound(name) {
  if (!enabled) return;
  const ctx = audio();
  const sound = SOUNDS[name];
  if (!ctx || !sound) return;
  try {
    sound(ctx);
  } catch {
    /* audio is decoration; never let it break the page */
  }
}

/** Pick the sound for a move from its SAN. */
export function soundForSan(san) {
  if (!san) return "move";
  if (san.includes("#") || san.includes("+")) return "check";
  if (san.includes("x")) return "capture";
  return "move";
}
