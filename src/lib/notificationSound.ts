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
export function playNotificationSound() {
  if (!isNotificationSoundEnabled()) return;
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
