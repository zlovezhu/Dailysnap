import { type ReactNode, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import headImage from "../assets/cat/head.png";
import { useCatAnim, type CatMood, type CuriousType } from "../hooks/useCatAnim";

export type { CatMood };

export interface CatHandle {
  finishCurious: (type: CuriousType) => void;
}

interface CatProps {
  mood?: CatMood;
  size?: number;
  hasNotification?: boolean;
  speech?: ReactNode;
  variant?: "head" | "full";
  staticPose?: boolean;
  className?: string;
  /** Type A = normal thinking, Type B = followup-last */
  curiousType?: CuriousType;
  /** Called when the curious sequence should finish (AI responded) */
  onFinishCurious?: () => void;
}

/**
 * DailySnap's cat — now powered by video animations (ProRes 4444 + alpha).
 *
 * variant="head" → original head.png + framer-motion float (for title bars)
 * variant="full" → video state machine (for desktop pet & chat panels)
 */
export const Cat = forwardRef<CatHandle, CatProps>(function Cat({
  mood = "calm",
  size = 96,
  hasNotification = false,
  speech,
  variant = "head",
  staticPose = false,
  className = "",
  curiousType = "A",
  onFinishCurious,
}, ref) {
  const [imageFailed, setImageFailed] = useState(false);
  // Track whether the current video has loaded its first frame.
  // We hide the static PNG base layer once the video is ready, otherwise
  // both would render simultaneously and produce a "ghost/double cat" effect
  // (ProRes alpha sometimes takes a few hundred ms to apply on macOS WKWebView).
  const [videoReady, setVideoReady] = useState(false);

  // ── head variant: simple PNG (unchanged) ──
  if (variant === "head") {
    return (
      <div
        className={className}
        style={{
          width: size, height: size, minWidth: size, maxWidth: size,
          flexShrink: 0, position: "relative", overflow: "visible",
          lineHeight: 0, display: "block",
        }}
      >
        {speech && (
          <div className="absolute -top-2 left-full ml-2 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap shadow-md pointer-events-none"
            style={{ background: "#fbf9f3", color: "#1f1d18", border: "1px solid #ddd6c4" }}>
            {speech}
          </div>
        )}
        {imageFailed ? (
          <CatSvg mood={mood} size={size} />
        ) : (
          <img src={headImage} alt="猫猫" draggable={false}
            onError={(e) => { console.error("[Cat] head image failed", e); }}
            style={{
              width: "100%", height: "100%",
              objectFit: "cover", objectPosition: "50% 78%",
              pointerEvents: "none", userSelect: "none", display: "block",
            }}
          />
        )}
      </div>
    );
  }

  // ── full variant: video + static PNG ──
  const { videoSrc, loop, playKey, staticSrc, posterSrc, onVideoEnded, finishCurious, wakeUp } =
    useCatAnim(mood, curiousType);

  // Expose imperative handle so parent (FloatBall) can trigger finishCurious
  // when AI responds. This lets the cat decide Type A/B based on curiousTypeRef.
  useImperativeHandle(ref, () => ({
    finishCurious: (type: CuriousType) => finishCurious(type),
  }), [finishCurious]);

  // Inject breathing keyframes once
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("cat-breath-keyframes")) return;
    const style = document.createElement("style");
    style.id = "cat-breath-keyframes";
    style.textContent = `
      @keyframes catBreathe {
        0%, 100% { transform: translateY(0) scale(1); }
        50%      { transform: translateY(-1.5px) scale(1.015); }
      }
      @keyframes sleepBreathe {
        0%, 100% { transform: translateY(0) scale(1); opacity: 0.95; }
        50%      { transform: translateY(1px) scale(0.99); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Expose finishCurious to parent
  const finishRef = useRef(onFinishCurious);
  finishRef.current = onFinishCurious;

  const handleFinishCurious = useCallback(() => {
    finishCurious(curiousType);
    finishRef.current?.();
  }, [finishCurious, curiousType]);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // When videoSrc changes, explicitly reload + play.
  // We don't use `key` to remount the element (that breaks loop=true).
  // ProRes 4444 loading in WKWebView is slow — retry play() several times.
  useEffect(() => {
    setVideoReady(false);  // hide static PNG until new video is ready
    const v = videoRef.current;
    if (!v || !videoSrc) return;
    v.load();
    let attempts = 0;
    const tryPlay = () => {
      v.play().catch(() => {});
      attempts++;
      if (attempts < 8 && v.paused) setTimeout(tryPlay, 250);
    };
    setTimeout(tryPlay, 100);
  }, [videoSrc]);
  const handleVideoEnded = useCallback(() => {
    onVideoEnded();
  }, [onVideoEnded]);

  // Wake on click
  const handleClick = useCallback(() => {
    if (mood === "sleepy") wakeUp();
  }, [mood, wakeUp]);

  return (
    <div
      className={className}
      onClick={handleClick}
      style={{
        width: size, height: size, minWidth: size, maxWidth: size,
        flexShrink: 0, position: "relative", overflow: "visible",
        lineHeight: 0, display: "block",
      }}
    >
      {speech && (
        <div className="absolute -top-2 left-full ml-2 px-3 py-1.5 rounded-xl text-xs whitespace-nowrap shadow-md pointer-events-none"
          style={{ background: "#fbf9f3", color: "#1f1d18", border: "1px solid #ddd6c4" }}>
          {speech}
        </div>
      )}
      {hasNotification && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full z-10"
          style={{ background: "#e85a2c", boxShadow: "0 0 0 1.5px #ffffff", animation: "pulse 1s infinite" }}
        />
      )}

      {/* Static PNG BASE LAYER — only shown when no video is ready.
         关键修复：WKWebView 中 <video> 元素即使视频带 alpha 通道，
         在视频加载中/解码失败/某些 macOS 状态下仍会显示黑色矩形。
         这里作为"视频未加载完成时的占位图"，等 videoReady=true 时
         自动隐藏（避免和视频叠加产生重影）。 */}
      {!videoReady && (
        <img
          src={staticSrc}
          alt="猫猫"
          draggable={false}
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "contain", objectPosition: "center center",
            pointerEvents: "none", userSelect: "none",
            display: "block",
            animation: staticSrc.endsWith("sleep-static.png")
              ? "sleepBreathe 3.4s ease-in-out infinite"
              : "catBreathe 2.6s ease-in-out infinite",
            transformOrigin: "center bottom",
          }}
        />
      )}

      {/* Video layer — only shown when videoSrc is set */}
      {videoSrc && !imageFailed && (
        <video
          ref={videoRef}
          src={videoSrc}
          muted playsInline autoPlay
          loop={loop}
          poster={posterSrc}
          onEnded={handleVideoEnded}
          onLoadedData={(e) => {
            // Force play when video is ready (WKWebView sometimes
            // doesn't autoplay after navigation/visibility changes).
            const v = e.currentTarget;
            v.play().catch(() => {});
            // 关键修复：视频第一帧已加载，隐藏静态 PNG 底图，避免和视频叠加产生重影。
            setVideoReady(true);
          }}
          onError={(e) => {
            console.error("[Cat] video failed to load:", videoSrc, e);
            // 视频加载失败时也显示静态 PNG（已经在 !videoReady 时显示）
            // 但 setVideoReady(false) 已经是 useEffect 中的初始状态，无需操作
            setVideoReady(false);
          }}
          style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%",
            objectFit: "contain", objectPosition: "center center",
            pointerEvents: "none", userSelect: "none",
            display: "block",
            // 尝试让 video 元素自身透明（macOS WKWebView 上有时不生效，
            // 但加上不会有副作用）
            background: "transparent",
          }}
        />
      )}

      {/* Auto-resume video when window becomes visible. WKWebView pauses
          video on hidden and sometimes fails to resume on visible. */}
      {videoSrc && !imageFailed && (
        <VideoResumer videoRef={videoRef} />
      )}
    </div>
  );
});

/* === Pure-CSS fallback (unchanged) === */
function CatSvg({ mood, size }: { mood: CatMood; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ overflow: "visible" }}>
      <path d="M 50 50 Q 60 48 58 56" stroke="#1f1d18" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path
        d="M 18 18 L 16 6 L 28 14 Z M 46 18 L 48 6 L 36 14 Z M 32 36 m -20 -18 r 20 18 fill #f8f0e3 stroke #1f1d18 strokeWidth 1.5"
        fill="#f8f0e3" stroke="#1f1d18" strokeWidth="1.5" strokeLinejoin="round"
      />
      <ellipse cx="18" cy="40" rx="3.5" ry="2" fill="#f0a898" opacity="0.55" />
      <ellipse cx="46" cy="40" rx="3.5" ry="2" fill="#f0a898" opacity="0.55" />
      <path d="M 30 38 L 34 38 L 32 40.5 Z" fill="#e89090" />
    </svg>
  );
}

/* === Video resumer — handles WKWebView's tendency to pause videos
        on window visibility changes. Listens to document visibility,
        window focus, AND pageshow events. Also runs a polling check
        every 2s — videos can pause without firing any of these. === */
function VideoResumer({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const resume = () => {
      const v = videoRef.current;
      if (!v) return;
      // Only force-play if paused AND ready. Don't restart a playing video.
      if (v.paused && v.readyState >= 2) {
        v.play().catch(() => {});
      }
    };
    const onVisible = () => resume();
    const onFocus = () => resume();
    const onPageShow = () => resume();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [videoRef]);
  return null;
}
