import { useState, useRef, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Sparkles, Search, Check } from "lucide-react";
import { Cat, type CatMood, type CatHandle } from "./Cat";
import type { CuriousType } from "../hooks/useCatAnim";
import { invoke } from "@tauri-apps/api/core";
import { saveRecord, getLatestRecord } from "../services/db";
import { generateGreeting } from "../services/greeting";
import { getTodayKey, offsetDayKey } from "../services/date";

interface Message {
  role: "ai" | "user";
  content: string;
  followup?: boolean;
  followupOptions?: string[];
  followupRound?: number;
  /** 前端流式标记：表示这条 AI 消息正在逐字生成（不持久化） */
  streaming?: boolean;
}

/** Rust 端按天分组的对话（get_conversation_days / get_conversation_before 返回） */
interface ConversationDay {
  date: string;
  messages: Message[];
}

/** 折叠条的日期文案：昨天/前天/具体日期 */
function dayLabel(date: string): string {
  if (date === getTodayKey()) return "今天";
  if (date === offsetDayKey(1)) return "昨天";
  if (date === offsetDayKey(2)) return "前天";
  const d = new Date(date + "T12:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const QUICK_REPLIES = ["还在做刚才的", "开会中", "在写文档", "休息一下"];
const QUERY_SUGGESTIONS = ["这周在 Perflame 上做了什么？", "最近什么时段记录最多？", "找一下所有会议相关"];

interface AgentAction {
  action_type: string;
  message: string;
  tool_calls: Array<{ name: string; arguments: Record<string, unknown> }>;
  needs_followup: boolean;
  followup_question: string;
  followup_options: string[];
  followup_round: number;
}

/**
 * ChatPanel —— 主窗口对话面板。
 *
 * 对话状态由 Rust 端单一管理（conversation），本组件不再自己维护 messages：
 * - 监听 `conversation-changed`（完整快照）→ setMessages
 * - 监听 `agent-token`（流式）→ 逐字更新最后一条 AI
 * - 启动时 `get_conversation` 拉当前快照；空则用最近 record 生成问候语
 *
 * 与桌面 FloatBall 完全同步（同一份 Rust conversation）。
 */
export function ChatPanel() {
  const [mode, setMode] = useState<"record" | "query">("record");
  const [messages, setMessages] = useState<Message[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [catMood, setCatMood] = useState<CatMood>("curious");
  const [catCuriousType, setCatCuriousType] = useState<CuriousType>("A");
  // 历史天（不含今天），按日期升序（最旧在前）
  const [historyDays, setHistoryDays] = useState<ConversationDay[]>([]);
  // 展开的历史天日期集合（默认全折叠）
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  // 是否还有更早的历史可加载
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  // 加载更早历史时的 loading 状态（防重复触发）
  const loadingHistoryRef = useRef(false);
  const catRef = useRef<CatHandle | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const followupRoundRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 同步守卫：防止连按 Enter 跑两次（isLoading state 是异步的，不可靠）
  const sendingRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let disposed = false;

    // 1. 启动拉取最近 N 天对话（含今天）。今天的对话显示在下方，历史天折叠在上方。
    (async () => {
      try {
        const days = await invoke<ConversationDay[]>("get_conversation_days", { days: 7 });
        if (disposed) return;
        const today = days[days.length - 1];
        const history = days.slice(0, -1).filter((d) => d.messages.length > 0);
        const todayMsgs = today?.messages ?? [];
        if (todayMsgs.length > 0) {
          setMessages(todayMsgs);
        } else {
          const latest = await getLatestRecord();
          const g = generateGreeting(latest);
          setMessages([{ role: "ai", content: g.text }]);
          setQuickReplies(g.quickReplies);
        }
        setHistoryDays(history);
        setHasMoreHistory(history.length > 0);
      } catch {
        if (!disposed) setMessages([{ role: "ai", content: "喵~ 你好呀！" }]);
      }
    })();

    // 2. 对话完整快照（单一事实来源，与桌面猫同步）
    const unlistenChanged = listen("conversation-changed", (e) => {
      setMessages(e.payload as Message[]);
    });

    // 3. 流式 token（逐字打字）
    const unlistenToken = listen("agent-token", (e) => {
      const text = (e.payload as { text: string }).text;
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === "ai" && last.streaming) {
          copy[copy.length - 1] = { ...last, content: last.content + text };
        } else {
          copy.push({ role: "ai", content: text, streaming: true });
        }
        return copy;
      });
    });

    // 4. AI 结果：只更新状态（isLoading / 猫情绪 / 追问轮次），不拼消息
    const unlistenResult = listen("agent-turn-result", (e) => {
      const result = e.payload as AgentAction;
      setIsLoading(false);
      sendingRef.current = false;
      if (result.needs_followup && result.followup_round <= 2) {
        followupRoundRef.current = result.followup_round;
        // followup 不改 mood（猫动画由 FloatBall 通过 cat-mood-change 同步）
      } else {
        followupRoundRef.current = 0;
        if (result.action_type === "save_record") {
          setCatMood("happy");
          setJustSaved(true);
          setTimeout(() => setJustSaved(false), 2000);
        } else if (result.action_type === "chat") {
          setCatMood("satisfied");
        }
        setTimeout(() => setCatMood("calm"), 2500);
      }
    });

    // 5. 写库（Rust 只 emit 给 main，由这里统一写）
    const unlistenSaveRecord = listen("save-record", async (e) => {
      const payload = e.payload as { content: string; category?: string; aiFollowup?: string | null };
      try {
        await saveRecord(payload.content, null, payload.aiFollowup || null, null, payload.category || "work");
        console.log("[ChatPanel] saved record:", payload.content);
      } catch (err) {
        console.error("[ChatPanel] saveRecord failed:", err);
      }
    });

    // 6. 猫情绪同步（来自桌面 FloatBall）
    const unlistenCatMood = listen("cat-mood-change", (e) => {
      const payload = e.payload as { mood: CatMood; curiousType: CuriousType };
      if (payload.mood) setCatMood(payload.mood);
      if (payload.curiousType) setCatCuriousType(payload.curiousType);
    });

    // 7. 聚焦输入框（"猫喊你啦"提醒点击后）
    const unlistenFocus = listen("focus-chat-input", () => {
      requestAnimationFrame(() => inputRef.current?.focus());
    });

    return () => {
      disposed = true;
      unlistenChanged.then((u) => u());
      unlistenToken.then((u) => u());
      unlistenResult.then((u) => u());
      unlistenSaveRecord.then((u) => u());
      unlistenCatMood.then((u) => u());
      unlistenFocus.then((u) => u());
    };
  }, []);

  const sendMessage = async (text?: string, skipFollowup?: boolean) => {
    if (sendingRef.current) return;
    const content = text || input.trim();
    if (!content && !skipFollowup) return;

    const isSkip = !!skipFollowup;
    const userText = isSkip ? "（用户选择跳过追问）" : content;
    sendingRef.current = true;
    setInput("");
    setIsLoading(true);

    // 用户消息 + AI 回复都由 Rust 端 append 进 conversation 并广播快照，
    // 前端只管 invoke，不用自己 push 消息。
    invoke("agent_turn_stream", {
      userMessage: userText,
      mode: null,
      followupRound: isSkip ? 2 : followupRoundRef.current,
    }).catch((err) => {
      console.error("[ChatPanel] agent_turn_stream invoke failed:", err);
      setIsLoading(false);
      sendingRef.current = false;
      const errStr = String(err);
      // Rust 端按错误类型加前缀：[NETWORK] send 瞬时错误，[API] HTTP 非 2xx，其他
      let content: string;
      if (errStr.startsWith("[NETWORK]")) {
        content = "网络有点卡，重试一下吧~";
      } else if (errStr.startsWith("[API]")) {
        content = `AI 服务那边报了错：${errStr.replace(/^\[API\]\s*/, "")}`;
      } else {
        content = `呜呜，出错了：${errStr}`;
      }
      setMessages((prev) => [...prev, { role: "ai", content }]);
      // 5 秒后清空气泡 + 重新生成问候语，回到初始态（让用户能继续输入）
      setTimeout(async () => {
        try {
          const latest = await getLatestRecord();
          const g = generateGreeting(latest);
          setMessages([{ role: "ai", content: g.text }]);
          setQuickReplies(g.quickReplies);
        } catch {
          setMessages([]);
        }
      }, 5000);
    });
  };

  const switchMode = (newMode: "record" | "query") => {
    if (newMode === mode) return;
    setMode(newMode);
    // 不重置对话（对话是窗口 + 桌面共享的单一状态）
  };

  // 折叠/展开某一天的历史
  const toggleDay = (date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  // 向上滚动到顶部时懒加载更早的历史
  const loadMoreHistory = async () => {
    if (loadingHistoryRef.current || !hasMoreHistory) return;
    const earliest = historyDays[0]?.date;
    if (!earliest) { setHasMoreHistory(false); return; }
    loadingHistoryRef.current = true;
    // 记录加载前的高度，加载后补偿滚动位置，避免视口跳动
    const prevHeight = scrollRef.current?.scrollHeight ?? 0;
    const prevTop = scrollRef.current?.scrollTop ?? 0;
    try {
      const older = await invoke<ConversationDay[]>("get_conversation_before", {
        beforeDate: earliest,
        days: 7,
      });
      if (older.length === 0) {
        setHasMoreHistory(false);
      } else {
        setHistoryDays((prev) => [...older, ...prev]);
        // 等新内容渲染后补偿滚动位置
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            const newHeight = scrollRef.current.scrollHeight;
            scrollRef.current.scrollTop = prevTop + (newHeight - prevHeight);
          }
        });
      }
    } catch {
      setHasMoreHistory(false);
    } finally {
      loadingHistoryRef.current = false;
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // 滚动到接近顶部时触发加载更早历史
    if (el.scrollTop <= 30) {
      void loadMoreHistory();
    }
  };

  // 渲染单条消息气泡。interactive 为 true 时（仅今天的最后一条追问）才显示追问按钮。
  const renderBubble = (msg: Message, i: number, interactive: boolean) => (
    <motion.div
      key={`no-${i}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: "flex",
        justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
        marginBottom: "12px",
      }}
    >
      <div
        style={{
          maxWidth: "82%",
          padding: "10px 14px",
          fontSize: "var(--text-base)",
          lineHeight: "1.55",
          letterSpacing: "0.01em",
          borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          background: msg.role === "user" ? "var(--text)" : "transparent",
          color: msg.role === "user" ? "var(--bg)" : "var(--text)",
          border: msg.role === "ai" ? "1px solid var(--border)" : "none",
        }}
      >
        {msg.content}
        {msg.followup && interactive && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {(msg.followupOptions || []).map((opt) => (
                <button
                  key={opt}
                  onClick={() => sendMessage(opt)}
                  style={{
                    padding: "4px 10px",
                    fontSize: "12px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: "999px",
                    color: "var(--text)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
            <button
              onClick={() => sendMessage(undefined, true)}
              style={{
                fontSize: "11px",
                color: "var(--text-tertiary)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                alignSelf: "flex-start",
                padding: "2px 4px",
                textDecoration: "underline",
              }}
            >
              跳过追问
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 快捷回复只在最后一条是 AI（或空）时显示，接在猫的问候后面，不突兀
  const lastIsAi = messages.length === 0 || messages[messages.length - 1]?.role === "ai";
  const showQuickReplies = lastIsAi;

  return (
    <div className="flex flex-col h-full">
      {/* Mode switch + cat mood */}
      <div style={{ padding: "16px 20px 0 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          className="inline-flex items-center"
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: "2px",
            gap: "2px",
          }}
        >
          <button
            onClick={() => switchMode("record")}
            className="flex items-center transition-all"
            style={{
              gap: "6px", padding: "5px 12px", fontSize: "var(--text-xs)",
              borderRadius: "4px", border: "none", cursor: "pointer",
              background: mode === "record" ? "var(--text)" : "transparent",
              color: mode === "record" ? "var(--bg)" : "var(--text-tertiary)",
              fontWeight: mode === "record" ? 500 : 400,
            }}
          >
            <Sparkles size={11} /> 记录
          </button>
          <button
            onClick={() => switchMode("query")}
            className="flex items-center transition-all"
            style={{
              gap: "6px", padding: "5px 12px", fontSize: "var(--text-xs)",
              borderRadius: "4px", border: "none", cursor: "pointer",
              background: mode === "query" ? "var(--text)" : "transparent",
              color: mode === "query" ? "var(--bg)" : "var(--text-tertiary)",
              fontWeight: mode === "query" ? 500 : 400,
            }}
          >
            <Search size={11} /> 查询
          </button>
        </div>

        {/* Cat avatar in header */}
        <div className="flex items-center" style={{ gap: "8px" }}>
          <div className="label-caps" style={{ color: "var(--text-tertiary)" }}>
            现在
          </div>
          <Cat ref={catRef} mood={catMood} size={56} variant="full" hasNotification={false} curiousType={catCuriousType} />
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={handleScroll} style={{ padding: "16px 20px 8px 20px" }}>
        {/* 历史天折叠条（最旧在上，最近在下，紧贴今天上方） */}
        {historyDays.map((day) => {
          const expanded = expandedDays.has(day.date);
          return (
            <div key={day.date} style={{ marginBottom: "8px" }}>
              <button
                onClick={() => toggleDay(day.date)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "4px 0",
                  fontSize: "var(--text-xs)",
                  color: "var(--text-tertiary)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <span style={{ opacity: 0.6 }}>{expanded ? "▾" : "▸"}</span>
                <span>{dayLabel(day.date)} · {day.messages.length} 条</span>
              </button>
              {expanded && (
                <div style={{ marginTop: "4px" }}>
                  {day.messages.map((m, i) => renderBubble(m, i, false))}
                </div>
              )}
            </div>
          );
        })}

        {/* 分割线：历史与今天之间 */}
        {historyDays.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              margin: "4px 0 14px 0",
            }}
          >
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
              今天
            </span>
            <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => renderBubble(msg, i, i === messages.length - 1))}
        </AnimatePresence>
        {isLoading && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "12px" }}>
            <div
              style={{
                padding: "10px 14px",
                border: "1px solid var(--border)",
                borderRadius: "14px 14px 14px 4px",
                fontSize: "var(--text-base)",
                color: "var(--text-tertiary)",
              }}
            >
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                猫在想…
              </motion.span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick replies */}
      {showQuickReplies && (
        <div style={{ marginBottom: "10px", padding: "0 20px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {(mode === "record" ? (quickReplies.length ? quickReplies : QUICK_REPLIES) : QUERY_SUGGESTIONS).map((text) => (
            <button
              key={text}
              onClick={() => sendMessage(text)}
              style={{
                padding: "5px 11px",
                fontSize: "var(--text-xs)",
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "999px",
                cursor: "pointer",
              }}
            >
              {text}
            </button>
          ))}
        </div>
      )}

      {/* Save indicator */}
      <AnimatePresence>
        {justSaved && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center"
            style={{ gap: "6px", fontSize: "var(--text-xs)", color: "var(--success)", padding: "0 0 8px 0" }}
          >
            <Check size={11} /> 已记下来啦喵~
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div style={{ padding: "0 20px 18px 20px" }}>
        <div
          className="flex items-end"
          style={{
            gap: "8px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "8px 8px 8px 14px",
            background: "var(--surface)",
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === "record" ? "记录一句话..." : "问我什么..."}
            disabled={isLoading}
            rows={1}
            className="flex-1 px-0 py-1.5 text-sm leading-relaxed bg-transparent border-none outline-none resize-none"
            style={{
              fontSize: "var(--text-base)",
              color: "var(--text)",
              padding: "6px 0",
              maxHeight: "120px",
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="flex items-center justify-center transition-opacity"
            style={{
              width: "30px", height: "30px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: input.trim() && !isLoading ? "var(--text)" : "var(--border)",
              color: "var(--bg)",
              cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
