// Short two-tone chime generated with the Web Audio API (no asset needed).
// Mobile browsers require audio to start from a user gesture, so we "unlock"
// the AudioContext on the first tap/click anywhere in the app.

const STORAGE_KEY = "notifications:sound";

let ctx: AudioContext | null = null;
let unlocked = false;

export function isNotificationSoundEnabled() {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "off";
}

export function setNotificationSoundEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* ignore */
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Attach once: unlocks audio playback after the first user interaction. */
export function initNotificationSound() {
  if (typeof window === "undefined" || unlocked) return;
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    unlocked = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

function tone(c: AudioContext, freq: number, start: number, duration: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Plays the notification chime (and a short vibration on mobile). */
let lastPlayedAt = 0;

export function playNotificationSound() {
  if (!isNotificationSoundEnabled()) return;
  const now = Date.now();
  if (now - lastPlayedAt < 1500) return; // de-dupe realtime + polling triggers
  lastPlayedAt = now;
  try {
    const c = getCtx();
    if (c) {
      if (c.state === "suspended") c.resume().catch(() => {});
      const now = c.currentTime;
      tone(c, 880, now, 0.14);
      tone(c, 1318.5, now + 0.13, 0.2);
    }
  } catch {
    /* ignore */
  }
  try {
    navigator.vibrate?.([40, 60, 40]);
  } catch {
    /* ignore */
  }
}

/* ---------------------------------------------------------------
 * Payment ("ka-ching") sounds — a separate, selectable sound that
 * plays when a payment notification arrives.
 * ------------------------------------------------------------- */

const PAYMENT_SOUND_KEY = "notifications:paymentSound";

export type PaymentSoundId = "kaching" | "coins" | "fanfare" | "soft";

export const PAYMENT_SOUNDS: { id: PaymentSoundId; label: string }[] = [
  { id: "kaching", label: "צ׳ה־צ׳ינג (סגנון שופיפיי)" },
  { id: "coins", label: "מטבעות נופלים" },
  { id: "fanfare", label: "פאנפרה קצרה" },
  { id: "soft", label: "צליל עדין" },
];

export function getPaymentSound(): PaymentSoundId {
  if (typeof localStorage === "undefined") return "kaching";
  const v = localStorage.getItem(PAYMENT_SOUND_KEY) as PaymentSoundId | null;
  return PAYMENT_SOUNDS.some((s) => s.id === v) ? (v as PaymentSoundId) : "kaching";
}

export function setPaymentSound(id: PaymentSoundId) {
  try {
    localStorage.setItem(PAYMENT_SOUND_KEY, id);
  } catch {
    /* ignore */
  }
}

function bell(c: AudioContext, freq: number, start: number, duration: number, gainPeak = 0.22, type: OscillatorType = "triangle") {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gainPeak, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noiseBurst(c: AudioContext, start: number, duration: number, gainPeak = 0.12) {
  const frames = Math.max(1, Math.floor(c.sampleRate * duration));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 2500;
  const g = c.createGain();
  g.gain.setValueAtTime(gainPeak, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(g).connect(c.destination);
  src.start(start);
}

function renderPaymentSound(c: AudioContext, id: PaymentSoundId, t: number) {
  switch (id) {
    case "kaching": {
      // Shopify/Etsy-style "cha-ching": a bright, clean two-note bell hit
      // (short grace note into a shimmering major chord) with a reverb tail.
      const out = c.createGain();
      out.gain.value = 1;
      out.connect(c.destination);

      // simple shimmer/reverb tail via feedback delay
      const delay = c.createDelay(1);
      delay.delayTime.value = 0.075;
      const fb = c.createGain();
      fb.gain.value = 0.32;
      const wet = c.createGain();
      wet.gain.value = 0.28;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 900;
      out.connect(delay);
      delay.connect(fb).connect(delay);
      delay.connect(hp).connect(wet).connect(c.destination);

      const ping = (freq: number, at: number, dur: number, vol: number) => {
        // FM bell: carrier + metallic modulator for the "ching" sparkle
        const carrier = c.createOscillator();
        carrier.type = "sine";
        carrier.frequency.value = freq;
        const mod = c.createOscillator();
        mod.type = "sine";
        mod.frequency.value = freq * 3.5;
        const modGain = c.createGain();
        modGain.gain.setValueAtTime(freq * 2.2, at);
        modGain.gain.exponentialRampToValueAtTime(1, at + dur * 0.6);
        mod.connect(modGain).connect(carrier.frequency);

        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        carrier.connect(g).connect(out);
        mod.start(at);
        carrier.start(at);
        mod.stop(at + dur + 0.05);
        carrier.stop(at + dur + 0.05);
      };

      // "cha" – short grace note
      ping(1174.7, t, 0.13, 0.16);          // D6
      // "ching" – bright major triad, longer, shimmering
      ping(1567.98, t + 0.09, 1.1, 0.2);    // G6
      ping(1975.5, t + 0.095, 0.95, 0.11);  // B6
      ping(2349.3, t + 0.1, 0.8, 0.07);     // D7
      break;
    }
    case "coins":
      [0, 0.07, 0.15, 0.24].forEach((d, i) => {
        noiseBurst(c, t + d, 0.05, 0.1);
        bell(c, 1800 + i * 220, t + d, 0.22, 0.16, "sine");
      });
      break;
    case "fanfare":
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        bell(c, f, t + i * 0.09, i === 3 ? 0.5 : 0.2, 0.2, "square");
      });
      break;
    case "soft":
      bell(c, 784, t, 0.3, 0.18, "sine");
      bell(c, 1174.7, t + 0.12, 0.5, 0.16, "sine");
      break;
  }
}

/** Preview a payment sound regardless of the saved preference. */
export function previewPaymentSound(id: PaymentSoundId) {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === "suspended") c.resume().catch(() => {});
    renderPaymentSound(c, id, c.currentTime + 0.02);
  } catch {
    /* ignore */
  }
}

/** Plays the selected payment sound (respects the global sound toggle). */
export function playPaymentSound() {
  if (!isNotificationSoundEnabled()) return;
  const now = Date.now();
  if (now - lastPlayedAt < 1500) return;
  lastPlayedAt = now;
  try {
    const c = getCtx();
    if (c) {
      if (c.state === "suspended") c.resume().catch(() => {});
      renderPaymentSound(c, getPaymentSound(), c.currentTime + 0.02);
    }
  } catch {
    /* ignore */
  }
  try {
    navigator.vibrate?.([30, 40, 30, 40, 60]);
  } catch {
    /* ignore */
  }
}
