import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface Message {
  role: "ai" | "user";
  content: string;
}

export function MiniChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", content: "嗨~ 现在在忙什么呀？" },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const quickReplies = ["还在做刚才的", "开会中", "在写文档"];

  const handleClose = async () => {
    const win = getCurrentWindow();
    await win.hide();
  };

  const handleSend = async (text?: string) => {
    const content = text || input.trim();
    if (!content) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    setIsLoading(true);

    try {
      if (step === 0) {
        const aiResponse = await invoke<string>("ai_chat", {
          userMessage: content,
          step: "first_reply",
        });
        setMessages((prev) => [...prev, { role: "ai", content: aiResponse }]);

        if (aiResponse.includes("已记录") || aiResponse.includes("记下了")) {
          setStep(2);
          await invoke("save_record", {
            content,
            aiQuestion: messages[0].content,
            aiFollowup: null,
            userFollowupReply: null,
          });
          setTimeout(handleClose, 2000);
        } else {
          setStep(1);
        }
      } else if (step === 1) {
        const aiResponse = await invoke<string>("ai_chat", {
          userMessage: content,
          step: "followup_reply",
        });
        setMessages((prev) => [...prev, { role: "ai", content: aiResponse }]);
        setStep(2);

        const firstUserMsg = messages.find((m) => m.role === "user")?.content || "";
        await invoke("save_record", {
          content: firstUserMsg,
          aiQuestion: messages[0].content,
          aiFollowup: messages[messages.length - 1]?.content || "",
          userFollowupReply: content,
        });
        setTimeout(handleClose, 2000);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "ai", content: "好的，记下了！" }]);
      setStep(2);
      await invoke("save_record", {
        content,
        aiQuestion: messages[0].content,
        aiFollowup: null,
        userFollowupReply: null,
      }).catch(() => {});
      setTimeout(handleClose, 2000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      handleClose();
    }
  };

  return (
    <div style={{ width: "100%", height: "100%", background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>
        <span style={{ fontSize: "11px", color: "#999", fontWeight: 500 }}>DailySnap</span>
        <button onClick={handleClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: "12px" }}>✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: "8px" }}>
            <div style={{
              maxWidth: "85%",
              padding: "6px 10px",
              borderRadius: "8px",
              fontSize: "12px",
              lineHeight: "1.5",
              background: msg.role === "user" ? "#534AB7" : "#f5f5f5",
              color: msg.role === "user" ? "#fff" : "#333",
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "8px" }}>
            <div style={{ padding: "6px 10px", borderRadius: "8px", fontSize: "12px", background: "#f5f5f5", color: "#999" }}>...</div>
          </div>
        )}
      </div>

      {/* Quick replies */}
      {step === 0 && (
        <div style={{ display: "flex", gap: "6px", padding: "0 12px 8px", flexWrap: "wrap" }}>
          {quickReplies.map((text) => (
            <button
              key={text}
              onClick={() => handleSend(text)}
              style={{ padding: "4px 8px", fontSize: "10px", background: "#f3f0ff", color: "#534AB7", border: "1px solid #e8e5ff", borderRadius: "12px", cursor: "pointer" }}
            >
              {text}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      {step < 2 && (
        <div style={{ display: "flex", gap: "6px", padding: "8px 12px", borderTop: "1px solid #f0f0f0" }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="简单说两句..."
            disabled={isLoading}
            style={{ flex: 1, padding: "6px 10px", fontSize: "12px", border: "1px solid #e5e5e5", borderRadius: "14px", outline: "none" }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            style={{ padding: "6px 12px", fontSize: "12px", background: !input.trim() || isLoading ? "#ccc" : "#534AB7", color: "#fff", border: "none", borderRadius: "14px", cursor: !input.trim() || isLoading ? "not-allowed" : "pointer" }}
          >
            发送
          </button>
        </div>
      )}
    </div>
  );
}
