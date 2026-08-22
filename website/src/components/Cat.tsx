import { useEffect, useRef, useState } from "react";

/**
 * 猫的情绪状态 → 素材播放序列（透明底 Animated WebP）。
 * WebP 用 <img> 自动循环播放；非循环序列用 setTimeout 按时长推进。
 */
export type CatMood =
  | "calm"
  | "happy"
  | "curious"
  | "sleepy"
  | "sad"
  | "satisfied";

interface SeqStep {
  src: string;
  loop?: boolean;
}

const SEQUENCES: Record<CatMood, SeqStep[]> = {
  calm: [{ src: "/cats/calm-idle.webp", loop: true }],
  // 好奇：入场 → 循环（AI 思考中）
  curious: [
    { src: "/cats/curious-intro.webp" },
    { src: "/cats/curious-loop.webp", loop: true },
  ],
  // 记录成功：庆祝一下 → 回归常态
  happy: [
    { src: "/cats/excited.webp" },
    { src: "/cats/return-normal.webp" },
    { src: "/cats/calm-idle.webp", loop: true },
  ],
  // 日报生成：兴奋庆祝 → 哼歌满足 → 回归
  satisfied: [
    { src: "/cats/excited.webp" },
    { src: "/cats/hum.webp" },
    { src: "/cats/calm-idle.webp", loop: true },
  ],
  // 犯困：入睡 → 做梦循环
  sleepy: [
    { src: "/cats/sleep-intro.webp" },
    { src: "/cats/sleep-dream.webp", loop: true },
  ],
  // 被冷落：睡一会儿 → 醒来 → 回归常态
  sad: [
    { src: "/cats/sleep-intro.webp" },
    { src: "/cats/sleep-dream.webp" },
    { src: "/cats/sleep-wake.webp" },
    { src: "/cats/calm-idle.webp", loop: true },
  ],
};

// 每个 WebP 动画的实际时长（ms），用于非循环序列的推进
const DURATIONS: Record<string, number> = {
  "/cats/calm-idle.webp": 4280,
  "/cats/curious-intro.webp": 2240,
  "/cats/curious-loop.webp": 2720,
  "/cats/curious-a-ha.webp": 1920,
  "/cats/curious-outro.webp": 2160,
  "/cats/excited.webp": 1440,
  "/cats/hum.webp": 4960,
  "/cats/return-normal.webp": 1240,
  "/cats/sleep-intro.webp": 1720,
  "/cats/sleep-dream.webp": 6320,
  "/cats/sleep-wake.webp": 3360,
  "/cats/wash.webp": 4280,
};

export const MOOD_LABEL: Record<CatMood, string> = {
  calm: "静静陪着",
  happy: "开心",
  curious: "竖起耳朵",
  sleepy: "有点困了……",
  sad: "想你了",
  satisfied: "一脸满足",
};

interface CatProps {
  mood?: CatMood;
  size?: number;
  className?: string;
  /** 临时覆盖播放（如 a-ha 瞬间），播完由外部 setTempVideo(null) 切回 */
  tempVideo?: string | null;
  /** 序列进入循环结尾后触发（用于自动回常态） */
  onSeqEnd?: () => void;
  /** 序列自动回到常态的停留时间（ms），仅对非循环结尾生效 */
  autoCalmAfter?: number;
}

export default function Cat({
  mood = "calm",
  size = 120,
  className = "",
  tempVideo = null,
  onSeqEnd,
  autoCalmAfter = 5200,
}: CatProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const moodRef = useRef(mood);
  const seqEndFired = useRef(false);

  // mood 变化 → 从序列头开始
  useEffect(() => {
    if (moodRef.current !== mood) {
      moodRef.current = mood;
      setStepIdx(0);
      seqEndFired.current = false;
    }
  }, [mood]);

  const seq = SEQUENCES[mood];
  const step = seq[Math.min(stepIdx, seq.length - 1)];
  const isLastStep = stepIdx >= seq.length - 1;
  const currentSrc = tempVideo ?? step.src;

  // 非循环动画：按时长推进到下一步（img 没有 ended 事件，用 setTimeout）
  useEffect(() => {
    if (tempVideo) return; // tempVideo 由外部 setTempVideo(null) 切回
    if (step.loop) return; // 循环动画 img 自动播
    const duration = DURATIONS[step.src] ?? 2000;
    const t = setTimeout(() => {
      if (!isLastStep) setStepIdx((i) => i + 1);
    }, duration);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.src, stepIdx, tempVideo]);

  // 非循环序列进入循环结尾后，停留一会自动回常态
  useEffect(() => {
    if (
      mood !== "calm" &&
      mood !== "sleepy" &&
      mood !== "curious" &&
      isLastStep &&
      !tempVideo &&
      !seqEndFired.current
    ) {
      seqEndFired.current = true;
      const t = setTimeout(() => onSeqEnd?.(), autoCalmAfter);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, mood, tempVideo]);

  return (
    <div className={`cat-stage ${className}`} style={{ width: size, height: size }}>
      <img
        key={currentSrc}
        src={currentSrc}
        alt="DailySnap 小猫"
        width={size}
        height={size}
        draggable={false}
        decoding="async"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
