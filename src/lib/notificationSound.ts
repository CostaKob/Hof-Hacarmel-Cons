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
 * Payment sounds — cash-register variants, selectable per user.
 * ------------------------------------------------------------- */

const PAYMENT_SOUND_KEY = "notifications:paymentSound";

export type PaymentSoundId =
  | "register1" | "register2" | "register3" | "register4" | "register5"
  | "register6" | "register7" | "register8" | "register9" | "register10"
  | "coin1" | "coin2" | "coin3" | "coin4" | "coin5"
  | "coin6" | "coin7" | "coin8" | "coin9" | "coin10";

export type PaymentSoundCategory = "register" | "coins";

export const PAYMENT_SOUNDS: { id: PaymentSoundId; label: string; category: PaymentSoundCategory }[] = [
  { id: "register1", label: "1 · קופה קלאסית — פעמון + מגירה", category: "register" },
  { id: "register2", label: "2 · צ׳ה־צ׳ינג בהיר", category: "register" },
  { id: "register3", label: "3 · פעמון עתיק כבד", category: "register" },
  { id: "register4", label: "4 · קופה + זרם מטבעות", category: "register" },
  { id: "register5", label: "5 · צ׳ינג כפול מהיר", category: "register" },
  { id: "register6", label: "6 · פעמון קטן ועדין", category: "register" },
  { id: "register7", label: "7 · קופה מכנית (מנוף + פעמון)", category: "register" },
  { id: "register8", label: "8 · קופה דיגיטלית (ביפ + צ׳ינג)", category: "register" },
  { id: "register9", label: "9 · פעמון גדול עם הד", category: "register" },
  { id: "register10", label: "10 · קופה + מגירה נפתחת ונסגרת", category: "register" },
  { id: "coin1", label: "1 · מטבע אחד נופל", category: "coins" },
  { id: "coin2", label: "2 · שני מטבעות", category: "coins" },
  { id: "coin3", label: "3 · מטבעות נופלים זה אחרי זה", category: "coins" },
  { id: "coin4", label: "4 · מטבע מסתובב", category: "coins" },
  { id: "coin5", label: "5 · מטבעות נופלים בקופה", category: "coins" },
  { id: "coin6", label: "6 · מטבע כבד (מטאלי עמוק)", category: "coins" },
  { id: "coin7", label: "7 · מטבעות קטנים וקלים", category: "coins" },
  { id: "coin8", label: "8 · נחיתה עם רטט", category: "coins" },
  { id: "coin9", label: "9 · מטבעות מרוחקים", category: "coins" },
  { id: "coin10", label: "10 · מטבעות מהירים", category: "coins" },
];

export function getPaymentSound(): PaymentSoundId {
  if (typeof localStorage === "undefined") return "register1";
  const v = localStorage.getItem(PAYMENT_SOUND_KEY) as PaymentSoundId | null;
  return PAYMENT_SOUNDS.some((s) => s.id === v) ? (v as PaymentSoundId) : "register1";
}

export function setPaymentSound(id: PaymentSoundId) {
  try {
    localStorage.setItem(PAYMENT_SOUND_KEY, id);
  } catch {
    /* ignore */
  }
}

/* ---- synthesis helpers ---- */

function makeBus(c: AudioContext, wetAmount: number, delayTime = 0.09, feedback = 0.3) {
  const out = c.createGain();
  out.gain.value = 1;
  out.connect(c.destination);
  if (wetAmount > 0) {
    const delay = c.createDelay(1);
    delay.delayTime.value = delayTime;
    const fb = c.createGain();
    fb.gain.value = feedback;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 800;
    const wet = c.createGain();
    wet.gain.value = wetAmount;
    out.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(hp).connect(wet).connect(c.destination);
  }
  return out;
}

/** Struck metal bell built from inharmonic partials (real register bell). */
function strikeBell(
  c: AudioContext,
  dest: AudioNode,
  at: number,
  base: number,
  dur: number,
  vol: number,
  partials: number[] = [1, 2.76, 5.4, 8.93],
) {
  const vols = [1, 0.55, 0.35, 0.22, 0.14, 0.09];
  partials.forEach((mult, i) => {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = base * mult;
    const g = c.createGain();
    const d = dur * (1 - i * 0.13);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * (vols[i] ?? 0.08)), at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.05, d));
    osc.connect(g).connect(dest);
    osc.start(at);
    osc.stop(at + d + 0.05);
  });
}

/** FM "ching" — bright, glassy, Shopify-like. */
function fmPing(c: AudioContext, dest: AudioNode, at: number, freq: number, dur: number, vol: number, ratio = 3.5) {
  const carrier = c.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = freq;
  const mod = c.createOscillator();
  mod.type = "sine";
  mod.frequency.value = freq * ratio;
  const modGain = c.createGain();
  modGain.gain.setValueAtTime(freq * 2, at);
  modGain.gain.exponentialRampToValueAtTime(1, at + dur * 0.6);
  mod.connect(modGain).connect(carrier.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  carrier.connect(g).connect(dest);
  mod.start(at);
  carrier.start(at);
  mod.stop(at + dur + 0.05);
  carrier.stop(at + dur + 0.05);
}

/** Filtered noise — drawer slide, mechanical clicks, coin scatter. */
function noise(
  c: AudioContext,
  dest: AudioNode,
  at: number,
  dur: number,
  vol: number,
  type: BiquadFilterType = "highpass",
  freq = 2500,
) {
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter).connect(g).connect(dest);
  src.start(at);
}

/** Low wooden/metal thud — drawer hitting its stop. */
function thud(c: AudioContext, dest: AudioNode, at: number, freq: number, vol: number) {
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, at + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
  osc.connect(g).connect(dest);
  osc.start(at);
  osc.stop(at + 0.2);
}

/* -------------------------------------------------------------
 * Coin-specific synthesis helpers.
 * ----------------------------------------------------------- */

/** Short bright coin ping with a tiny metallic chirp. */
function coinPing(
  c: AudioContext,
  dest: AudioNode,
  at: number,
  freq: number,
  vol: number,
  dur = 0.18,
) {
  const bus = c.createGain();
  bus.gain.value = vol;
  bus.connect(dest);

  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.65, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(bus);
  osc.start(at);
  osc.stop(at + dur + 0.02);

  // metallic chirp partial
  const chirp = c.createOscillator();
  chirp.type = "triangle";
  chirp.frequency.setValueAtTime(freq * 2.4, at);
  chirp.frequency.exponentialRampToValueAtTime(freq * 1.9, at + dur * 0.5);
  const cg = c.createGain();
  cg.gain.setValueAtTime(0.0001, at);
  cg.gain.exponentialRampToValueAtTime(vol * 0.35, at + 0.002);
  cg.gain.exponentialRampToValueAtTime(0.0001, at + dur * 0.5);
  chirp.connect(cg).connect(bus);
  chirp.start(at);
  chirp.stop(at + dur * 0.55);

  // tiny impact click
  noise(c, bus, at, 0.015, vol * 0.4, "highpass", 4500);
}

/** Coin spinning/wobbling on a surface before settling. */
function coinSpin(c: AudioContext, dest: AudioNode, at: number, freq: number, vol: number) {
  const osc = c.createOscillator();
  osc.type = "sine";
  const g = c.createGain();
  osc.connect(g).connect(dest);

  const start = at;
  const steps = 22;
  const stepDur = 0.035;
  for (let i = 0; i < steps; i++) {
    const t = start + i * stepDur;
    const f = freq * (1 - i / steps * 0.7);
    osc.frequency.setValueAtTime(f, t);
    const v = vol * Math.pow(1 - i / steps, 1.4);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(v * 0.3, t + stepDur * 0.8);
  }
  osc.start(start);
  osc.stop(start + steps * stepDur + 0.05);
}

/** Coin landing and rattling against other coins/tray. */
function coinRattle(c: AudioContext, dest: AudioNode, at: number, vol: number, count = 5) {
  for (let i = 0; i < count; i++) {
    const t = at + i * (0.02 + Math.random() * 0.025);
    const f = 2800 + Math.random() * 1800;
    coinPing(c, dest, t, f, vol * (0.9 - i * 0.12), 0.08 + Math.random() * 0.06);
  }
}

/** Cascade of multiple coins dropping one after another. */
function coinCascade(c: AudioContext, dest: AudioNode, at: number, vol: number, count = 8) {
  for (let i = 0; i < count; i++) {
    const t = at + i * (0.04 + Math.random() * 0.04);
    const f = 3000 + Math.random() * 1600;
    coinPing(c, dest, t, f, vol * (0.8 - i * 0.06), 0.1 + Math.random() * 0.08);
  }
}

/** Low "heavy" coin impact. */
function heavyCoin(c: AudioContext, dest: AudioNode, at: number, freq: number, vol: number) {
  const bus = makeBus(c, 0.12, 0.07, 0.22);
  bus.connect(dest);
  strikeBell(c, bus, at, freq, 0.55, vol, [1, 2.8, 5.2]);
  noise(c, bus, at, 0.03, vol * 0.4, "highpass", 1800);
}

function renderPaymentSound(c: AudioContext, id: PaymentSoundId, t: number) {
  switch (id) {
    case "register1": {
      // Classic till: single bright bell strike, drawer slides open, soft stop.
      const bus = makeBus(c, 0.18);
      noise(c, bus, t, 0.03, 0.12, "bandpass", 4000);
      strikeBell(c, bus, t, 1320, 1.1, 0.24);
      noise(c, bus, t + 0.14, 0.3, 0.05, "bandpass", 1200);
      thud(c, bus, t + 0.45, 160, 0.16);
      break;
    }
    case "register2": {
      // Bright "cha-ching": grace note into shimmering triad.
      const bus = makeBus(c, 0.3, 0.075, 0.32);
      fmPing(c, bus, t, 1174.7, 0.13, 0.16);
      fmPing(c, bus, t + 0.09, 1568, 1.1, 0.2);
      fmPing(c, bus, t + 0.095, 1975.5, 0.9, 0.1);
      break;
    }
    case "register3": {
      // Heavy antique bell: low fundamental, long metallic ring.
      const bus = makeBus(c, 0.22, 0.13, 0.28);
      noise(c, bus, t, 0.04, 0.14, "bandpass", 3000);
      strikeBell(c, bus, t, 660, 1.8, 0.26, [1, 2.4, 4.2, 6.8, 10.1]);
      thud(c, bus, t + 0.5, 120, 0.14);
      break;
    }
    case "register4": {
      // Register bell then a cascade of coins.
      const bus = makeBus(c, 0.2);
      strikeBell(c, bus, t, 1400, 0.8, 0.22);
      [0.18, 0.24, 0.29, 0.35, 0.42, 0.5].forEach((d, i) => {
        noise(c, bus, t + d, 0.05, 0.08, "highpass", 3000);
        strikeBell(c, bus, t + d, 1700 + i * 180, 0.25, 0.1, [1, 2.7]);
      });
      break;
    }
    case "register5": {
      // Quick double "ching-ching".
      const bus = makeBus(c, 0.24, 0.06, 0.25);
      strikeBell(c, bus, t, 1500, 0.6, 0.22);
      strikeBell(c, bus, t + 0.11, 1880, 0.9, 0.2);
      break;
    }
    case "register6": {
      // Small, gentle counter bell.
      const bus = makeBus(c, 0.16);
      strikeBell(c, bus, t, 2093, 0.7, 0.16, [1, 2.9, 5.1]);
      break;
    }
    case "register7": {
      // Mechanical: lever crank, bell, drawer.
      const bus = makeBus(c, 0.14);
      noise(c, bus, t, 0.09, 0.1, "bandpass", 1800);
      thud(c, bus, t + 0.05, 220, 0.12);
      strikeBell(c, bus, t + 0.12, 1250, 1.0, 0.22);
      noise(c, bus, t + 0.28, 0.26, 0.06, "bandpass", 1000);
      thud(c, bus, t + 0.56, 140, 0.15);
      break;
    }
    case "register8": {
      // Modern POS: short beep then digital ching.
      const bus = makeBus(c, 0.2, 0.07, 0.28);
      const beep = c.createOscillator();
      beep.type = "square";
      beep.frequency.value = 1046.5;
      const bg = c.createGain();
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      beep.connect(bg).connect(bus);
      beep.start(t);
      beep.stop(t + 0.12);
      fmPing(c, bus, t + 0.12, 1760, 0.8, 0.2, 2.5);
      fmPing(c, bus, t + 0.125, 2637, 0.6, 0.08, 2.5);
      break;
    }
    case "register9": {
      // Big bell with a long echo tail.
      const bus = makeBus(c, 0.4, 0.16, 0.42);
      noise(c, bus, t, 0.035, 0.12, "bandpass", 3500);
      strikeBell(c, bus, t, 990, 1.6, 0.24, [1, 2.76, 5.4, 8.93, 13.3]);
      break;
    }
    case "register10": {
      // Full drawer cycle: ching, drawer out, pause, drawer shut.
      const bus = makeBus(c, 0.18);
      strikeBell(c, bus, t, 1450, 0.9, 0.22);
      strikeBell(c, bus, t + 0.1, 1150, 0.7, 0.14);
      noise(c, bus, t + 0.22, 0.3, 0.06, "bandpass", 1100);
      thud(c, bus, t + 0.5, 150, 0.14);
      noise(c, bus, t + 0.75, 0.18, 0.05, "bandpass", 900);
      thud(c, bus, t + 0.93, 110, 0.18);
      break;
    }
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
