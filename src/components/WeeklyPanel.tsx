import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Calendar, RefreshCw, Download, Copy, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getRecordsByDateRange, saveWeeklyReport, getWeeklyReport, type RecordRow } from "../services/db";
import { generateWeeklyReport } from "../services/ai";
import { getTodayKey } from "../services/date";

function getWeekRange(date: Date): { start: Date; end: Date; startStr: string; endStr: string } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return { start, end, startStr: fmt(start), endStr: fmt(end) };
}

export function WeeklyPanel() {
  const [report, setReport] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [weekRecords, setWeekRecords] = useState<RecordRow[]>([]);
  const [weekRange, setWeekRange] = useState(() => getWeekRange(new Date()));

  useEffect(() => { loadWeekData(); }, []);

  const loadWeekData = async () => {
    try {
      const records = await getRecordsByDateRange(weekRange.startStr, weekRange.endStr);
      setWeekRecords(records);
      const existing = await getWeeklyReport(weekRange.startStr);
      if (existing) setReport(existing.content);
      else setReport(null);
    } catch { /* ignore */ }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await generateWeeklyReport(weekRecords);
      setReport(result);
      await saveWeeklyReport(weekRange.startStr, weekRange.endStr, result);
    } catch {
      setReport("## 本周周报\n\n生成失败，请稍后重试。");
    } finally {
      setIsGenerating(false);
    }
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
        defaultPath: `dailysnap-weekly-${weekRange.startStr}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (filePath) await writeTextFile(filePath, report);
    } catch (err) { console.error("export failed:", err); }
  };

  const days = ["一", "二", "三", "四", "五", "六", "日"];
  const fmtToday = getTodayKey();
  const dayCounts = days.map((_, i) => {
    const dayDate = new Date(weekRange.start);
    dayDate.setDate(weekRange.start.getDate() + i);
    const dateStr = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, "0")}-${String(dayDate.getDate()).padStart(2, "0")}`;
    return {
      label: days[i],
      date: dateStr,
      count: weekRecords.filter((r) => r.date === dateStr).length,
      isToday: dateStr === fmtToday,
    };
  });
  const maxCount = Math.max(...dayCounts.map((d) => d.count), 1);

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ gap: "12px" }}>
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}>
          <RefreshCw size={18} style={{ color: "var(--text-tertiary)" }} />
        </motion.div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>整理本周记录中 ...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header section */}
      <div style={{ padding: "24px 20px 20px 20px" }}>
        <div style={{ marginBottom: "20px" }}>
          <div className="label-caps" style={{ color: "var(--text-tertiary)", marginBottom: "6px" }}>
            周报
          </div>
          <div className="mono" style={{ fontSize: "var(--text-md)", color: "var(--text)" }}>
            {weekRange.startStr} <span style={{ color: "var(--text-tertiary)" }}>—</span> {weekRange.endStr}
          </div>
        </div>

        {/* Week strip */}
        <div style={{ marginBottom: "16px" }}>
          <div className="label-caps" style={{ color: "var(--text-tertiary)", marginBottom: "10px" }}>
            七天记录
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {dayCounts.map((day) => (
              <div key={day.date} className="flex flex-col items-center" style={{ flex: 1, gap: "4px" }}>
                <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>周{day.label}</span>
                <div
                  style={{
                    width: "100%",
                    height: "36px",
                    borderRadius: "var(--radius-sm)",
                    background: day.count > 0 ? "var(--text)" : "transparent",
                    border: day.count === 0 ? "1px solid var(--border)" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      color: day.count > 0 ? "var(--bg)" : "var(--text-tertiary)",
                    }}
                  >
                    {day.count || ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div
            className="mono"
            style={{
              marginTop: "10px",
              fontSize: "11px",
              color: "var(--text-tertiary)",
              textAlign: "right",
            }}
          >
            共 {weekRecords.length} 条
          </div>
        </div>

        {/* Action row — sits BELOW the header, not in the tab bar */}
        <button
          onClick={handleGenerate}
          style={{
            width: "100%",
            padding: "11px",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            background: "var(--text)",
            color: "var(--bg)",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: "pointer",
          }}
        >
          {report ? "重新生成本周周报" : "生成本周周报"}
        </button>
      </div>

      {/* Report body */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "0 20px 20px 20px" }}>
        {report ? (
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
        ) : (
          <div className="flex flex-col items-center" style={{ paddingTop: "40px", gap: "8px" }}>
            <Calendar size={28} style={{ color: "var(--text-tertiary)" }} />
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>本周还没有周报</p>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {report && (
        <div
          className="flex"
          style={{
            padding: "12px 20px 16px 20px",
            borderTop: "1px solid var(--border)",
            gap: "8px",
            background: "var(--bg)",
          }}
        >
          <button
            onClick={handleCopy}
            className="flex items-center justify-center flex-1 transition-colors"
            style={{
              padding: "8px",
              fontSize: "var(--text-xs)",
              background: "transparent",
              color: copied ? "var(--success)" : "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              gap: "6px",
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "已复制" : "复制"}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center justify-center flex-1 transition-colors"
            style={{
              padding: "8px",
              fontSize: "var(--text-xs)",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              gap: "6px",
            }}
          >
            <Download size={12} />
            导出
          </button>
        </div>
      )}
    </div>
  );
}
