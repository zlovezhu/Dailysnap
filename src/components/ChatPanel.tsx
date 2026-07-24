import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRecordStore } from "../stores/recordStore";

interface Message {
  role: "ai" | "user";
  content: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", content: "嗨~ 现在在忙什么呀？" },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationStep, setConversationStep] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const addRecord = useRecordStore((s) => s.addRecord);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const bindFocusListener = async () => {
      const unlisten = await listen("focus-chat-input", () => {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      });
      return unlisten;
    };

    const cleanupPromise = bindFocusListener();
    return () => {
      cleanupPromise.then((fn) => fn && fn());
    };
  }, []);

  const quickReplies = ["还在做刚才的", "开会中", "在写文档", "休息一下"];

  const handleSend = async (text?: string) => {
    const content = text || input.trim();
    if (!content) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    setIsLoading(true);

    try {
      if (conversationStep === 0) {
        const aiResponse = await invoke<string>("ai_chat", {
          userMessage: content,
          step: "first_reply",
        });
        setMessages((prev) => [...prev, { role: "ai", content: aiResponse }]);

        if (aiResponse.includes("已记录") || aiResponse.includes("记下了")) {
          setConversationStep(2);
          await invoke("save_record", {
            content,
            aiQuestion: messages[0].content,
            aiFollowup: null,
            userFollowupReply: null,
          });
          addRecord({ content, createdAt: new Date().toISOString() });
        } else {
          setConversationStep(1);
        }
      } else if (conversationStep === 1) {
        const aiResponse = await invoke<string>("ai_chat", {
          userMessage: content,
          step: "followup_reply",
        });
        setMessages((prev) => [...prev, { role: "ai", content: aiResponse }]);
        setConversationStep(2);

        const firstUserMsg = messages.find((m) => m.role === "user")?.content || "";
        const followupQuestion = messages[messages.length - 1]?.content || "";
        await invoke("save_record", {
          content: firstUserMsg,
          aiQuestion: messages[0].content,
          aiFollowup: followupQuestion,
          userFollowupReply: content,
        });
        addRecord({
          content: `${firstUserMsg} | ${content}`,
          createdAt: new Date().toISOString(),
        });
      }
    } catch {
      const mockResponses = [
        "好的，已经记下了！继续加油~",
        "收到！有新进展随时告诉我~",
        "了解了，记录完成！",
      ];
      const mockReply = mockResponses[Math.floor(Math.random() * mockResponses.length)];
      setMessages((prev) => [...prev, { role: "ai", content: mockReply }]);
      setConversationStep(2);

      await invoke("save_record", {
        content,
        aiQuestion: messages[0].content,
        aiFollowup: null,
        userFollowupReply: null,
      }).catch(() => {});
      addRecord({ content, createdAt: new Date().toISOString() });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewConversation = () => {
    setMessages([{ role: "ai", content: "嗨~ 现在在忙什么呀？" }]);
    setConversationStep(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "16px" }}>
      <div style={{ flex: 1, overflowY: "auto", marginBottom: "12px" }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: "12px",
                fontSize: "13px",
                lineHeight: "1.5",
                background: msg.role === "user" ? "#534AB7" : "#f5f5f5",
                color: msg.role === "user" ? "#fff" : "#333",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "10px" }}>
            <div style={{ padding: "10px 14px", borderRadius: "12px", fontSize: "13px", background: "#f5f5f5", color: "#999" }}>
              思考中...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {conversationStep === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
          {quickReplies.map((text) => (
            <button
              key={text}
              onClick={() => handleSend(text)}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                background: "#f3f0ff",
                color: "#534AB7",
                border: "1px solid #e8e5ff",
                borderRadius: "16px",
                cursor: "pointer",
              }}
            >
              {text}
            </button>
          ))}
        </div>
      )}

      {conversationStep < 2 ? (
        <div style={{ display: "flex", gap: "8px", paddingTop: "12px", borderTop: "1px solid #f0f0f0" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="回复一下..."
            disabled={isLoading}
            rows={2}
            style={{
              flex: 1,
              padding: "8px 14px",
              fontSize: "13px",
              border: "1px solid #e5e5e5",
              borderRadius: "12px",
              outline: "none",
              resize: "none",
              lineHeight: "1.4",
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              background: !input.trim() || isLoading ? "#ccc" : "#534AB7",
              color: "#fff",
              border: "none",
              borderRadius: "12px",
              cursor: !input.trim() || isLoading ? "not-allowed" : "pointer",
            }}
          >
            发送
          </button>
        </div>
      ) : (
        <div style={{ paddingTop: "12px", borderTop: "1px solid #f0f0f0" }}>
          <button
            onClick={handleNewConversation}
            style={{
              width: "100%",
              padding: "10px",
              fontSize: "13px",
              background: "#f3f0ff",
              color: "#534AB7",
              border: "1px solid #e8e5ff",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            开始新的记录
          </button>
        </div>
      )}
    </div>
  );
}
