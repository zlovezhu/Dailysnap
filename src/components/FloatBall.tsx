import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  canOpenOnDoubleClick,
  DialogueItem,
  getDynamicPromptByHour,
  isFinalReply,
  pickFallbackPrompt,
  shouldStartDrag,
  truncateForHint,
} from "../utils/floatInteraction";

type FloatMode = "compact" | "hint" | "expanded";

interface RecordRow {
  content: string;
  user_followup_reply?: string | null;
  created_at?: string;
}

interface FollowupState {
  active: boolean;
  round: number;
  maxRounds: number;
  baseContent: string;
  question: string;
  prompts: string[];
  replies: string[];
}

const DEFAULT_FOLLOWUP_STATE: FollowupState = {
  active: false,
  round: 0,
  maxRounds: 3,
  baseContent: "",
  question: "",
  prompts: [],
  replies: [],
};

const STORAGE_KEY = "dailysnap_float_dialogues_v1";
const CLICK_DELAY_MS = 220;
const AUTO_HIDE_MS = 5 * 60 * 1000;
const FADE_OUT_MS = 420;
const REPLAY_INTERVAL_MS = 3000;
const REPLAY_MAX_COUNT = 3;

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function loadDialoguesFromStorage(): DialogueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { date: string; items: DialogueItem[] };
    if (!parsed || parsed.date !== getTodayKey() || !Array.isArray(parsed.items)) {
      return [];
    }
    return parsed.items;
  } catch {
    return [];
  }
}

function saveDialoguesToStorage(items: DialogueItem[]) {
  const payload = {
    date: getTodayKey(),
    items,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function mergeDialogues(base: DialogueItem[], incoming: DialogueItem[]) {
  const map = new Map<string, DialogueItem>();
  [...base, ...incoming].forEach((item) => {
    const key = `${item.createdAt}|${item.content}`;
    map.set(key, item);
  });
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function FloatBall() {
  const [mode, setMode] = useState<FloatMode>("compact");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showCloseButton, setShowCloseButton] = useState(false);
  const [hintPrompt, setHintPrompt] = useState("嗨~ 现在在忙什么呀？");
  const [, setDialogues] = useState<DialogueItem[]>([]);
  const [isHintFading, setIsHintFading] = useState(false);
  const [hasUnreadReminder, setHasUnreadReminder] = useState(false);
  const [latestReminderText, setLatestReminderText] = useState("该记录一下当前进展啦");
  const [followup, setFollowup] = useState<FollowupState>(DEFAULT_FOLLOWUP_STATE);

  const modeRef = useRef<FloatMode>("compact");
  const followupActiveRef = useRef(false);

  const pointerStateRef = useRef({
    isDown: false,
    hasDragged: false,
    startX: 0,
    startY: 0,
  });

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const hideDeadlineRef = useRef<number | null>(null);
  const hideRemainingRef = useRef<number>(AUTO_HIDE_MS);
  const replayTimersRef = useRef<number[]>([]);
  const missedReminderCountRef = useRef<number>(0);

  const quickReplies = ["写文件", "开会", "改需求", "排查问题"];

  const clearHintTimers = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (fadeTimerRef.current) {
      window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    hideDeadlineRef.current = null;
  };

  const setModeWithWindow = async (next: FloatMode) => {
    modeRef.current = next;
    setMode(next);
    await invoke("set_float_mode", { mode: next }).catch(() => {});
  };

  const startHintAutoHide = (durationMs = AUTO_HIDE_MS) => {
    clearHintTimers();
    hideRemainingRef.current = durationMs;
    hideDeadlineRef.current = Date.now() + durationMs;
    setIsHintFading(false);

    hideTimerRef.current = window.setTimeout(() => {
      setIsHintFading(true);
      fadeTimerRef.current = window.setTimeout(async () => {
        setIsHintFading(false);
        setShowCloseButton(false);
        await setModeWithWindow("compact");
      }, FADE_OUT_MS);
    }, durationMs);
  };

  const pauseHintAutoHide = () => {
    if (mode !== "hint" || !hideDeadlineRef.current) return;
    const remaining = Math.max(0, hideDeadlineRef.current - Date.now());
    hideRemainingRef.current = remaining;
    clearHintTimers();
  };

  const resumeHintAutoHide = () => {
    if (mode !== "hint") return;
    const remaining = Math.max(0, hideRemainingRef.current || AUTO_HIDE_MS);
    startHintAutoHide(remaining);
  };

  const cancelReplayQueue = () => {
    replayTimersRef.current.forEach((id) => window.clearTimeout(id));
    replayTimersRef.current = [];
    missedReminderCountRef.current = 0;
  };

  const scheduleReplayReminders = () => {
    const replayCount = Math.min(missedReminderCountRef.current, REPLAY_MAX_COUNT);
    missedReminderCountRef.current = 0;
    if (replayCount <= 0) return;

    replayTimersRef.current = [];
    for (let i = 0; i < replayCount; i += 1) {
      const timer = window.setTimeout(async () => {
        const dynamicPrompt = getDynamicPromptByHour(new Date().getHours());
        await enterHintMode(dynamicPrompt, false);
      }, REPLAY_INTERVAL_MS * i);
      replayTimersRef.current.push(timer);
    }
  };

  const appendDialogue = (content: string) => {
    const nextItem: DialogueItem = {
      content,
      createdAt: new Date().toISOString(),
    };

    setDialogues((prev) => {
      const merged = mergeDialogues(prev, [nextItem]);
      saveDialoguesToStorage(merged);
      return merged;
    });
  };

  const loadTodayDialogues = async () => {
    const localItems = loadDialoguesFromStorage();
    try {
      const today = getTodayKey();
      const remote = await invoke<RecordRow[]>("get_records_by_date", { date: today });
      const remoteItems: DialogueItem[] = (remote || []).flatMap((item) => {
        const createdAt = item.created_at || new Date().toISOString();
        const rows: DialogueItem[] = [];
        if (item.content?.trim()) {
          rows.push({ content: item.content.trim(), createdAt });
        }
        if (item.user_followup_reply?.trim()) {
          rows.push({ content: item.user_followup_reply.trim(), createdAt });
        }
        return rows;
      });

      const merged = mergeDialogues(localItems, remoteItems);
      setDialogues(merged);
      saveDialoguesToStorage(merged);
    } catch {
      setDialogues(localItems);
    }
  };

  const enterHintMode = async (prompt: string, clearUnreadDot: boolean) => {
    setHintPrompt(prompt);
    setShowCloseButton(true);
    modeRef.current = "hint";
    setMode("hint");
    setIsHintFading(false);
    if (clearUnreadDot) {
      setHasUnreadReminder(false);
    }
    await invoke("set_float_mode", { mode: "hint" }).catch(() => {});
    startHintAutoHide(AUTO_HIDE_MS);
  };

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    followupActiveRef.current = followup.active;
  }, [followup.active]);

  useEffect(() => {
    const init = async () => {
      await invoke("set_float_mode", { mode: "compact" }).catch(() => {});
      await loadTodayDialogues();

      const unlistenReminder = await listen("reminder-trigger", async () => {
        const dynamicPrompt = getDynamicPromptByHour(new Date().getHours());
        setLatestReminderText(dynamicPrompt);
        setHasUnreadReminder(true);

        if (followupActiveRef.current || modeRef.current === "expanded") {
          if (followupActiveRef.current) {
            missedReminderCountRef.current += 1;
          }
          return;
        }
      });

      return () => {
        unlistenReminder();
      };
    };

    const cleanupPromise = init();
    return () => {
      clearHintTimers();
      cancelReplayQueue();
      if (clickTimerRef.current) {
        window.clearTimeout(clickTimerRef.current);
      }
      cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, []);

  useEffect(() => {
    if (mode === "hint") {
      startHintAutoHide(AUTO_HIDE_MS);
    } else {
      clearHintTimers();
      setIsHintFading(false);
    }
  }, [mode]);

  const beginPointerTrack = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("input") || target.closest("textarea") || target.closest("button")) return;

    pointerStateRef.current = {
      isDown: true,
      hasDragged: false,
      startX: e.screenX,
      startY: e.screenY,
    };
  };

  const handlePointerMove = async (e: React.MouseEvent) => {
    if (!pointerStateRef.current.isDown || pointerStateRef.current.hasDragged) return;

    const shouldDrag = shouldStartDrag(
      { x: pointerStateRef.current.startX, y: pointerStateRef.current.startY },
      { x: e.screenX, y: e.screenY },
      6
    );

    if (!shouldDrag) return;

    pointerStateRef.current.hasDragged = true;
    await invoke("start_drag_window", { label: "float-ball" }).catch(() => {});
  };

  const endPointerTrack = () => {
    pointerStateRef.current.isDown = false;
  };

  const openMain = async () => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    if (!canOpenOnDoubleClick(pointerStateRef.current.hasDragged)) return;

    setShowCloseButton(false);
    setIsHintFading(false);
    modeRef.current = "compact";
    setMode("compact");
    await invoke("set_float_mode", { mode: "compact" }).catch(() => {});
    await invoke("open_main_window").catch(() => {});
  };

  const collapseToCompact = async () => {
    setShowCloseButton(false);
    setIsHintFading(false);
    await setModeWithWindow("compact");
  };

  const handleCompactClick = () => {
    if (pointerStateRef.current.hasDragged) return;
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
    }

    clickTimerRef.current = window.setTimeout(async () => {
      if (hasUnreadReminder) {
        setHasUnreadReminder(false);
        await setModeWithWindow("expanded");
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
        });
      } else {
        const fallbackPrompt = pickFallbackPrompt();
        await enterHintMode(fallbackPrompt, true);
      }
      clickTimerRef.current = null;
    }, CLICK_DELAY_MS);
  };

  const handleSideBallClick = async () => {
    if (pointerStateRef.current.hasDragged) return;

    if (mode === "hint") {
      await handleHintClick();
      return;
    }

    if (mode === "expanded") {
      await collapseToCompact();
    }
  };

  const handleHintClick = async () => {
    if (mode !== "hint") return;
    cancelReplayQueue();
    setHasUnreadReminder(false);
    await setModeWithWindow("expanded");
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
    });
  };

  const closeCurrentHint = async () => {
    setHasUnreadReminder(false);
    await collapseToCompact();
  };

  const finalizeRecord = async (
    baseContent: string,
    replies: string[],
    prompts: string[],
    forcedHintPrompt?: string
  ) => {
    const userFollowupReply = replies.length > 0 ? replies.join(" | ") : null;
    const aiFollowup = prompts.length > 0 ? prompts.join(" | ") : null;

    await invoke("save_record", {
      content: baseContent,
      aiQuestion: hintPrompt,
      aiFollowup,
      userFollowupReply,
    });

    const summary = userFollowupReply ? `${baseContent}（补充：${replies[replies.length - 1]}）` : baseContent;
    appendDialogue(summary);

    setFollowup(DEFAULT_FOLLOWUP_STATE);
    setInput("");

    await setModeWithWindow("hint");
    if (forcedHintPrompt) {
      setHintPrompt(forcedHintPrompt);
    }

    if (missedReminderCountRef.current > 0) {
      scheduleReplayReminders();
    }
  };

  const sendRecord = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    try {
      if (!followup.active) {
        const aiReply = await invoke<string>("ai_chat", {
          userMessage: content,
          step: "first_reply",
        });

        if (isFinalReply(aiReply)) {
          await finalizeRecord(content, [], []);
        } else {
          setFollowup({
            active: true,
            round: 1,
            maxRounds: 3,
            baseContent: content,
            question: aiReply,
            prompts: [aiReply],
            replies: [],
          });
          setInput("");
          requestAnimationFrame(() => inputRef.current?.focus());
        }
        return;
      }

      const nextReplies = [...followup.replies, content];
      const nextRound = followup.round + 1;

      if (nextRound > followup.maxRounds) {
        await finalizeRecord(
          followup.baseContent,
          nextReplies,
          followup.prompts,
          "已达到追问上限，先帮你收束到当前记录。"
        );
        return;
      }

      const aiReply = await invoke<string>("ai_chat", {
        userMessage: `初始记录：${followup.baseContent}\n用户补充：${nextReplies.join("；")}`,
        step: "first_reply",
      });

      if (isFinalReply(aiReply)) {
        await finalizeRecord(followup.baseContent, nextReplies, followup.prompts);
        return;
      }

      if (nextRound >= followup.maxRounds) {
        await finalizeRecord(
          followup.baseContent,
          nextReplies,
          [...followup.prompts, aiReply],
          "已达到追问上限，先帮你收束到当前记录。"
        );
        return;
      }

      setFollowup((prev) => ({
        ...prev,
        round: nextRound,
        question: aiReply,
        prompts: [...prev.prompts, aiReply],
        replies: nextReplies,
      }));
      setInput("");
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch {
      await finalizeRecord(
        followup.active ? followup.baseContent : content,
        followup.active ? [...followup.replies, content] : [],
        followup.prompts,
        "网络波动，已先按当前内容记录。"
      ).catch(() => {});
    } finally {
      setSending(false);
    }
  };

  const endFollowupNow = async () => {
    if (!followup.active) return;
    await finalizeRecord(
      followup.baseContent,
      followup.replies,
      followup.prompts,
      "已结束追问，可继续补记或查看最近记录。"
    );
  };

  const fillQuickReply = (text: string) => {
    setInput(text);
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(text.length, text.length);
    });
  };

  const showPrompt = followup.active ? followup.question : hintPrompt;

  if (mode === "compact") {
    return (
      <div
        onMouseDown={beginPointerTrack}
        onMouseMove={handlePointerMove}
        onMouseUp={endPointerTrack}
        onMouseLeave={endPointerTrack}
        onClick={handleCompactClick}
        onDoubleClick={openMain}
        onMouseEnter={async () => {
          if (!hasUnreadReminder) return;
          if (modeRef.current !== "compact") return;
          await enterHintMode(latestReminderText, false);
        }}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1f1f1f",
          borderRadius: "12px",
          cursor: "grab",
          position: "relative",
        }}
      >
        {hasUnreadReminder && (
          <span
            style={{
              position: "absolute",
              top: "6px",
              right: "6px",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#ff4d4f",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.9)",
            }}
          />
        )}
        <ClockIcon />
      </div>
    );
  }

  if (mode === "hint") {
    return (
      <div
        onMouseDown={beginPointerTrack}
        onMouseMove={handlePointerMove}
        onMouseUp={endPointerTrack}
        onMouseLeave={async () => {
          endPointerTrack();
          await collapseToCompact();
        }}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          background: "transparent",
          position: "relative",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif",
          opacity: isHintFading ? 0 : 1,
          transform: "translateX(0)",
          transition: `opacity ${FADE_OUT_MS}ms ease, transform 180ms ease`,
        }}
      >
        <div
          style={{
            position: "relative",
            marginRight: "8px",
            maxWidth: "calc(100% - 74px)",
            overflow: "visible",
          }}
          onMouseEnter={() => {
            setShowCloseButton(true);
            pauseHintAutoHide();
          }}
          onMouseLeave={() => {
            setShowCloseButton(false);
            resumeHintAutoHide();
          }}
        >
          <div
            onClick={handleHintClick}
            style={{
              background: "#f3f3f3",
              borderRadius: "20px",
              padding: "9px 16px",
              color: "#111",
              fontSize: "16px",
              lineHeight: "1.35",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              cursor: "pointer",
              border: "1px solid #d7d7d7",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            {truncateForHint(latestReminderText, 28)}
          </div>

          {showCloseButton && (
            <button
              onMouseDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                closeCurrentHint();
              }}
              style={{
                position: "absolute",
                top: "-6px",
                left: "-6px",
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                border: "1px solid #c6c6c6",
                background: "#d8d8d8",
                color: "#111",
                fontSize: "14px",
                lineHeight: "18px",
                padding: 0,
                cursor: "pointer",
                zIndex: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>
          )}
        </div>

        <div
          onClick={handleSideBallClick}
          onDoubleClick={openMain}
          style={{
            width: "56px",
            minWidth: "56px",
            height: "56px",
            background: "#1f1f1f",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "grab",
            position: "relative",
          }}
        >
          {hasUnreadReminder && (
            <span
              style={{
                position: "absolute",
                top: "8px",
                right: "8px",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#ff4d4f",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.9)",
              }}
            />
          )}
          <ClockIcon />
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseDown={beginPointerTrack}
      onMouseMove={handlePointerMove}
      onMouseUp={endPointerTrack}
      onMouseLeave={() => {
        endPointerTrack();
      }}
      style={{
        width: "100%",
        height: "100%",
        background: "#ffffff",
        border: "1px solid #dcdcdc",
        borderRadius: "10px",
        display: "flex",
        alignItems: "stretch",
        overflow: "hidden",
        position: "relative",
        boxSizing: "border-box",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif",
        opacity: isHintFading ? 0 : 1,
        transform: "translateX(4px)",
        transition: `opacity ${FADE_OUT_MS}ms ease, transform 220ms ease`,
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: "10px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          gap: "6px",
          cursor: "grab",
          overflowY: "auto",
          overflowX: "hidden",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            minHeight: "22px",
          }}
        >
          <div style={{ fontSize: "13px", color: "#333", lineHeight: "1.4", fontWeight: 500 }}>{showPrompt}</div>
        </div>

        {followup.active && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2px" }}>
            <div style={{ fontSize: "11px", color: "#3a3a3a" }}>追问 {followup.round}/{followup.maxRounds}</div>
            <button
              onClick={endFollowupNow}
              style={{
                border: "none",
                background: "transparent",
                color: "#8a8a8a",
                fontSize: "11px",
                padding: 0,
                cursor: "pointer",
              }}
            >
              结束追问
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {quickReplies.map((text) => (
            <button
              key={text}
              onClick={() => fillQuickReply(text)}
              style={{
                border: "1px solid #d2d2d2",
                background: "#f5f5f5",
                color: "#2f2f2f",
                borderRadius: "12px",
                fontSize: "11px",
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              {text}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "6px", alignItems: "stretch" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => pauseHintAutoHide()}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendRecord();
              }
            }}
            placeholder="输入信息"
            rows={2}
            style={{
              flex: 1,
              border: "1px solid #e3e3e3",
              borderRadius: "12px",
              padding: "6px 10px",
              fontSize: "12px",
              outline: "none",
              resize: "none",
              lineHeight: "1.4",
            }}
          />
          <button
            onClick={sendRecord}
            disabled={!input.trim() || sending}
            style={{
              border: "none",
              background: !input.trim() || sending ? "#cfcfcf" : "#222",
              color: "#fff",
              borderRadius: "12px",
              padding: "0 12px",
              fontSize: "12px",
              cursor: !input.trim() || sending ? "not-allowed" : "pointer",
            }}
          >
            发送
          </button>
        </div>
      </div>

      <div
        onClick={handleSideBallClick}
        onDoubleClick={openMain}
        style={{
          width: "56px",
          minWidth: "56px",
          background: "#1f1f1f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "grab",
          position: "relative",
        }}
      >
        {hasUnreadReminder && (
          <span
            style={{
              position: "absolute",
              top: "8px",
              right: "8px",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#ff4d4f",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.9)",
            }}
          />
        )}
        <ClockIcon />
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ pointerEvents: "none" }}
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12,7 12,12 15.5,14" />
    </svg>
  );
}
