import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import {
  canOpenOnDoubleClick,
  DialogueItem,
  getDynamicPromptByHour,
  isFinalReply,
  pickFallbackPrompt,
  shouldStartDrag,
} from "../utils/floatInteraction";
import { Cat, type CatMood } from "./Cat";

type FloatMode = "compact" | "expanded";

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

const DEFAULT_FOLLOWUP: FollowupState = {
  active: false, round: 0, maxRounds: 3,
  baseContent: "", question: "", prompts: [], replies: [],
};

const STORAGE_KEY = "dailysnap_float_dialogues_v1";
const CLICK_DELAY_MS = 220;
const AUTO_COLLAPSE_MS = 3 * 60 * 1000; // auto-collapse after 3 min idle

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function loadDialogues(): DialogueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { date: string; items: DialogueItem[] };
    if (!parsed || parsed.date !== getTodayKey() || !Array.isArray(parsed.items)) return [];
    return parsed.items;
  } catch { return []; }
}

function saveDialogues(items: DialogueItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: getTodayKey(), items }));
}

function mergeDialogues(base: DialogueItem[], incoming: DialogueItem[]) {
  const map = new Map<string, DialogueItem>();
  [...base, ...incoming].forEach((item) => map.set(`${item.createdAt}|${item.content}`, item));
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

interface AgentAction {
  action_type: string;
  message: string;
  tool_calls: Array<{ name: string; arguments: Record<string, unknown> }>;
}

export function FloatBall() {
  const [mode, setMode] = useState<FloatMode>("compact");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [prompt, setPrompt] = useState("喵~ 现在在忙什么呀？");
  const [recentRecordCount, setRecentRecordCount] = useState(0);
  const [hasUnread, setHasUnread] = useState(false);
  const [catMood, setCatMood] = useState<CatMood>("calm");
  const [followup, setFollowup] = useState<FollowupState>(DEFAULT_FOLLOWUP);
  const [, setDialogues] = useState<DialogueItem[]>([]);

  const modeRef = useRef<FloatMode>("compact");
  const followupRef = useRef(false);
  const pointerRef = useRef({ isDown: false, hasDragged: false, startX: 0, startY: 0 });
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const collapseTimerRef = useRef<number | null>(null);

  const quickRepliesBase = ["写文件", "开会", "改需求", "排查问题"];
  const quickRepliesBusy = ["刚写完文档", "开完会了", "需求改了", "问题解决了"];
  const quickReplies = recentRecordCount > 0 ? quickRepliesBusy : quickRepliesBase;

  const setModeWithWindow = async (next: FloatMode) => {
    modeRef.current = next;
    setMode(next);
    await invoke("set_float_mode", { mode: next }).catch(() => {});
  };

  const focusInput = () => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
    });
  };

  const enterExpanded = async (initialPrompt?: string) => {
    if (initialPrompt) setPrompt(initialPrompt);
    setHasUnread(false);
    await setModeWithWindow("expanded");
    focusInput();
    // Auto-collapse after idle
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = window.setTimeout(() => {
      collapseToCompact();
    }, AUTO_COLLAPSE_MS);
  };

  const collapseToCompact = async () => {
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
    setFollowup(DEFAULT_FOLLOWUP);
    setInput("");
    await setModeWithWindow("compact");
  };

  const resetCollapseTimer = () => {
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = window.setTimeout(() => {
      collapseToCompact();
    }, AUTO_COLLAPSE_MS);
  };

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { followupRef.current = followup.active; }, [followup.active]);

  useEffect(() => {
    const init = async () => {
      await invoke("set_float_mode", { mode: "compact" }).catch(() => {});
      // Load today's dialogues for context
      const localItems = loadDialogues();
      try {
        const today = getTodayKey();
        const remote = await invoke<RecordRow[]>("get_records_by_date", { date: today });
        const remoteItems: DialogueItem[] = (remote || []).flatMap((item) => {
          const createdAt = item.created_at || new Date().toISOString();
          const rows: DialogueItem[] = [];
          if (item.content?.trim()) rows.push({ content: item.content.trim(), createdAt });
          if (item.user_followup_reply?.trim()) rows.push({ content: item.user_followup_reply.trim(), createdAt });
          return rows;
        });
        const merged = mergeDialogues(localItems, remoteItems);
        setDialogues(merged);
        saveDialogues(merged);
        setRecentRecordCount(merged.length);
      } catch { setDialogues(localItems); }

      // Listen for reminders → directly expand
      const unlistenReminder = await listen("reminder-trigger", async () => {
        const dynamicPrompt = getDynamicPromptByHour(new Date().getHours());
        setHasUnread(true);
        setCatMood("curious");
        // If already expanded or in followup, just update prompt
        if (followupRef.current || modeRef.current === "expanded") {
          setPrompt(dynamicPrompt);
          return;
        }
        // Directly expand — no hint bubble
        await enterExpanded(dynamicPrompt);
      });
      return () => { unlistenReminder(); };
    };

    const cleanupPromise = init();
    return () => {
      if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
      cleanupPromise.then((c) => c && c());
    };
  }, []);

  // Pointer / drag handling
  const beginPointer = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("input") || target.closest("textarea") || target.closest("button")) return;
    pointerRef.current = { isDown: true, hasDragged: false, startX: e.screenX, startY: e.screenY };
  };

  const handlePointerMove = async (e: React.MouseEvent) => {
    if (!pointerRef.current.isDown || pointerRef.current.hasDragged) return;
    if (!shouldStartDrag(
      { x: pointerRef.current.startX, y: pointerRef.current.startY },
      { x: e.screenX, y: e.screenY }, 6
    )) return;
    pointerRef.current.hasDragged = true;
    await invoke("start_drag_window", { label: "float-ball" }).catch(() => {});
  };

  const endPointer = () => { pointerRef.current.isDown = false; };

  const openMain = async () => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    if (!canOpenOnDoubleClick(pointerRef.current.hasDragged)) return;
    clickTimerRef.current = null;
    await collapseToCompact();
    await invoke("open_main_window").catch(() => {});
  };

  // Compact click → expand
  const handleCompactClick = () => {
    if (pointerRef.current.hasDragged) return;
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(async () => {
      const fallbackPrompt = pickFallbackPrompt();
      await enterExpanded(fallbackPrompt);
      clickTimerRef.current = null;
    }, CLICK_DELAY_MS);
  };

  // Cat sidebar click in expanded → collapse
  const handleCatClick = async () => {
    if (pointerRef.current.hasDragged) return;
    await collapseToCompact();
  };

  // Send message via agent_turn (uses function calling)
  const sendRecord = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    resetCollapseTimer();

    try {
      // Use the new agent_turn command
      const result = await invoke<AgentAction>("agent_turn", {
        userMessage: content,
        mode: null,
      });

      // Update cat mood
      if (result.action_type === "save_record") {
        setCatMood("happy");
        setTimeout(() => setCatMood("calm"), 3000);
      } else if (result.action_type === "chat") {
        setCatMood("satisfied");
        setTimeout(() => setCatMood("calm"), 3000);
      }

      // If AI decided to save, we're done — show confirmation
      if (result.action_type === "save_record" || isFinalReply(result.message)) {
        appendDialogue(content);
        setFollowup(DEFAULT_FOLLOWUP);
        setInput("");
        setPrompt(result.message || "好的，记下来啦~");
        return;
      }

      // AI wants to follow up — enter followup mode
      setFollowup({
        active: true,
        round: 1,
        maxRounds: 3,
        baseContent: content,
        question: result.message,
        prompts: [result.message],
        replies: [],
      });
      setInput("");
      setPrompt(result.message);
      focusInput();
    } catch {
      // Fallback: save directly
      await invoke("save_record", {
        content,
        aiQuestion: prompt,
        aiFollowup: null,
        userFollowupReply: null,
      }).catch(() => {});
      appendDialogue(content);
      setInput("");
      setPrompt("好的，记下来啦~");
      setCatMood("happy");
      setTimeout(() => setCatMood("calm"), 3000);
    } finally {
      setSending(false);
    }
  };

  const endFollowupNow = async () => {
    if (!followup.active) return;
    setFollowup(DEFAULT_FOLLOWUP);
    setPrompt("好啦，记完了~ 有新进展再找我喵");
  };

  const fillQuickReply = (text: string) => {
    setInput(text);
    focusInput();
  };

  const appendDialogue = (content: string) => {
    const nextItem: DialogueItem = { content, createdAt: new Date().toISOString() };
    setDialogues((prev) => {
      const merged = mergeDialogues(prev, [nextItem]);
      saveDialogues(merged);
      return merged;
    });
  };

  const showPrompt = followup.active ? followup.question : prompt;

  /* === COMPACT: just the cat (no chrome) === */
  if (mode === "compact") {
    return (
      <motion.div
        onMouseDown={beginPointer}
        onMouseMove={handlePointerMove}
        onMouseUp={endPointer}
        onMouseLeave={endPointer}
        onClick={handleCompactClick}
        onDoubleClick={openMain}
        animate={hasUnread ? { y: [0, -3, 0] } : { y: 0 }}
        transition={hasUnread ? { duration: 1.2, repeat: Infinity } : {}}
        style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent",
          cursor: "grab", position: "relative",
          overflow: "visible",
        }}
      >
        <Cat
          mood={hasUnread ? "curious" : catMood}
          size={96}
          variant="full"
          hasNotification={hasUnread}
        />
      </motion.div>
    );
  }

  /* === EXPANDED: input panel === */
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="expanded"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onMouseDown={beginPointer}
        onMouseMove={handlePointerMove}
        onMouseUp={endPointer}
        onMouseLeave={() => { endPointer(); }}
        style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "stretch",
          overflow: "hidden", position: "relative",
          background: "var(--bg)", borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
        }}
      >
        {/* Content area */}
        <div
          style={{
            flex: 1, minWidth: 0, padding: "12px",
            display: "flex", flexDirection: "column", gap: "8px",
            cursor: "grab", overflowY: "auto", overflowX: "hidden",
          }}
        >
          {/* Prompt header */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ fontSize: "12px", color: "var(--text)", lineHeight: "1.4", fontWeight: 500 }}>
              {showPrompt}
            </div>
            {followup.active && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.05em" }}>
                  追问 {followup.round}/{followup.maxRounds}
                </div>
                <button
                  onClick={endFollowupNow}
                  style={{
                    border: "none", background: "transparent",
                    color: "var(--text-tertiary)", fontSize: "10px",
                    padding: 0, cursor: "pointer",
                  }}
                >
                  结束追问
                </button>
              </div>
            )}
          </div>

          {/* Quick replies — only when not in followup */}
          {!followup.active && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {quickReplies.map((text) => (
                <button
                  key={text}
                  onClick={() => fillQuickReply(text)}
                  style={{
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    borderRadius: "999px",
                    fontSize: "10px",
                    padding: "3px 8px",
                    cursor: "pointer",
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          )}

          {/* Input + send */}
          <div style={{ display: "flex", gap: "6px", alignItems: "stretch", marginTop: "auto" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendRecord();
                }
              }}
              onFocus={resetCollapseTimer}
              placeholder="输入信息..."
              rows={2}
              style={{
                flex: 1,
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "6px 10px",
                fontSize: "12px",
                background: "var(--surface)",
                color: "var(--text)",
                outline: "none", resize: "none", lineHeight: "1.4",
              }}
            />
            <button
              onClick={sendRecord}
              disabled={!input.trim() || sending}
              style={{
                border: "none",
                background: !input.trim() || sending ? "var(--border)" : "var(--text)",
                color: "var(--bg)",
                borderRadius: "8px",
                padding: "0 12px",
                fontSize: "11px",
                cursor: !input.trim() || sending ? "not-allowed" : "pointer",
              }}
            >
              发送
            </button>
          </div>
        </div>

        {/* Cat sidebar — always visible, click to collapse */}
        <div
          onClick={handleCatClick}
          onDoubleClick={openMain}
          style={{
            width: "60px", minWidth: "60px",
            background: "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", position: "relative",
            flexShrink: 0,
          }}
        >
          <Cat mood={followup.active ? "sleepy" : catMood} size={52} variant="full" />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}