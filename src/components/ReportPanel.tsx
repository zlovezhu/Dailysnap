import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function ReportPanel() {
  const [report, setReport] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const result = await invoke<string>("generate_daily_report", { date: today });
      setReport(result);
    } catch {
      const mockDate = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
      setReport(
        `${mockDate} 工作日报\n\n【主要工作】\n- 处理邮件和消息，回复产品反馈问题\n- 参加 Q3 新功能需求评审会\n- 完成 DailySnap 产品方案设计\n\n【明日计划】\n- 继续推进 DailySnap MVP 开发\n- 跟进 Q3 需求评审结论落地`
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!report) return;
    try {
      await invoke("copy_to_clipboard", { text: report });
    } catch {
      await navigator.clipboard.writeText(report);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!report && !isGenerating) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "24px", gap: "16px" }}>
        <p style={{ fontSize: "13px", color: "#666" }}>点击按钮生成今日工作日报</p>
        <p style={{ fontSize: "12px", color: "#999" }}>AI 会根据你今天的碎片记录自动整理</p>
        <button
          onClick={handleGenerate}
          style={{
            padding: "10px 24px",
            fontSize: "13px",
            background: "#534AB7",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            marginTop: "8px",
          }}
        >
          生成日报
        </button>
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px" }}>
        <p style={{ fontSize: "13px", color: "#666" }}>AI 正在整理你的工作记录...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <span style={{ fontSize: "13px", fontWeight: 500, color: "#333" }}>今日日报</span>
        <button
          onClick={handleGenerate}
          style={{ fontSize: "12px", color: "#534AB7", background: "none", border: "none", cursor: "pointer" }}
        >
          重新生成
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", background: "#fafafa", borderRadius: "8px", padding: "16px", fontSize: "13px", lineHeight: "1.6", color: "#333", whiteSpace: "pre-wrap" }}>
        {report}
      </div>

      <button
        onClick={handleCopy}
        style={{
          marginTop: "12px",
          width: "100%",
          padding: "10px",
          fontSize: "13px",
          background: copied ? "#e8f5e9" : "#534AB7",
          color: copied ? "#4caf50" : "#fff",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      >
        {copied ? "已复制 ✓" : "复制日报"}
      </button>
    </div>
  );
}
