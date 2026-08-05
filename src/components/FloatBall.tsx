import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { Cat, type CatMood } from "./Cat";

type FloatMode = "compact" | "hover" | "input" | "talking";

interface RecordRow {
  content: string;
  user_followup_reply?: string | null;
  created_at?: string;
}

interface AgentAction {
  action_type: string;
  message: string;
  tool_calls: Array<{ name: string; arguments: Record<string, unknown> }>;
}

const STORAGE_KEY = "dailysnap_float_dialogues_v1";
const HOVER_DELAY_MS = 600;          // hover → input 切换时间
const TALKING_DURATION_MS = 2400;    // talking → compact 自动收起时间
const NO_INPUT_AUTOCOLLAPSE_MS = 60000; // input 没输入/没focus 60s 自动收起

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function loadDialogues(): { content: string; createdAt: string }[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { date: string; items: { content: string; createdAt: string }[] };
    if (!parsed || parsed.date !== getTodayKey() || !Array.isArray(parsed.items)) return [];
    return parsed.items;
  } catch { return []; }
}

function saveDialogues(items: { content: string; createdAt: string }[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: getTodayKey(), items }));
}

function mergeDialogues(base: { content: string; createdAt: string }[], incoming: { content: string; createdAt: string }[]) {
  const map = new Map<string, { content: string; createdAt: string }>();
  [...base, ...incoming].forEach((item) => map.set(`${item.createdAt}|${item.content}`, item));
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const HOVER_PROMPTS = [
  "喵~ 现在在忙什么呀？",
  "喵~ 跟我说说刚做完的事",
  "猫喊你啦~ 记一条进展？",
  "喵~ 想偷懒也告诉我一声",
];

function pickHoverPrompt() {
  return HOVER_PROMPTS[Math.floor(Math.random() * HOVER_PROMPTS.length)];
}

function getDynamicPromptByHour(hour: number): string {
  if (hour >= 6 && hour < 11) return "喵~ 早上好，今天打算做什么呀？";
  if (hour >= 11 && hour < 14) return "中午了，刚做完的事跟我说一句？";
  if (hour >= 14 && hour < 18) return "下午好~ 现在的进展到哪一步了？";
  if (hour >= 18 && hour < 23) return "晚上好~ 今天还剩什么要收尾的？";
  return "夜深了，简单写一句吧，明早看到会谢谢你。";
}

export function FloatBall() {
  const [mode, setMode] = useState<FloatMode>("compact");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [prompt, setPrompt] = useState(HOVER_PROMPTS[0]);
  const [reply, setReply] = useState("");
  const [hasUnread, setHasUnread] = useState(false);
  const [catMood, setCatMood] = useState<CatMood>("calm");
  const [recentRecordCount, setRecentRecordCount] = useState(0);

  const modeRef = useRef<FloatMode>("compact");
  const inputFocusedRef = useRef(false);
  const pointerRef = useRef({ isDown: false, hasDragged: false, startX: 0, startY: 0 });
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const collapseTimerRef = useRef<number | null>(null);
  const talkingTimerRef = useRef<number | null>(null);

  const switchMode = (next: FloatMode) => {
    modeRef.current = next;
    setMode(next);
  };

  // Drag handling
  const beginPointer = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("textarea") || target.closest("button")) return;
    pointerRef.current = { isDown: true, hasDragged: false, startX: e.screenX, startY: e.screenY };
  };

  const handlePointerMove = async (e: React.MouseEvent) => {
    if (!pointerRef.current.isDown || pointerRef.current.hasDragged) return;
    const dx = Math.abs(e.screenX - pointerRef.current.startX);
    const dy = Math.abs(e.screenY - pointerRef.current.startY);
    if (dx < 6 && dy < 6) return;
    pointerRef.current.hasDragged = true;
    await invoke("start_drag_window", { label: "float-ball" }).catch(() => {});
  };

  const endPointer = () => { pointerRef.current.isDown = false; };

  const openMain = async () => {
    if (pointerRef.current.hasDragged) return;
    await switchMode("compact");
    await invoke("open_main_window").catch(() => {});
  };

  const focusInput = () => {
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const enterInput = (initialPrompt?: string) => {
    if (initialPrompt) setPrompt(initialPrompt);
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    switchMode("input");
    focusInput();
    setHasUnread(false);
    setCatMood("curious");
    // Auto-collapse if no input/focus for 60s
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = window.setTimeout(() => {
      if (!inputFocusedRef.current && !input.trim()) {
        switchMode("compact");
        setInput("");
        setPrompt(pickHoverPrompt());
      }
    }, NO_INPUT_AUTOCOLLAPSE_MS);
  };

  const enterHover = () => {
    if (modeRef.current === "talking") return;
    switchMode("hover");
    setHasUnread(false);
    setCatMood("curious");
  };

  const exitToCompact = () => {
    if (modeRef.current === "talking") return;
    if (inputFocusedRef.current || input.trim()) return;
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
    switchMode("compact");
    setInput("");
    setPrompt(pickHoverPrompt());
  };

  const onPointerEnter = () => {
    if (pointerRef.current.hasDragged) return;
    if (modeRef.current === "talking") return;
    if (modeRef.current === "compact") {
      enterHover();
    }
    if (modeRef.current === "hover") {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = window.setTimeout(() => {
        if (modeRef.current === "hover") enterInput();
      }, HOVER_DELAY_MS);
    }
  };

  const onPointerLeave = () => {
    if (modeRef.current === "talking") return;
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    if (modeRef.current === "input" && inputFocusedRef.current) return;
    exitToCompact();
  };

  const onCatClick = () => {
    if (pointerRef.current.hasDragged) return;
    if (modeRef.current === "compact") enterInput();
    else if (modeRef.current === "hover") enterInput();
    else if (modeRef.current === "input") {
      if (!inputFocusedRef.current) focusInput();
    }
  };

  const sendRecord = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const result = await invoke<AgentAction>("agent_turn", {
        userMessage: content,
        mode: null,
      });
      if (result.action_type === "save_record") {
        setCatMood("happy");
        setReply(result.message || "好的，记下来啦~");
      } else {
        setCatMood("satisfied");
        setReply(result.message || "好的，知道啦");
      }
      setInput("");
      switchMode("talking");
      if (talkingTimerRef.current) window.clearTimeout(talkingTimerRef.current);
      talkingTimerRef.current = window.setTimeout(() => {
        switchMode("compact");
        setReply("");
        setPrompt(pickHoverPrompt());
      }, TALKING_DURATION_MS);
    } catch {
      setReply("呜呜，我脑子打结了...稍后再试？");
      setCatMood("sad");
      switchMode("talking");
      if (talkingTimerRef.current) window.clearTimeout(talkingTimerRef.current);
      talkingTimerRef.current = window.setTimeout(() => {
        switchMode("compact");
        setReply("");
        setPrompt(pickHoverPrompt());
      }, TALKING_DURATION_MS);
    } finally {
      setSending(false);
    }
  };

  // Load today records + register reminder listener
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      // Load today's record count
      try {
        const today = getTodayKey();
        const remote = await invoke<RecordRow[]>("get_records_by_date", { date: today });
        if (!cancelled) setRecentRecordCount((remote || []).length);
      } catch { /* ignore */ }

      // Sync window size to 140x150 on mount + apply macOS tweaks
      try {
        // Multiple attempts to ensure size takes effect (Tauri dev may keep initial size)
        for (let i = 0; i < 3; i++) {
          await invoke("set_float_mode", { mode: "compact" });
          await new Promise(r => setTimeout(r, 200));
        }
        await invoke("setup_float_window");
      } catch { /* ignore */ }

      // On app start: cat greets the user automatically (no need to hover first).
      const greetingTimer = window.setTimeout(() => {
        if (!cancelled && modeRef.current === "compact") {
          enterHover();
        }
      }, 1200);

      // Reminder trigger → directly enter input mode (cat says hello, no hover needed)
      const unlisten = await listen("reminder-trigger", () => {
        const dynamicPrompt = getDynamicPromptByHour(new Date().getHours());
        if (modeRef.current === "input") {
          setPrompt(dynamicPrompt);
          return;
        }
        setHasUnread(true);
        enterInput(dynamicPrompt);
      });
      if (cancelled) {
        window.clearTimeout(greetingTimer);
        return () => unlisten();
      }
      return () => {
        window.clearTimeout(greetingTimer);
        unlisten();
      };
    };

    const cleanupPromise = init();
    return () => {
      cancelled = true;
      cleanupPromise.then((c) => c && c());
    };
  }, []);

  // Cleanup
  useEffect(() => () => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
    if (talkingTimerRef.current) window.clearTimeout(talkingTimerRef.current);
  }, []);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendRecord();
    }
  };

  // Show greeting bubble (compact + hover + input show prompt; talking shows reply)
  const showText = mode === "talking" ? reply : prompt;

  return (
    <div
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      onMouseDown={beginPointer}
      onMouseMove={handlePointerMove}
      onMouseUp={endPointer}
      onDoubleClick={openMain}
      style={{
        width: "100%", height: "100%",
        position: "relative",
        background: "transparent",
        overflow: "visible",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Cat — always visible */}
      <motion.div
        onClick={onCatClick}
        onMouseDown={beginPointer}
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          cursor: pointerRef.current.hasDragged ? "grabbing" : "pointer",
          zIndex: 2,
        }}
        animate={{
          y: mode === "compact" ? [0, -2, 0] : 0,
          rotate: mode === "happy" || mode === "satisfied" ? [0, -2, 2, 0] : 0,
        }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Cat mood={catMood} size={88} variant="full" hasNotification={hasUnread} />
      </motion.div>

      {/* Greeting bubble — visible in hover/input/talking states */}
      <AnimatePresence>
        {mode !== "compact" && (
          <motion.div
            key={`bubble-${mode}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginBottom: "8px",
              padding: "8px 14px",
              background: "transparent",
              border: "none",
              borderRadius: "10px",
              whiteSpace: "nowrap",
              fontSize: "13px",
              color: "#fbf9f3",
              textShadow: "0 1px 4px rgba(0,0,0,0.6)",
              pointerEvents: "none",
              zIndex: 3,
            }}
          >
            {showText}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input — only in "input" mode */}
      <AnimatePresence>
        {mode === "input" && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              marginBottom: "8px",
              padding: "8px",
              background: "rgba(0,0,0,0.25)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(251,249,243,0.3)",
              borderRadius: "999px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              zIndex: 4,
              minWidth: "260px",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => {
                inputFocusedRef.current = true;
                if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
              }}
              onBlur={() => {
                inputFocusedRef.current = false;
                if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="写一句话..."
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                resize: "none",
                fontSize: "13px",
                color: "#fbf9f3",
                padding: "4px 8px",
                lineHeight: "1.4",
                width: "200px",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={sendRecord}
              disabled={!input.trim() || sending}
              style={{
                border: "none",
                background: "rgba(251,249,243,0.85)",
                color: "#1f1d18",
                borderRadius: "50%",
                width: "30px",
                height: "30px",
                cursor: !input.trim() || sending ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                fontWeight: 600,
                opacity: !input.trim() || sending ? 0.6 : 1,
                flexShrink: 0,
              }}
            >
              ↑
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}