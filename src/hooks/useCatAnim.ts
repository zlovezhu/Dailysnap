/**
 * useCatAnim — Cat mood → video sequence state machine.
 *
 * Moods:
 *   calm    → static PNG + random idle oneshots (blink/wash/hum)
 *   happy   → static PNG → excited-oneshot → static PNG
 *   satisfied → static PNG → return-normal-oneshot → static PNG
 *   curious → intro → loop(until done) → (A:a-ha | B:return-normal) → outro → static
 *   sleepy  → sleep-intro → sleep-static → (random sleep-dream) → sleep-static → (wake on click/send)
 *
 * Type A (normal)  vs Type B (followup-last): distinguish via `curiousType`.
 */
import { useEffect, useRef, useState, useCallback } from "react";

export type CatMood = "happy" | "calm" | "sleepy" | "sad" | "curious" | "satisfied";
export type CuriousType = "A" | "B";
export type OneShot = "excited" | "happy" | "satisfied" | "wash" | "hum" | "blink" | "dream";

export interface CatAnimState {
  /** The <video> src to play. null → show static PNG. */
  videoSrc: string | null;
  /** Fallback poster image (shown while video loads, or when video fails) */
  posterSrc: string;
  /** Whether the video should loop */
  loop: boolean;
  /** Key to force remounting the video element on src change */
  playKey: number;
  /** Static image to show when no video is playing */
  staticSrc: string;
}

// Video asset map — all live under /cat/
const VID = (name: string) => `/cat/${name}.mov`;

const ANIM = {
  blink:   VID("calm-idle"),
  wash:    VID("wash"),
  hum:     VID("hum"),
  curiousIntro:  VID("curious-intro"),
  curiousLoop:   VID("curious-loop"),
  curiousAHa:    VID("curious-a-ha"),
  curiousOutro:  VID("curious-outro"),
  excited: VID("excited"),
  returnNormal:  VID("return-normal"),
  sleepIntro:    VID("sleep-intro"),
  sleepDream:    VID("sleep-dream"),
  sleepWake:     VID("sleep-wake"),
} as const;

// ──── timing constants ────
const IDLE_BLINK_MIN = 18_000;  // 18s — was 45s, more frequent per user request
const IDLE_BLINK_MAX = 35_000;
const IDLE_BLINK_CHANCE = 0.55;  // 55% — blink is the default idle action
const IDLE_WASH_CHANCE = 0.22;   // 22% — was 12%, more frequent
const IDLE_HUM_CHANCE  = 0.10;   // 10% — was 6%, more frequent
const IDLE_CHECK_INTERVAL = 12_000; // check every 12s — was 30s
const SLEEP_AFTER_MS = 5 * 60_000; // 5 minutes inactive
const SLEEP_DREAM_CHANCE = 0.18;    // per check, slightly more frequent

// ──── path helpers ────
const STATIC_CALM = "/cat/calm-static.png";
const STATIC_SLEEP = "/cat/sleep-static.png";

function pickRandomIdle(): OneShot | null {
  const r = Math.random();
  if (r < IDLE_HUM_CHANCE) return "hum";
  if (r < IDLE_HUM_CHANCE + IDLE_WASH_CHANCE) return "wash";
  // Blink is the most common idle action
  if (r < IDLE_HUM_CHANCE + IDLE_WASH_CHANCE + IDLE_BLINK_CHANCE) return "blink";
  // (no idle action this tick — keep static)
  return null;
}

export function useCatAnim(mood: CatMood, curiousType: CuriousType = "A") {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [loop, setLoop] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const [staticSrc, setStaticSrc] = useState(STATIC_CALM);

  // Refs for state that shouldn't trigger re-renders
  const phaseRef = useRef<"idle" | "intro" | "loop" | "outro" | "oneshot" | "aHa">("idle");
  const moodRef = useRef(mood);
  // Lock that prevents mood-change watcher from running while finishCurious
  // is mid-sequence. Otherwise React batches setCatMood("curious") and the
  // watcher re-triggers playSequence(intro) right after finishCurious sets aHa.
  const lockMoodEffectRef = useRef(false);
  const isSleepingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef(Date.now());

  moodRef.current = mood;

  // ──── clear all timers ────
  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  // ──── play a oneshot, then return to static ────
  const playOneShot = useCallback((src: string, onDone?: () => void) => {
    clearTimers();
    phaseRef.current = "oneshot";
    setLoop(false);
    setVideoSrc(src);
    setPlayKey(k => k + 1);
    timerRef.current = setTimeout(() => {
      onDone?.();
    }, 8000); // safety timeout (videos are <3s)
  }, [clearTimers]);

  // ──── play intro → loop → outro sequence ────
  const playSequence = useCallback((
    intro: string, loopSrc: string, outro: string,
    oneshot?: string,  // occasional burst after loop
  ) => {
    clearTimers();
    phaseRef.current = "intro";
    setLoop(false);
    setVideoSrc(intro);
    setPlayKey(k => k + 1);
  }, [clearTimers]);

  // ──── start idle timer ────
  const startIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    idleTimerRef.current = setInterval(() => {
      if (moodRef.current !== "calm" || isSleepingRef.current || phaseRef.current !== "idle") return;

      // Check sleep
      if (Date.now() - lastActivityRef.current > SLEEP_AFTER_MS) {
        // Enter sleep
        isSleepingRef.current = true;
        setStaticSrc(STATIC_SLEEP);
        playOneShot(ANIM.sleepIntro, () => {
          phaseRef.current = "idle";
          setVideoSrc(null);
          setStaticSrc(STATIC_SLEEP);
          // start sleep dream timer
          startSleepDreamTimer();
        });
        return;
      }

      // Random idle animation
      const idle = pickRandomIdle();
      if (!idle) return;
      lastActivityRef.current = Date.now(); // reset activity (random idle counts as activity)
      const src = idle === "blink" ? ANIM.blink : idle === "wash" ? ANIM.wash : ANIM.hum;
      playOneShot(src);
    }, IDLE_CHECK_INTERVAL);
  }, [playOneShot]);

  // ──── sleep dream timer ────
  const startSleepDreamTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!isSleepingRef.current || moodRef.current !== "sleepy") {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        return;
      }
      if (phaseRef.current === "idle" && Math.random() < SLEEP_DREAM_CHANCE) {
        playOneShot(ANIM.sleepDream, () => {
          phaseRef.current = "idle";
          setVideoSrc(null);
        });
      }
    }, 30000) as unknown as number; // 30s interval
  }, [playOneShot]);

  // ──── wake from sleep ────
  const wakeUp = useCallback(() => {
    if (!isSleepingRef.current) return;
    isSleepingRef.current = false;
    setStaticSrc(STATIC_CALM);
    playOneShot(ANIM.sleepWake, () => {
      phaseRef.current = "idle";
      setVideoSrc(null);
      lastActivityRef.current = Date.now();
    });
  }, [playOneShot]);

  // ──── video ended callback ────
  const onVideoEnded = useCallback(() => {
    const phase = phaseRef.current;
    const currentMood = moodRef.current;

    if (phase === "intro") {
      // intro done → play loop
      phaseRef.current = "loop";
      if (currentMood === "curious") {
        setLoop(true);
        setVideoSrc(ANIM.curiousLoop);
        setPlayKey(k => k + 1);
      } else if (currentMood === "sleepy") {
        // sleep intro done → show sleep static
        phaseRef.current = "idle";
        setVideoSrc(null);
        setLoop(false);
      } else {
        phaseRef.current = "idle";
        setVideoSrc(null);
        setLoop(false);
      }
    } else if (phase === "aHa") {
      // aHa (curious-a-ha) finished → play outro
      phaseRef.current = "outro";
      setVideoSrc(ANIM.curiousOutro);
      setPlayKey(k => k + 1);
    } else if (phase === "outro") {
      // curious-outro finished → back to static
      phaseRef.current = "idle";
      setVideoSrc(null);
      setLoop(false);
    } else if (phase === "oneshot") {
      phaseRef.current = "idle";
      setVideoSrc(null);
      setLoop(false);
    }
    // "idle" and "loop" don't auto-transition; loop continues; idle stays idle.
  }, []);

  // ──── mood change watcher ────
  useEffect(() => {
    // Skip if finishCurious is mid-sequence (its state changes would
    // clobber the aHa/outro sequence). Lock auto-resets once we reach idle.
    if (lockMoodEffectRef.current && phaseRef.current !== "idle") return;
    lockMoodEffectRef.current = false;

    const prev = moodRef.current;
    lastActivityRef.current = Date.now();

    // Wake up if sleeping and user interacts
    if (isSleepingRef.current) {
      wakeUp();
      return;
    }

    if (mood === "curious") {
      // Thinking sequence
      playSequence(ANIM.curiousIntro, ANIM.curiousLoop, ANIM.curiousOutro);
      // 安全网：3.5s 后若仍在 loop/intro，自动结束（用 Type B 跳过 aHa，
      // 因为 aHa 是 ProRes 视频，WKWebView 切换有概率崩帧）。
      // 父组件若在此之前调了 finishCurious，cleanup 会清掉这个 timer。
      const safetyTimer = setTimeout(() => {
        const p = phaseRef.current;
        if (p === "intro" || p === "loop") finishCurious("B");
      }, 3500);
      return () => clearTimeout(safetyTimer);
    } else if (mood === "happy") {
      playOneShot(ANIM.excited);
    } else if (mood === "satisfied") {
      // satisfied → return-normal oneshot
      playOneShot(ANIM.returnNormal);
    } else if (mood === "sleepy") {
      // Enter sleep (already sleeping or about to)
      if (!isSleepingRef.current) {
        isSleepingRef.current = true;
        setStaticSrc(STATIC_SLEEP);
        playOneShot(ANIM.sleepIntro, () => {
          phaseRef.current = "idle";
          setVideoSrc(null);
          setLoop(false);
          startSleepDreamTimer();
        });
      }
    } else if (mood === "calm") {
      // Return to calm
      if (isSleepingRef.current) {
        wakeUp();
      } else {
        phaseRef.current = "idle";
        setVideoSrc(null);
        setLoop(false);
        setStaticSrc(STATIC_CALM);
        startIdleTimer();
      }
    }

    return () => { clearTimers(); };
  }, [mood]);

  // ──── finish curious sequence (called from outside when AI responds) ────
  // Phase-driven: relies on video.onEnded to advance through burst → outro → idle.
  // Don't use setTimeout to estimate video duration (they're all ~2s, hard to time).
  const finishCurious = useCallback((type: CuriousType = "A") => {
    clearTimers();
    setLoop(false);
    // Lock mood-change watcher so any subsequent syncCatMood calls
    // (e.g. satisfied) don't trigger playOneShot and clobber our aHa/outro.
    lockMoodEffectRef.current = true;

    if (type === "A") {
      // Type A: burst (a-ha) → outro → static. onEnded will advance phases.
      phaseRef.current = "aHa";
      setVideoSrc(ANIM.curiousAHa);
      setPlayKey(k => k + 1);
    } else {
      // Type B: just outro → static
      phaseRef.current = "outro";
      setVideoSrc(ANIM.curiousOutro);
      setPlayKey(k => k + 1);
    }
  }, [clearTimers]);

  // ──── cleanup on unmount ────
  useEffect(() => () => {
    clearTimers();
    if (idleTimerRef.current) clearInterval(idleTimerRef.current);
  }, [clearTimers]);

  return {
    videoSrc,
    loop,
    playKey,
    staticSrc,
    posterSrc: STATIC_CALM,
    onVideoEnded,
    finishCurious,
    wakeUp,
  };
}
