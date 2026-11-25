// Synthesizes 10 distinct, pleasant reminder & notification chimes using the Web Audio API
// so they work reliably offline in the web app and installed PWA without external audio files.

const SOUND_PREF_KEY = 'notification_sound_enabled';
const SOUND_PRESET_KEY = 'notification_sound_preset';
const SOUND_VOLUME_KEY = 'notification_sound_volume';
const SOUND_CHANGED_EVENT = 'notification-sound-changed';

export const NOTIFICATION_SOUNDS = [
  { id: 'chord', name: 'Chord', description: 'Warm harmonic major-9th chime' },
  { id: 'crystal', name: 'Crystal Chime', description: 'Sparkling ascending bell arpeggio' },
  { id: 'soft_bell', name: 'Soft Bell', description: 'Pure resonant desk bell tone' },
  { id: 'marimba', name: 'Marimba', description: 'Warm wooden two-note bounce' },
  { id: 'zen_gong', name: 'Zen Gong', description: 'Deep soothing harmonic tone' },
  { id: 'bright_ping', name: 'Bright Ping', description: 'Crisp modern alert ping' },
  { id: 'harp', name: 'Harp Cascade', description: 'Gentle sweeping four-note strum' },
  { id: 'sunrise', name: 'Sunrise', description: 'Uplifting fifth-to-octave swell' },
  { id: 'pulse', name: 'Pulse Alert', description: 'Clear double-tap reminder tone' },
  { id: 'classic_ding', name: 'Classic Ding', description: 'Timeless two-tone chime' },
];

const VALID_SOUND_IDS = new Set(NOTIFICATION_SOUNDS.map((s) => s.id));

// Voice recipes for each preset: array of { freq, gain, delay, duration, attack, type, slideTo? }
const SOUND_RECIPES = {
  chord: {
    cutoffStart: 3200,
    cutoffEnd: 1400,
    master: 0.55,
    notes: [
      { freq: 523.25, gain: 0.24, delay: 0.0, duration: 0.95, attack: 0.022, type: 'triangle' },
      { freq: 659.25, gain: 0.2, delay: 0.014, duration: 0.95, attack: 0.022, type: 'sine' },
      { freq: 783.99, gain: 0.2, delay: 0.028, duration: 0.95, attack: 0.022, type: 'sine' },
      { freq: 987.77, gain: 0.14, delay: 0.042, duration: 0.95, attack: 0.022, type: 'sine' },
      { freq: 1174.66, gain: 0.11, delay: 0.056, duration: 0.95, attack: 0.022, type: 'sine' },
    ],
  },
  crystal: {
    cutoffStart: 4200,
    cutoffEnd: 1900,
    master: 0.5,
    notes: [
      { freq: 783.99, gain: 0.22, delay: 0.0, duration: 0.45, attack: 0.012, type: 'sine' },
      { freq: 1046.5, gain: 0.22, delay: 0.085, duration: 0.5, attack: 0.012, type: 'sine' },
      { freq: 1318.51, gain: 0.2, delay: 0.17, duration: 0.65, attack: 0.012, type: 'triangle' },
      { freq: 1567.98, gain: 0.16, delay: 0.255, duration: 0.85, attack: 0.014, type: 'sine' },
    ],
  },
  soft_bell: {
    cutoffStart: 3000,
    cutoffEnd: 1200,
    master: 0.56,
    notes: [
      { freq: 880.0, gain: 0.34, delay: 0.0, duration: 1.05, attack: 0.008, type: 'sine' },
      { freq: 1760.0, gain: 0.11, delay: 0.0, duration: 0.6, attack: 0.008, type: 'sine' },
      { freq: 2637.02, gain: 0.05, delay: 0.0, duration: 0.35, attack: 0.006, type: 'sine' },
    ],
  },
  marimba: {
    cutoffStart: 2400,
    cutoffEnd: 950,
    master: 0.62,
    notes: [
      { freq: 440.0, gain: 0.36, delay: 0.0, duration: 0.26, attack: 0.006, type: 'triangle' },
      { freq: 587.33, gain: 0.38, delay: 0.13, duration: 0.38, attack: 0.006, type: 'triangle' },
      { freq: 880.0, gain: 0.14, delay: 0.13, duration: 0.28, attack: 0.006, type: 'sine' },
    ],
  },
  zen_gong: {
    cutoffStart: 1800,
    cutoffEnd: 650,
    master: 0.58,
    notes: [
      { freq: 261.63, gain: 0.34, delay: 0.0, duration: 1.45, attack: 0.045, type: 'sine' },
      { freq: 392.0, gain: 0.2, delay: 0.02, duration: 1.35, attack: 0.05, type: 'triangle' },
      { freq: 523.25, gain: 0.14, delay: 0.04, duration: 1.2, attack: 0.06, type: 'sine' },
    ],
  },
  bright_ping: {
    cutoffStart: 4800,
    cutoffEnd: 2200,
    master: 0.52,
    notes: [
      { freq: 1174.66, gain: 0.32, delay: 0.0, duration: 0.42, attack: 0.006, type: 'sine', slideTo: 1318.51 },
      { freq: 1760.0, gain: 0.12, delay: 0.02, duration: 0.35, attack: 0.008, type: 'sine' },
    ],
  },
  harp: {
    cutoffStart: 3400,
    cutoffEnd: 1500,
    master: 0.52,
    notes: [
      { freq: 440.0, gain: 0.2, delay: 0.0, duration: 0.85, attack: 0.015, type: 'triangle' },
      { freq: 554.37, gain: 0.2, delay: 0.06, duration: 0.85, attack: 0.015, type: 'triangle' },
      { freq: 659.25, gain: 0.2, delay: 0.12, duration: 0.85, attack: 0.015, type: 'sine' },
      { freq: 880.0, gain: 0.18, delay: 0.18, duration: 0.95, attack: 0.015, type: 'sine' },
    ],
  },
  sunrise: {
    cutoffStart: 2800,
    cutoffEnd: 1600,
    master: 0.54,
    notes: [
      { freq: 392.0, gain: 0.24, delay: 0.0, duration: 0.55, attack: 0.04, type: 'sine' },
      { freq: 587.33, gain: 0.24, delay: 0.11, duration: 0.65, attack: 0.04, type: 'sine' },
      { freq: 783.99, gain: 0.22, delay: 0.22, duration: 0.9, attack: 0.04, type: 'triangle' },
    ],
  },
  pulse: {
    cutoffStart: 3500,
    cutoffEnd: 1800,
    master: 0.56,
    notes: [
      { freq: 880.0, gain: 0.3, delay: 0.0, duration: 0.16, attack: 0.008, type: 'sine' },
      { freq: 1174.66, gain: 0.14, delay: 0.0, duration: 0.16, attack: 0.008, type: 'sine' },
      { freq: 880.0, gain: 0.32, delay: 0.19, duration: 0.28, attack: 0.008, type: 'sine' },
      { freq: 1318.51, gain: 0.16, delay: 0.19, duration: 0.28, attack: 0.008, type: 'sine' },
    ],
  },
  classic_ding: {
    cutoffStart: 3600,
    cutoffEnd: 1500,
    master: 0.55,
    notes: [
      { freq: 659.25, gain: 0.32, delay: 0.0, duration: 0.45, attack: 0.01, type: 'sine' },
      { freq: 523.25, gain: 0.32, delay: 0.22, duration: 0.78, attack: 0.01, type: 'sine' },
    ],
  },
};

let sharedAudioCtx = null;
let unlockBound = false;
let lastPlayedAt = 0;

function getAudioContextClass() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

function getOrCreateAudioContext() {
  const AudioCtx = getAudioContextClass();
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

export function isNotificationSoundEnabled() {
  if (typeof window === 'undefined') return true;
  try {
    const saved = localStorage.getItem(SOUND_PREF_KEY);
    return saved === null ? true : saved === 'true';
  } catch {
    return true;
  }
}

export function getNotificationSoundPreset() {
  if (typeof window === 'undefined') return 'chord';
  try {
    const saved = localStorage.getItem(SOUND_PRESET_KEY);
    return saved && VALID_SOUND_IDS.has(saved) ? saved : 'chord';
  } catch {
    return 'chord';
  }
}

export function getNotificationSoundVolume() {
  if (typeof window === 'undefined') return 0.8;
  try {
    const saved = localStorage.getItem(SOUND_VOLUME_KEY);
    if (saved === null) return 0.8;
    const parsed = Number(saved);
    if (!Number.isFinite(parsed)) return 0.8;
    return Math.min(1, Math.max(0, parsed));
  } catch {
    return 0.8;
  }
}

function emitSoundChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(SOUND_CHANGED_EVENT, {
      detail: {
        enabled: isNotificationSoundEnabled(),
        preset: getNotificationSoundPreset(),
        volume: getNotificationSoundVolume(),
      },
    })
  );
}

export function setNotificationSoundEnabled(enabled) {
  const next = Boolean(enabled);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(SOUND_PREF_KEY, String(next));
    } catch {
      // ignore storage errors
    }
    emitSoundChange();
  }
  return next;
}

export function setNotificationSoundPreset(presetId) {
  const next = VALID_SOUND_IDS.has(presetId) ? presetId : 'chord';
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(SOUND_PRESET_KEY, next);
    } catch {
      // ignore storage errors
    }
    emitSoundChange();
  }
  return next;
}

export function setNotificationSoundVolume(volume) {
  const num = Number(volume);
  const next = Number.isFinite(num) ? Math.min(1, Math.max(0, num)) : 0.8;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(SOUND_VOLUME_KEY, String(next));
    } catch {
      // ignore storage errors
    }
    emitSoundChange();
  }
  return next;
}

export function subscribeNotificationSoundChange(listener) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event) => {
    const enabled = Boolean(event?.detail?.enabled ?? isNotificationSoundEnabled());
    const preset = event?.detail?.preset || getNotificationSoundPreset();
    const volume =
      typeof event?.detail?.volume === 'number'
        ? event.detail.volume
        : getNotificationSoundVolume();
    listener(enabled, preset, volume);
  };
  const storageHandler = (event) => {
    if (
      event.key === SOUND_PREF_KEY ||
      event.key === SOUND_PRESET_KEY ||
      event.key === SOUND_VOLUME_KEY
    ) {
      listener(
        isNotificationSoundEnabled(),
        getNotificationSoundPreset(),
        getNotificationSoundVolume()
      );
    }
  };
  window.addEventListener(SOUND_CHANGED_EVENT, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(SOUND_CHANGED_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

export function initAudioUnlock() {
  if (typeof window === 'undefined' || unlockBound) return;
  unlockBound = true;

  const unlock = () => {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (ctx.state === 'running') {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchstart', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('click', unlock, true);
    }
  };

  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('touchstart', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true, passive: true });
  window.addEventListener('click', unlock, { capture: true, passive: true });
}

/**
 * Play the user's selected reminder/notification chime (defaults to "chord").
 * @param {{ force?: boolean, cooldownMs?: number, preset?: string }} [options]
 * @returns {Promise<boolean>} true if the sound was played
 */
export async function playNotificationChord(options = {}) {
  const { force = false, cooldownMs = 600, preset, volume } = options;
  if (!force && !isNotificationSoundEnabled()) {
    return false;
  }

  const effectiveVolume =
    typeof volume === 'number'
      ? Math.min(1, Math.max(0, volume))
      : getNotificationSoundVolume();
  if (effectiveVolume <= 0) {
    return false;
  }

  const nowMs = Date.now();
  if (!force && nowMs - lastPlayedAt < cooldownMs) {
    return false;
  }

  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;

  const presetId = preset && VALID_SOUND_IDS.has(preset) ? preset : getNotificationSoundPreset();
  const recipe = SOUND_RECIPES[presetId] || SOUND_RECIPES.chord;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (ctx.state !== 'running') {
      return false;
    }

    lastPlayedAt = nowMs;

    const startTime = ctx.currentTime + 0.015;
    const totalDuration = Math.max(
      ...recipe.notes.map((n) => n.delay + n.duration),
      0.8
    );

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(recipe.master * effectiveVolume, startTime);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(recipe.cutoffStart, startTime);
    filter.frequency.exponentialRampToValueAtTime(recipe.cutoffEnd, startTime + totalDuration);

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-14, startTime);
    compressor.ratio.setValueAtTime(4, startTime);

    filter.connect(masterGain);
    masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    recipe.notes.forEach(({ freq, gain, delay, duration, attack, type, slideTo }) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();

      const noteStart = startTime + delay;
      const noteEnd = noteStart + duration;

      osc.type = type;
      osc.frequency.setValueAtTime(freq, noteStart);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, noteStart + Math.min(0.14, duration * 0.5));
      }

      noteGain.gain.setValueAtTime(0.0001, noteStart);
      noteGain.gain.linearRampToValueAtTime(gain, noteStart + attack);
      noteGain.gain.exponentialRampToValueAtTime(Math.max(0.001, gain * 0.42), noteStart + duration * 0.35);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      osc.connect(noteGain);
      noteGain.connect(filter);

      osc.start(noteStart);
      osc.stop(noteEnd + 0.03);
    });

    return true;
  } catch {
    return false;
  }
}

export const playNotificationSound = playNotificationChord;
