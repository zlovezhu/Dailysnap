import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SendHorizonal } from "lucide-react";
import Cat, { type CatMood } from "../components/Cat";
import type { ChatMessage } from "./engine";

interface Props {
  messages: ChatMessage[];
  typing: boolean;
  quickReplies: string[];
  onSend: (text: string) => void;
  catMood: CatMood;
}

export default function ChatPanel({ messages, typing, quickReplies, onSend, catMood }: Props) {
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 用 rAF 保证 DOM 更新完成后再算 scrollHeight（避免滚动到旧位置）
    const id = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [messages, typing]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setValue("");
    onSend(t);
  };

  return (
    <div className="flex h-full flex-col">
      {/* 消息区 */}
      <div ref={scrollRef} className="slim-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-5">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={`flex items-end gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {m.role === "cat" && (
                <div className="shrink-0">
                  <Cat mood={catMood} size={36} />
                </div>
              )}
              <div className={`max-w-[78%] ${m.role === "user" ? "text-right" : ""}`}>
                <div
                  className={`inline-block rounded-md px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-ink text-paper"
                      : "border border-hairline bg-accent-soft/70 text-ink"
                  }`}
                >
                  {m.text}
                </div>
                <p className="mt-1 text-[10px] text-ink-faint">{m.time}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {typing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-end gap-2.5">
            <Cat mood={catMood} size={36} />
            <div className="flex items-center gap-1.5 rounded-md border border-ink/10 bg-beige/70 px-3.5 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="typing-dot h-[5px] w-[5px] rounded-full bg-ink"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* 快捷回复 2×2 */}
      {quickReplies.length > 0 && (
        <div className="grid grid-cols-2 gap-2 px-4 pb-3 md:px-5">
          {quickReplies.slice(0, 4).map((q) => (
            <button
              key={q}
              onClick={() => submit(q)}
              className="truncate rounded-md border border-hairline bg-surface px-3 py-2 text-[12.5px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* 输入框 */}
      <div className="hairline-t flex items-center gap-2 px-4 py-3 md:px-5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit(value)}
          placeholder="随手记一句，或者说：生成日报"
          className="flex-1 rounded-md border border-hairline bg-surface px-3.5 py-2.5 text-[13.5px] outline-none placeholder:text-ink-faint focus:border-ink"
        />
        <button
          onClick={() => submit(value)}
          className="btn-ink flex h-[38px] w-[38px] items-center justify-center"
          aria-label="发送"
        >
          <SendHorizonal size={15} />
        </button>
      </div>
    </div>
  );
}
