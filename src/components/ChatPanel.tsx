import { useState, useRef, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, Sparkles, Search, Check } from "lucide-react";
import { Cat, type CatMood } from "./Cat";
import { invoke } from "@tauri-apps/api/core";

interface Message {
  role: "ai" | "user";
  content: string;
}

const QUICK_REPLIES = ["还在做刚才的", "开会中", "在写文档", "休息一下"];
const QUERY_SUGGESTIONS = ["这周在 Perflame 上做了什么？", "最近什么时段记录最多？", "找一下所有会议相关"];

interface AgentAction {
  action_type: string;
  message: string;
  tool_calls: Array<{ name: string; arguments: Record<string, unknown> }>;
}

export function ChatPanel() {
  const [mode, setMode] = useState<"record" | "query">("record");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [catMood, setCatMood] = useState<CatMood>("curious");
  const [justSaved, setJustSaved] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const init = async () => {
      try {
        const isOnboarded = await invoke<boolean>("is_onboarded");
        if (!isOnboarded) {
          // Start onboarding: cat introduces itself
          setOnboarding(true);
          setMessages([
            { role: "ai", content: "喵~ 你好呀！我是你的 DailySnap 小猫，从今天起陪你上班。先互相认识一下吧——你平时主要在忙什么呀？" },
          ]);
          setCatMood("curious");
        } else {
          // Returning user: friendly greeting
          setMessages([
            { role: "ai", content: "喵~ 你回来啦！今天又见面了，最近怎么样？" },
          ]);
          setCatMood("happy");
        }
      } catch {
        setMessages([{ role: "ai", content: "喵~ 你好呀！我是你的 DailySnap 小猫。" }]);
      }

      // Focus listener (existing behaviour)
      const unlisten = await listen("focus-chat-input", () => {
        requestAnimationFrame(() => inputRef.current?.focus());
      });
      return unlisten;
    };
    const cleanupPromise = init();
    return () => {
      cleanupPromise.then((fn) => fn && fn());
    };
  }, []);

  const sendMessage = async (text?: string) => {
    const content = text || input.trim();
    if (!content) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    setIsLoading(true);

    try {
      const result = await invoke<AgentAction>("agent_turn", {
        userMessage: content,
        mode: onboarding ? "onboarding" : null,
      });

      // Update cat mood based on action
      if (result.action_type === "save_record") {
        setCatMood("happy");
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000);
        setTimeout(() => setCatMood("calm"), 3000);
      } else if (result.action_type === "chat") {
        setCatMood("satisfied");
        setTimeout(() => setCatMood("calm"), 2000);
      }

      setMessages((prev) => [...prev, { role: "ai", content: result.message || "（小猫在想...）" }]);

      // Check for onboarding completion
      if (onboarding && result.message.includes("[ONBOARDING_DONE]")) {
        setTimeout(() => {
          setOnboarding(false);
          setMessages((prev) => [
            ...prev,
            { role: "ai", content: "好啦，我记住你啦！以后随时找我聊~ 喵。" },
          ]);
          setCatMood("happy");
        }, 500);
      }
    } catch (err) {
      console.error("agent_turn failed:", err);
      setMessages((prev) => [...prev, { role: "ai", content: "呜呜，我脑子打结了... 稍后再试？" }]);
      setCatMood("sad");
      setTimeout(() => setCatMood("calm"), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: "record" | "query") => {
    if (newMode === mode) return;
    setMode(newMode);
    if (newMode === "query") {
      setMessages([
        { role: "ai", content: "喵~ 问我关于你工作记录的任何问题吧，我会翻记忆给你找~" },
      ]);
    } else {
      setMessages([{ role: "ai", content: "喵~ 准备好开始记今天的工作了吗？" }]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Quick reply only when conversation is fresh
  const showQuickReplies = mode === "record"
    ? messages.length <= 1 && !onboarding
    : messages.length <= 1;

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
            {onboarding ? "初次见面" : "现在"}
          </div>
          <Cat mood={catMood} size={36} variant="head" hasNotification={false} />
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "16px 20px 8px 20px" }}>
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={`${onboarding ? "on" : "no"}-${i}`}
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
              </div>
            </motion.div>
          ))}
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
          {(mode === "record" ? QUICK_REPLIES : QUERY_SUGGESTIONS).map((text) => (
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
            placeholder={onboarding ? "回答小猫~" : mode === "record" ? "记录一句话..." : "问我什么..."}
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