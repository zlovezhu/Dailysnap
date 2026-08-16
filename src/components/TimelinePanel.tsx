import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getRecordsByDate, type RecordRow } from "../services/db";
import { CATEGORY_COLORS, categoryLabel } from "../services/ai";
import { getTodayKey } from "../services/date";

export function TimelinePanel() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => getTodayKey());

  useEffect(() => { loadRecords(selectedDate); }, [selectedDate]);

  const loadRecords = async (date: string) => {
    setLoading(true);
    try { setRecords(await getRecordsByDate(date)); }
    catch { setRecords([]); }
    finally { setLoading(false); }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    const todayStr = getTodayKey();  // 凌晨4点边界
    if (dateStr === todayStr) return "今天";
    const todayDate = new Date(todayStr + "T00:00:00");
    const yesterday = new Date(todayDate); yesterday.setDate(todayDate.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    if (dateStr === yesterdayStr) return "昨天";
    return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
  };

  const changeDate = (delta: number) => {
    const date = new Date(selectedDate + "T00:00:00");
    date.setDate(date.getDate() + delta);
    setSelectedDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
  };

  const isToday = selectedDate === getTodayKey();

  const handleExport = async () => {
    if (records.length === 0) return;
    try {
      const md = `# DailySnap · ${selectedDate}\n\n${records.map((r) => {
        const cat = r.category && r.category !== "other" ? `[${categoryLabel(r.category)}] ` : "";
        let line = `- \`${formatTime(r.created_at)}\` ${cat}${r.content}`;
        if (r.user_followup_reply) line += `\n  - ↳ ${r.user_followup_reply}`;
        return line;
      }).join("\n")}\n\n—\n*从 DailySnap 导出*\n`;
      const filePath = await save({
        defaultPath: `dailysnap-${selectedDate}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (filePath) await writeTextFile(filePath, md);
    } catch (err) { console.error("export failed:", err); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
        加载中 …
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Date navigator */}
      <div style={{ padding: "20px 20px 16px 20px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <button
            onClick={() => changeDate(-1)}
            className="flex items-center justify-center transition-colors"
            style={{
              width: "28px", height: "28px", borderRadius: "var(--radius-md)",
              background: "transparent", border: "1px solid var(--border)", color: "var(--text-tertiary)", cursor: "pointer",
            }}
          >
            <ChevronLeft size={14} />
          </button>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div className="label-caps" style={{ color: "var(--text-tertiary)", marginBottom: "4px" }}>时间轴</div>
            <div style={{ fontSize: "var(--text-md)", fontWeight: 500, color: "var(--text)", letterSpacing: "0.01em" }}>
              {formatDateDisplay(selectedDate)}
            </div>
            <div className="mono" style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
              {records.length} 条记录
            </div>
          </div>
          <button
            onClick={() => changeDate(1)}
            disabled={isToday}
            className="flex items-center justify-center transition-colors"
            style={{
              width: "28px", height: "28px", borderRadius: "var(--radius-md)",
              background: "transparent", border: "1px solid var(--border)", color: "var(--text-tertiary)", cursor: "pointer",
              opacity: isToday ? 0.3 : 1,
            }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
        {records.length > 0 && (
          <button
            onClick={handleExport}
            className="flex items-center justify-center transition-colors"
            style={{
              width: "100%", gap: "6px",
              padding: "6px", fontSize: "11px",
              background: "transparent", color: "var(--text-tertiary)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
              cursor: "pointer",
            }}
          >
            <Download size={11} /> 导出当天记录
          </button>
        )}
      </div>

      {/* Records */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "16px 20px 20px 20px" }}>
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full" style={{ gap: "12px" }}>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>这天没有记录</p>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>切换日期，或等到下次提醒</p>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            {/* Spine line */}
            <div
              style={{
                position: "absolute",
                left: "8px",
                top: "8px",
                bottom: "8px",
                width: "1px",
                background: "var(--border)",
              }}
            />
            <AnimatePresence initial={false}>
              {records.map((record, idx) => {
                const cat = (record.category || "other") as string;
                const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;
                return (
                  <motion.div
                    key={record.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      position: "relative",
                      paddingLeft: "28px",
                      paddingBottom: idx < records.length - 1 ? "20px" : "0",
                    }}
                  >
                    {/* Dot */}
                    <div
                      style={{
                        position: "absolute",
                        left: "4px",
                        top: "8px",
                        width: "9px",
                        height: "9px",
                        borderRadius: "50%",
                        background: "var(--bg)",
                        border: `2px solid ${color}`,
                      }}
                    />
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "4px" }}>
                      <span className="mono" style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                        {formatTime(record.created_at)}
                      </span>
                      {cat !== "other" && (
                        <span
                          className="label-caps"
                          style={{
                            fontSize: "9px",
                            color: color,
                            letterSpacing: "0.1em",
                          }}
                        >
                          {categoryLabel(cat)}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: "var(--text-base)", lineHeight: 1.6, color: "var(--text)", marginBottom: record.user_followup_reply ? "6px" : "0" }}>
                      {record.content}
                    </p>
                    {record.user_followup_reply && (
                      <p
                        style={{
                          fontSize: "var(--text-sm)",
                          lineHeight: 1.55,
                          color: "var(--text-secondary)",
                          paddingLeft: "10px",
                          borderLeft: "2px solid var(--border)",
                        }}
                      >
                        ↳ {record.user_followup_reply}
                      </p>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
