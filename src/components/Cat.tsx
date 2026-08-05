import { motion } from "framer-motion";
import { type ReactNode } from "react";

export type CatMood = "happy" | "calm" | "sleepy" | "sad" | "curious" | "satisfied";

interface CatProps {
  mood?: CatMood;
  size?: number;
  /** Show the unread/reminder dot in the top-right corner */
  hasNotification?: boolean;
  /** Show a small speech bubble (optional children) */
  speech?: ReactNode;
  /** Inline animation class to attach to the cat (e.g. "float" or "shake") */
  className?: string;
}

/**
 * DailySnap's little black cat — warm white body, orange ear tips, cheeky face.
 * Stylistically references the reference Jade shared:
 *  - Cream/white face and body (#f8f0e3)
 *  - Orange-pink ear tips (#e8a07a)
 *  - Round black dot eyes (#1a1a1a)
 *  - Pink nose triangle
 *  - Long black whiskers (the "贱兮兮" vibes)
 *  - Slight tail curl visible at bottom right
 */
export function Cat({
  mood = "calm",
  size = 56,
  hasNotification = false,
  speech,
  className = "",
}: CatProps) {
  const labelMap: Record<CatMood, string> = {
    happy: "开心",
    calm: "安静",
    sleepy: "困了",
    sad: "想你",
    curious: "好奇",
    satisfied: "满足",
  };

  return (
    <motion.div
      className={`relative inline-flex flex-col items-center ${className}`}
      animate={
        mood === "happy" || mood === "satisfied"
          ? { y: [0, -3, 0], rotate: [0, -2, 2, 0] }
          : mood === "sad"
          ? { y: [0, 1, 0] }
          : mood === "sleepy"
          ? { y: [0, 1, 0], scale: [1, 1.02, 1] }
          : { y: 0 }
      }
      transition={
        mood === "happy" || mood === "satisfied"
          ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
          : mood === "sleepy"
          ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
          : { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
      }
    >
      {/* Speech bubble (optional) */}
      {speech && (
        <div
          className="absolute -top-2 left-full ml-2 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap shadow-md pointer-events-none"
          style={{
            background: "#fbf9f3",
            color: "#1f1d18",
            border: "1px solid #ddd6c4",
          }}
        >
          {speech}
        </div>
      )}

      {/* Notification dot */}
      {hasNotification && (
        <motion.span
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full z-10"
          style={{ background: "#d85a30", boxShadow: "0 0 0 1.5px #1f1d18" }}
        />
      )}

      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        style={{ overflow: "visible" }}
      >
        {/* Tail (curls out from right side) */}
        <path
          d="M 50 50 Q 60 48 58 56"
          stroke="#1f1d18"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        {/* Whisker hatch lines on left */}
        <g stroke="#1f1d18" strokeWidth="0.8" strokeLinecap="round">
          <line x1="6" y1="30" x2="14" y2="31" />
          <line x1="6" y1="34" x2="14" y2="33" />
          <line x1="6" y1="38" x2="14" y2="35" />
        </g>
        {/* Whisker hatch lines on right */}
        <g stroke="#1f1d18" strokeWidth="0.8" strokeLinecap="round">
          <line x1="50" y1="31" x2="58" y2="30" />
          <line x1="50" y1="33" x2="58" y2="34" />
          <line x1="50" y1="35" x2="58" y2="38" />
        </g>

        {/* Left ear (with orange tip) */}
        <path
          d="M 18 18 L 16 6 L 28 14 Z"
          fill="#f8f0e3"
          stroke="#1f1d18"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M 19 17 L 17.5 8 L 25 13 Z"
          fill="#e8a07a"
          stroke="none"
          opacity={mood === "happy" || mood === "curious" ? 1 : 0.8}
        />
        {/* Right ear */}
        <path
          d="M 46 18 L 48 6 L 36 14 Z"
          fill="#f8f0e3"
          stroke="#1f1d18"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M 45 17 L 46.5 8 L 39 13 Z"
          fill="#e8a07a"
          stroke="none"
        />

        {/* Head — round, slightly egg-shaped (top narrower than bottom) */}
        <ellipse cx="32" cy="36" rx="20" ry="18" fill="#f8f0e3" stroke="#1f1d18" strokeWidth="1.5" />

        {/* Forehead stripe (the little brown tuft between ears — the "贱兮兮" mark) */}
        <path
          d="M 29 18 Q 31 16 33 18"
          stroke="#a8755a"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        <line x1="29.5" y1="20" x2="29.5" y2="22" stroke="#a8755a" strokeWidth="0.8" />
        <line x1="32" y1="20" x2="32" y2="22.5" stroke="#a8755a" strokeWidth="0.8" />
        <line x1="34.5" y1="20" x2="34.5" y2="22" stroke="#a8755a" strokeWidth="0.8" />

        {/* Cheek blushes (warm orange) */}
        <ellipse cx="18" cy="40" rx="3.5" ry="2" fill="#f0a898" opacity="0.55" />
        <ellipse cx="46" cy="40" rx="3.5" ry="2" fill="#f0a898" opacity="0.55" />

        {/* Eyes */}
        <Eyes mood={mood} />

        {/* Nose — tiny pink triangle */}
        <path
          d="M 30 38 L 34 38 L 32 40.5 Z"
          fill="#e89090"
        />

        {/* Mouth — varies by mood */}
        <Mouth mood={mood} />

        {/* Tear drop for sad */}
        {mood === "sad" && (
          <motion.ellipse
            cx="44" cy="42" rx="1" ry="1.8"
            fill="#a8d4e8"
            animate={{ y: [0, 4, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}

        {/* Z's for sleepy */}
        {mood === "sleepy" && (
          <g>
            <text x="44" y="22" fontSize="6" fill="#8a8880" fontFamily="sans-serif">z</text>
            <text x="48" y="18" fontSize="5" fill="#8a8880" fontFamily="sans-serif" opacity="0.7">z</text>
            <text x="51" y="14" fontSize="4" fill="#8a8880" fontFamily="sans-serif" opacity="0.5">z</text>
          </g>
        )}

        {/* Sparkles for satisfied */}
        {mood === "satisfied" && (
          <g>
            <text x="44" y="18" fontSize="6" fill="#d4a574">✦</text>
            <text x="14" y="22" fontSize="5" fill="#d4a574">✦</text>
          </g>
        )}
      </svg>

      {/* Mood label — shown in expanded view only (caller decides) */}
      {false && <span className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{labelMap[mood]}</span>}
    </motion.div>
  );
}

function Eyes({ mood }: { mood: CatMood }) {
  if (mood === "sleepy" || mood === "sad") {
    // Half-closed / sad eyes
    return (
      <g>
        <ellipse cx="24" cy="32" rx="2.5" ry="1.4" fill="#1f1d18" />
        <ellipse cx="40" cy="32" rx="2.5" ry="1.4" fill="#1f1d18" />
        {/* Sleepy eye lines (curve below eye like a smile indicating closed eyes) */}
        {mood === "sleepy" && (
          <>
            <path d="M 21 34 Q 24 36 27 34" stroke="#1f1d18" strokeWidth="0.8" fill="none" />
            <path d="M 37 34 Q 40 36 43 34" stroke="#1f1d18" strokeWidth="0.8" fill="none" />
          </>
        )}
      </g>
    );
  }

  // Default round black eyes with white highlight (open, alert)
  return (
    <g>
      <motion.circle
        cx="24"
        cy="32"
        r="3"
        fill="#1f1d18"
        animate={mood === "happy" || mood === "curious" ? { ry: [3, 3.4, 3] } : {}}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle
        cx="40"
        cy="32"
        r="3"
        fill="#1f1d18"
        animate={mood === "happy" || mood === "curious" ? { ry: [3, 3.4, 3] } : {}}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Eye highlights — sparkle */}
      <circle cx="25" cy="31" r="0.7" fill="#fbf9f3" />
      <circle cx="41" cy="31" r="0.7" fill="#fbf9f3" />
    </g>
  );
}

function Mouth({ mood }: { mood: CatMood }) {
  const stroke = "#1f1d18";
  if (mood === "happy") {
    // Wide open smile
    return (
      <path
        d="M 28 41 Q 32 45 36 41"
        stroke={stroke}
        strokeWidth="1.2"
        fill="#1f1d18"
        strokeLinecap="round"
      />
    );
  }
  if (mood === "satisfied") {
    // Content closed smile
    return (
      <path
        d="M 28 42 Q 32 45 36 42"
        stroke={stroke}
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    );
  }
  if (mood === "sad" || mood === "sleepy") {
    // Frown
    return (
      <path
        d="M 29 42 Q 32 40 35 42"
        stroke={stroke}
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
    );
  }
  // Default — slight smirk (the "贱兮兮" look)
  return (
    <path
      d="M 28 42 Q 32 44 36 41"
      stroke={stroke}
      strokeWidth="1"
      fill="none"
      strokeLinecap="round"
    />
  );
}