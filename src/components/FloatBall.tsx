import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { Cat, type CatMood, type CatHandle } from "./Cat";
import type { CuriousType } from "../hooks/useCatAnim";
import { getLatestRecord } from "../services/db";
import { generateGreeting } from "../services/greeting";

interface Message { role: "user" | "ai"; content: string; followup?: boolean; followupOptions?: string[]; streaming?: boolean; }

interface AgentAction {
  action_type: string; message: string;
  tool_calls: Array<{ name: string; arguments: Record<string, unknown> }>;
  needs_followup: boolean; followup_question: string;
  followup_options: string[]; followup_round: number;
}

// 兜底快捷回复（上下文问候语为空时用）
const FALLBACK_QUICK_REPLIES = ["在写文档", "开会中", "刚做完一件事"];

// 对话完成后多久自动清空气泡（仅桌面猫，不影响主窗口）
const CLEAR_DELAY_MS = 5000;

export function FloatBall() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [followupOpts, setFollowupOpts] = useState<string[]>([]);
  // Track whether we're in a followup (the last AI message is a followup).
  // Used to show a "skip" button even when the LLM didn't return options.
  const [isFollowupState, setIsFollowupState] = useState(false);
  const [catMood, setCatMood] = useState<CatMood>("calm");
  // 上下文感知问候语（确定性，与主窗口 ChatPanel 一致）
  const [greeting, setGreeting] = useState<string>("");
  const [quickReplies, setQuickReplies] = useState<string[]>(FALLBACK_QUICK_REPLIES);
  const [hovered, setHovered] = useState(false);

  const [isDark, setIsDark] = useState(() => {
    const s = localStorage.getItem("dailysnap-theme");
    if (s === "light" || s === "dark") return s === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const processingRef = useRef(false);
  const pointerRef = useRef({ isDown: false, hasDragged: false, startX: 0, startY: 0 });
  // Mirror of catMood so setTimeout callbacks can read the current value
  // (state values captured in closures are stale).
  const catMoodRef = useRef<CatMood>("calm");

  // ──── Sync cat mood to main window ────
  // Every time we change catMood (or curiousType), emit a Tauri event
  // so the main window's cat (in ChatPanel) stays in sync.
  const catRef = useRef<CatHandle | null>(null);
  const syncCatMood = (mood: CatMood, cType?: CuriousType) => {
    setCatMood(mood);
    catMoodRef.current = mood;
    emit("cat-mood-change", {
      mood,
      curiousType: cType ?? curiousTypeRef.current,
    }).catch(() => {});
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const followupRoundRef = useRef(0);
  const curiousTypeRef = useRef<CuriousType>("A");
  // 自动清空定时器
  const clearTimerRef = useRef<number | null>(null);
  // 清空锚点：清空后只显示 conversation 中此索引之后的新消息。
  // -1 表示尚未清空（首次快照前）。
  const clearedFromRef = useRef(-1);
  // 最近一次 conversation-changed 快照的长度（用于清空时更新锚点）
  const snapshotLenRef = useRef(0);

  // Theme sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "dailysnap-theme" && (e.newValue === "light" || e.newValue === "dark")) {
        setIsDark(e.newValue === "dark");
      }
    };
    window.addEventListener("storage", onStorage);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMq = () => { if (!localStorage.getItem("dailysnap-theme")) setIsDark(mq.matches); };
    mq.addEventListener("change", onMq);
    return () => { window.removeEventListener("storage", onStorage); mq.removeEventListener("change", onMq); };
  }, []);

  const theme = isDark
    ? { bg: "rgba(0,0,0,0.55)", border: "rgba(255,255,255,0.18)", text: "#fbf9f3",
        placeholder: "rgba(251,249,243,0.55)", sendBg: "rgba(251,249,243,0.85)", sendColor: "#1f1d18" }
    : { bg: "rgba(255,255,255,0.72)", border: "rgba(0,0,0,0.12)", text: "#1f1d18",
        placeholder: "rgba(31,29,24,0.5)", sendBg: "#1f1d18", sendColor: "#fbf9f3" };

  // Drag
  const beginPointer = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("input,button")) return;
    pointerRef.current = { isDown: true, hasDragged: false, startX: e.screenX, startY: e.screenY };
  };
  const handlePointerMove = async (e: React.MouseEvent) => {
    if (!pointerRef.current.isDown || pointerRef.current.hasDragged) return;
    if (Math.abs(e.screenX - pointerRef.current.startX) < 6 && Math.abs(e.screenY - pointerRef.current.startY) < 6) return;
    pointerRef.current.hasDragged = true;
    await invoke("start_drag_window", { label: "float-ball" }).catch(() => {});
  };
  const endPointer = () => { pointerRef.current.isDown = false; };
  const openMain = async () => {
    if (pointerRef.current.hasDragged) { pointerRef.current.hasDragged = false; return; }
    await invoke("open_main_window").catch(() => {});
  };

  const focusInput = () => { requestAnimationFrame(() => inputRef.current?.focus()); };

  // 刷新上下文感知问候语 + 快捷回复（确定性，与主窗口 ChatPanel 一致）
  const refreshGreeting = async () => {
    try {
      const latest = await getLatestRecord();
      const g = generateGreeting(latest);
      setGreeting(g.text);
      setQuickReplies(g.quickReplies);
    } catch {
      // DB 读失败时保留兜底
    }
  };

  // 清空桌面猫的气泡（仅显示层，不影响 Rust 端 conversation 和主窗口）。
  // 核心：把清空锚点推进到「当前 conversation 长度」，之后快照只 slice 锚点之后的新消息。
  const clearBubbles = () => {
    clearedFromRef.current = snapshotLenRef.current;
    setMessages([]);
    setFollowupOpts([]);
    setIsFollowupState(false);
    followupRoundRef.current = 0;
    void refreshGreeting();
  };

  // 对话完成后 N 秒自动清空（追问中不调用）
  const scheduleClear = () => {
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = window.setTimeout(() => {
      clearBubbles();
      syncCatMood("calm");
    }, CLEAR_DELAY_MS);
  };

  // 组件挂载时刷新一次问候语
  useEffect(() => {
    void refreshGreeting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 发送：只 invoke，用户消息 + AI 回复都由 Rust 端 append 进 conversation 并广播快照
  async function send(text: string, skipFollowup = false) {
    const content = text.trim();
    // Guard against rapid duplicate sends (Enter key spam, double-click).
    if (processingRef.current) return;
    if (!content && !skipFollowup) return;
    processingRef.current = true;
    setIsProcessing(true);
    syncCatMood("curious");  // thinking pose while AI responds

    // 用户主动发消息：取消 pending 的自动清空
    if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);

    setInput("");

    invoke("agent_turn_stream", {
      userMessage: skipFollowup ? "（用户选择跳过追问）" : content,
      mode: null,
      followupRound: skipFollowup ? 2 : followupRoundRef.current,
    }).catch(err => {
      console.error("agent_turn_stream failed:", err);
      setIsProcessing(false);
      processingRef.current = false;
    });
  }

  // Init: listen to events（AI 配置已硬编码在 Rust 端，无需 sync）
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const unlistenToken = await listen("agent-token", (e) => {
        if (cancelled) return;
        const t = (e.payload as { text: string }).text;
        setMessages(prev => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === "ai" && last.streaming) {
            copy[copy.length - 1] = { ...last, content: last.content + t };
          } else {
            copy.push({ role: "ai", content: t, streaming: true });
          }
          return copy;
        });
      });

      // 对话完整快照（单一事实来源，与主窗口 ChatPanel 同步）。
      // 但桌面猫有「自动清空」：只显示清空锚点之后的新消息。
      const unlistenChanged = await listen("conversation-changed", (e) => {
        if (cancelled) return;
        const full = e.payload as Message[];
        snapshotLenRef.current = full.length;
        if (clearedFromRef.current >= 0) {
          setMessages(full.slice(clearedFromRef.current));
        } else {
          setMessages(full);
        }
      });

      const unlistenResult = await listen("agent-turn-result", (e) => {
        if (cancelled) return;
        const r = e.payload as AgentAction;
        setIsProcessing(false);
        processingRef.current = false;

        if (r.needs_followup && r.followup_round <= 2) {
          // 追问：Type A = 灵光一闪（a-ha → outro → static）
          followupRoundRef.current = r.followup_round;
          setFollowupOpts(r.followup_options || []);
          setIsFollowupState(true);
          curiousTypeRef.current = "A";
          catRef.current?.finishCurious("A");
          // Type A (aHa+outro) 约 3s。等动画完成后再切回 calm。
          setTimeout(() => {
            if (catMoodRef.current === "curious") {
              syncCatMood("calm");
            }
          }, 3000);
        } else {
          // 完成对话：Type B = return-normal（outro only）
          followupRoundRef.current = 0;
          setFollowupOpts([]);
          setIsFollowupState(false);
          curiousTypeRef.current = "B";
          catRef.current?.finishCurious("B");
          const finalMood = r.action_type === "save_record" ? "happy" : "satisfied";
          setTimeout(() => {
            if (catMoodRef.current === "curious") {
              syncCatMood(finalMood);
            }
          }, 1800);
          // 完成对话后 5 秒自动清空桌面猫气泡（追问分支不触发）
          scheduleClear();
        }
      });

      return () => { unlistenToken(); unlistenChanged(); unlistenResult(); };
    };
    const p = init();
    return () => { cancelled = true; p.then(fn => fn?.()); };
  }, []);

  // 启动：只显示「今天最新 1 轮」对话（最后一条 user 及之后的 AI 回复），
  // 历史更早的轮次不显示。若最新一轮停在追问，恢复追问 chips。
  useEffect(() => {
    let disposed = false;
    invoke<Message[]>("get_conversation")
      .then((msgs) => {
        if (disposed) return;
        snapshotLenRef.current = msgs.length;
        // 找最后一条 user 消息的索引，作为「最新 1 轮」的起点
        let lastUserIdx = msgs.length;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === "user") {
            lastUserIdx = i;
            break;
          }
        }
        clearedFromRef.current = lastUserIdx;
        const latestRound = msgs.slice(lastUserIdx);
        if (latestRound.length > 0) {
          setMessages(latestRound);
          // 最新一轮若停在追问，恢复追问 chips（让用户能继续回答）
          const lastMsg = latestRound[latestRound.length - 1];
          if (lastMsg.role === "ai" && lastMsg.followup) {
            setFollowupOpts(lastMsg.followupOptions || []);
            setIsFollowupState(true);
            followupRoundRef.current = 1;
          }
        } else {
          setMessages([]);
          void refreshGreeting();
        }
      })
      .catch(() => {});
    return () => { disposed = true; };
  }, []);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  // Input visibility: only show on hover OR when conversation is active
  const showInput = hovered || messages.length > 0 || isProcessing;
  // Greeting visibility: only on hover, only when no messages yet
  const showGreeting = hovered && messages.length === 0 && !isProcessing;

  return (
    <div
      onMouseEnter={() => { setHovered(true); if (messages.length === 0) void refreshGreeting(); }}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={beginPointer} onMouseMove={handlePointerMove} onMouseUp={endPointer}
      onClick={(e) => {
        // Don't open main window when user clicks inside interactive
        // controls (input box, send button, quick reply chips, etc.).
        const target = e.target as HTMLElement;
        if (target.closest("input, textarea, button")) return;
        openMain();
      }}
      style={{
        width: "100%", height: "100%", position: "relative",
        overflow: "hidden", pointerEvents: "auto",
      }}
    >
      {/* CHAT — above cat, scrollable, anchored to bottom */}
      {messages.length > 0 && (
        <div
          ref={chatRef}
          style={{
            position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)",
            width: "100%", maxWidth: 260,
            bottom: 170, /* 320-170=150px, cat top=65%*320-48=160px, 10px gap */
            display: "flex", flexDirection: "column",
            justifyContent: "flex-end", padding: "0 12px 6px", gap: 4,
            overflowY: "auto", overflowX: "hidden", pointerEvents: "none",
            scrollbarWidth: "none",
          }}
        >
          {messages.map((m, i) => {
            const isEmptyAi = m.role === "ai" && !m.content && isProcessing;
            return (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%", padding: "5px 10px", borderRadius: 10,
                fontSize: 12, lineHeight: 1.4, color: theme.text,
                background: theme.bg, border: `1px solid ${theme.border}`,
                ...(m.role === "user" ? { borderBottomRightRadius: 3 } : { borderBottomLeftRadius: 3 }),
                backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                flexShrink: 0,
                minWidth: isEmptyAi ? 52 : 0,
              }}
            >
              {isEmptyAi ? (
                <span style={{ display: "inline-flex", gap: 3, alignItems: "center", padding: "2px 0" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: theme.text, opacity: 0.5, animation: "typingDot 1.2s ease-in-out infinite", animationDelay: "0s" }} />
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: theme.text, opacity: 0.5, animation: "typingDot 1.2s ease-in-out infinite", animationDelay: "0.2s" }} />
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: theme.text, opacity: 0.5, animation: "typingDot 1.2s ease-in-out infinite", animationDelay: "0.4s" }} />
                </span>
              ) : (m.content || "　")}
            </div>
            );})}
        </div>
      )}

      {/* CAT — top: 65%, closer to input */}
      <div style={{
        position: "absolute", top: "65%", left: "50%",
        transform: "translate(-50%, -50%)", zIndex: 2,
      }}>
        {/* Greeting — above cat, only on hover when no messages */}
        {showGreeting && (
          <div style={{
            position: "absolute", bottom: "calc(100% + 4px)", left: "50%",
            transform: "translateX(-50%)",
            maxWidth: 220,
            background: theme.bg, border: `1px solid ${theme.border}`,
            borderRadius: 10, padding: "4px 10px", fontSize: 11, color: theme.text,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}>
            {greeting}
          </div>
        )}
        <Cat ref={catRef} mood={catMood} size={96} variant={"full"} hasNotification={false} curiousType={curiousTypeRef.current} />
      </div>

      {/* INPUT — hidden by default, only on hover OR active conversation */}
      {showInput && (
        <div style={{
          position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 240,
          padding: "0 12px",
        }}>
          <div style={{
            display: "flex", gap: 5, alignItems: "center",
            background: theme.bg, border: `1px solid ${theme.border}`,
            borderRadius: 999, padding: "3px 4px 3px 11px",
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onFocus={() => setHovered(true)}
              onKeyDown={e => { if (e.key === "Enter" && !isProcessing) send(input); }}
              placeholder={isProcessing ? "喵..." : "写一句话..."}
              disabled={isProcessing}
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                fontSize: 12, color: theme.text, fontFamily: "inherit", padding: "2px 0",
                minWidth: 0,
              }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); send(input); }}
              disabled={!input.trim() || isProcessing}
              style={{
                width: 22, height: 22, border: "none",
                background: !input.trim() || isProcessing ? theme.border : theme.sendBg,
                borderRadius: "50%", cursor: !input.trim() || isProcessing ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, opacity: isProcessing ? 0.5 : 1,
              }}
            >
              {isProcessing
                ? <Spinner color={theme.sendColor} />
                : <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke={theme.sendColor} strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="8" x2="13" y2="8"/><polyline points="9,3 13,8 9,13"/></svg>
              }
            </button>
          </div>
        </div>
      )}

      {/* QUICK REPLIES — empty state: 3 default prompts when input is visible */}
      {showInput && followupOpts.length === 0 && messages.length === 0 && !isProcessing && (
        <div style={{
          position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)",
          width: "calc(100% - 20px)", maxWidth: 280,
          padding: "0 4px", display: "flex", gap: 4,
          flexWrap: "nowrap", justifyContent: "center",
        }}>
          {(quickReplies.length ? quickReplies : FALLBACK_QUICK_REPLIES).slice(0, 3).map(opt => (
            <button key={opt}
              onClick={(e) => { e.stopPropagation(); setInput(opt); inputRef.current?.focus(); }}
              style={{
                padding: "1px 5px", fontSize: 10,
                background: theme.bg, border: `1px solid ${theme.border}`,
                borderRadius: 999, color: theme.text, cursor: "pointer",
                whiteSpace: "nowrap", flexShrink: 0,
                backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
              }}
            >{truncateChip(opt)}</button>
          ))}
        </div>
      )}

      {/* QUICK REPLIES — followup.
         把"跳过追问"按钮放在 chip 容器内最右边（flex-shrink: 0）。
         这里 max 2 chip + 1 跳过按钮能稳定放下。LLM 返回 3+ 时只显示前 2 个。
         加 hovered 依赖：鼠标移出后整个容器（含跳过按钮）一起消失。 */}
      {(hovered || isProcessing) && (followupOpts.length > 0 || isFollowupState) && (
        <div style={{
          position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)",
          width: "calc(100% - 12px)", maxWidth: 280,
          padding: "0 4px", display: "flex", gap: 3,
          flexWrap: "nowrap", justifyContent: "center",
          alignItems: "center",
        }}>
          {followupOpts.slice(0, 2).map(opt => (
            <button key={opt}
              onClick={(e) => { e.stopPropagation(); setInput(opt); inputRef.current?.focus(); }}
              style={{
                padding: "2px 7px", fontSize: 10,
                background: theme.bg, border: `1px solid ${theme.border}`,
                borderRadius: 999, color: theme.text, cursor: "pointer",
                whiteSpace: "nowrap", flexShrink: 0,
                backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
              }}
            >{truncateChip(opt, 6)}</button>
          ))}
          {/* 跳过追问按钮：始终在右侧，flex-shrink: 0 保证不被裁剪 */}
          {isFollowupState && (
            <button
              onClick={(e) => { e.stopPropagation(); send("", true); }}
              style={{
                padding: "2px 7px", fontSize: 10,
                background: "transparent", border: "none",
                color: theme.placeholder, cursor: "pointer",
                whiteSpace: "nowrap", flexShrink: 0,
                textDecoration: "underline",
              }}
            >跳过</button>
          )}
        </div>
      )}
    </div>
  );
}

/** Truncate chip text to N chars + ellipsis. Click handler uses full text. */
function truncateChip(text: string, max = 7): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function Spinner({ color }: { color: string }) {
  return (
    <div style={{
      width: 12, height: 12, border: `2px solid rgba(0,0,0,0.2)`,
      borderTopColor: color, borderRadius: "50%",
      animation: "spin 0.6s linear infinite",
    }} />
  );
}

// Inject spinner keyframes
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes typingDot {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-4px); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}
