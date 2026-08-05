import { motion } from "framer-motion";
import { type ReactNode, useState } from "react";
import headImage from "../assets/cat/head.png";
import fullImage from "../assets/cat/full.png";

export type CatMood = "happy" | "calm" | "sleepy" | "sad" | "curious" | "satisfied";

interface CatProps {
  mood?: CatMood;
  size?: number;
  /** Show the unread/reminder dot in the top-right corner */
  hasNotification?: boolean;
  /** Show a small speech bubble (optional children) */
  speech?: ReactNode;
  /** Use the full-body image instead of just the head. For onboarding or empty states. */
  variant?: "head" | "full";
  /** Disable the floating/breathing animation entirely */
  staticPose?: boolean;
  /** Pass-through className for the wrapper */
  className?: string;
}

/**
 * DailySnap's little orange cat. The default rendering uses the
 * reference image you supplied (the warm orange tabby with the cheeky smile).
 *
 * When no image asset is available for a given mood, we fall back to the
 * CSS-only Cat. The PNG and SVG variants share the same framer-motion
 * animation, mood label and notification dot behaviour.
 */
export function Cat({
  mood = "calm",
  size = 56,
  hasNotification = false,
  speech,
  variant = "head",
  staticPose = false,
  className = "",
}: CatProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageSrc = variant === "full" ? fullImage : headImage;
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
      className={`relative inline-flex ${className}`}
      style={{ lineHeight: 0, verticalAlign: "middle" }}
      animate={
        staticPose ? { y: 0 } :
        mood === "happy" || mood === "satisfied"
          ? { y: [0, -3, 0], rotate: [0, -2, 2, 0] }
          : mood === "sad"
          ? { y: [0, 1, 0] }
          : mood === "sleepy"
          ? { y: [0, 1, 0], scale: [1, 1.02, 1] }
          : { y: 0 }
      }
      transition={
        staticPose ? { duration: 0 } :
        mood === "happy" || mood === "satisfied"
          ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
          : mood === "sleepy"
          ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
          : { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
      }
    >
      {/* speech bubble above the cat */}
      {speech && (
        <div
          className="absolute -top-2 left-full ml-2 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap shadow-md pointer-events-none"
          style={{ background: "#fbf9f3", color: "#1f1d18", border: "1px solid #ddd6c4" }}
        >
          {speech}
        </div>
      )}

      {/* notification dot */}
      {hasNotification && (
        <motion.span
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full z-10"
          style={{ background: "#e85a2c", boxShadow: "0 0 0 1.5px #ffffff" }}
        />
      )}

      {/* size container — the motion parent doesn't control sizing */}
      <div
        style={{
          width: size,
          height: size,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 0,
        }}
      >
        {imageFailed ? (
          <CatSvg mood={mood} size={size} />
        ) : (
          <img
            src={imageSrc}
            alt="猫猫"
            draggable={false}
            onError={() => setImageFailed(true)}
            style={{
              width: size,
              height: size,
              objectFit: "contain",
              objectPosition: "center center",
              pointerEvents: "none",
              userSelect: "none",
              display: "block",
            }}
          />
        )}
      </div>
    </motion.div>
  );
}

/* === Pure-CSS fallback cat (used when PNG fails to load) === */
function CatSvg({ mood, size }: { mood: CatMood; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ overflow: "visible" }}>
      <path d="M 50 50 Q 60 48 58 56" stroke="#1f1d18" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path
        d="M 18 18 L 16 6 L 28 14 Z M 46 18 L 48 6 L 36 14 Z M 32 36 m -20 -18 r 20 18 fill #f8f0e3 stroke #1f1d18 strokeWidth 1.5"
        fill="#f8f0e3"
        stroke="#1f1d18"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <ellipse cx="18" cy="40" rx="3.5" ry="2" fill="#f0a898" opacity="0.55" />
      <ellipse cx="46" cy="40" rx="3.5" ry="2" fill="#f0a898" opacity="0.55" />
      <path d="M 30 38 L 34 38 L 32 40.5 Z" fill="#e89090" />
    </svg>
  );
}