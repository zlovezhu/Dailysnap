import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Copy, Check, Download, History, ChevronLeft } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getRecordsByDate, saveDailyReport, getDailyReport, getDailyReports, type DailyReportRow } from "../services/db";
import { generateReport, isFallbackReport } from "../services/ai";
import { getTodayKey } from "../services/date";

export function ReportPanel() {
  const [report, setReport] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyReports, setHistoryReports] = useState<DailyReportRow[]>([]);
  const today = getTodayKey();

  useEffect(() => { loadExistingReport(); }, []);

  const loadExistingReport = async () => {
    try {
      const existing = await getDailyReport(today);
      setReport(existing ? existing.content : null);
    } catch { /* ignore */ }
  };

  const loadHistory = async () => {
    try {
      const reports = await getDailyReports(30);
      setHistoryReports(reports);
      setShowHistory(true);
    } catch { /* ignore */ }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const records = await getRecordsByDate(today);
      if (records.length === 0) {
        setReport(`## ${today} 工作日报\n\n### 主要工作\n\n（暂无记录）`);
        return;
      }
      const result = await generateReport(records, today);
      setReport(result);
      // AI 调用失败时返回的是 fallback 占位符，不写入 DB（避免污染历史）
      if (isFallbackReport(result)) return;
      const recordIds = records.map((r) => r.id).filter((id): id is number => id != null);
      await saveDailyReport(today, result, recordIds);
    } catch {
      setReport(`## ${today} 工作日报\n\n### 主要工作\n\n（生成失败，重试中）`);
    } finally { setIsGenerating(false); }
  };

  const handleCopy = async () => {
    if (!report) return;
    try { await invoke("copy_to_clipboard", { text: report }); }
    catch { await navigator.clipboard.writeText(report); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = async () => {
    if (!report) return;
    try {
      const filePath = await save({
        defaultPath: `dailysnap-report-${today}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (filePath) await writeTextFile(filePath, report);
    } catch (err) { console.error("export failed:", err); }
  };

  const handleSelectHistory = (item: DailyReportRow) => {
    setReport(item.content);
    setShowHistory(false);
  };

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ gap: "12px" }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}>
          <RefreshCw size={18} style={{ color: "var(--text-tertiary)" }} />
        </motion.div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>整理今日记录 ...</p>
      </div>
    );
  }

  if (showHistory) {
    return (
      <div className="flex flex-col h-full">
        <div style={{ padding: "20px 20px 16px 20px", borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={() => setShowHistory(false)}
            className="flex items-center transition-colors"
            style={{
              gap: "4px", padding: "0",
              fontSize: "var(--text-sm)", color: "var(--text-tertiary)",
              background: "transparent", border: "none", cursor: "pointer",
            }}
          >
            <ChevronLeft size={14} /> 返回
          </button>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 500, color: "var(--text)", marginTop: "12px" }}>
            历史日报
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {historyReports.length === 0 ? (
            <div className="flex items-center justify-center h-full" style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
              还没有历史日报
            </div>
          ) : (
            historyReports.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelectHistory(item)}
                style={{
                  width: "100%", padding: "14px 20px",
                  background: "transparent", border: "none", borderBottom: "1px solid var(--border)",
                  textAlign: "left", cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: "4px",
                }}
              >
                <span className="mono" style={{ fontSize: "var(--text-sm)", color: "var(--text)" }}>
                  {item.date}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.content.replace(/[#*\n]/g, " ").substring(0, 60)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ padding: "20px", gap: "20px" }}>
        <div style={{ textAlign: "center" }}>
          <div className="label-caps" style={{ color: "var(--text-tertiary)", marginBottom: "8px" }}>
            日报
          </div>
          <div style={{ fontSize: "var(--text-md)", color: "var(--text-secondary)" }}>今日日报还没有</div>
          <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "6px" }}>
            AI 会根据今天的碎片记录自动整理
          </div>
        </div>
        <button
          onClick={handleGenerate}
          style={{
            padding: "11px 32px",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            background: "var(--text)",
            color: "var(--bg)",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
          }}
        >
          生成日报
        </button>
        <button
          onClick={loadHistory}
          className="flex items-center transition-colors"
          style={{
            gap: "6px", padding: "4px",
            fontSize: "12px", color: "var(--text-tertiary)",
            background: "transparent", border: "none", cursor: "pointer",
          }}
        >
          <History size={12} /> 历史日报
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div style={{ padding: "20px 20px 12px 20px", borderBottom: "1px solid var(--border)" }}>
        <div className="label-caps" style={{ color: "var(--text-tertiary)", marginBottom: "6px" }}>
          日报 · {today}
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <IconBtn icon={<RefreshCw size={13} />} title="重新生成" onClick={handleGenerate} />
          <IconBtn icon={<Download size={13} />} title="导出" onClick={handleExport} />
          <IconBtn icon={<History size={13} />} title="历史" onClick={loadHistory} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: "16px 20px 20px 20px" }}>
        <article
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "20px 22px",
          }}
        >
          <ReactMarkdown
            components={{
              h1: ({ children }) => <h1 style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "12px", color: "var(--text)" }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ fontSize: "var(--text-md)", fontWeight: 600, marginTop: "20px", marginBottom: "10px", color: "var(--text)" }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: "var(--text-base)", fontWeight: 500, marginTop: "14px", marginBottom: "6px", color: "var(--text-secondary)" }}>{children}</h3>,
              p: ({ children }) => <p style={{ fontSize: "var(--text-base)", lineHeight: 1.65, marginBottom: "8px", color: "var(--text)" }}>{children}</p>,
              ul: ({ children }) => <ul style={{ paddingLeft: "20px", marginBottom: "10px", color: "var(--text)" }}>{children}</ul>,
              li: ({ children }) => <li style={{ fontSize: "var(--text-base)", lineHeight: 1.65, marginBottom: "4px" }}>{children}</li>,
              strong: ({ children }) => <strong style={{ fontWeight: 600, color: "var(--text)" }}>{children}</strong>,
              hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "20px 0" }} />,
              em: ({ children }) => <em style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>{children}</em>,
            }}
          >
            {report}
          </ReactMarkdown>
        </article>
      </div>

      <div style={{ padding: "12px 20px 16px 20px", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={handleCopy}
          className="flex items-center justify-center transition-colors"
          style={{
            width: "100%",
            padding: "10px",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            border: "none",
            borderRadius: "var(--radius-md)",
            background: copied ? "var(--success-soft)" : "var(--text)",
            color: copied ? "var(--success)" : "var(--bg)",
            cursor: "pointer",
            gap: "6px",
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "已复制到剪贴板" : "复制日报"}
        </button>
      </div>
    </div>
  );
}

function IconBtn({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center transition-colors"
      style={{
        width: "28px", height: "28px",
        background: "transparent",
        color: "var(--text-tertiary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
      }}
    >
      {icon}
    </button>
  );
}
