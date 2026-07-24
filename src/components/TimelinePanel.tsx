import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Record {
  id: number;
  content: string;
  ai_followup: string | null;
  user_followup_reply: string | null;
  created_at: string;
}

export function TimelinePanel() {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTodayRecords();
  }, []);

  const loadTodayRecords = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const data = await invoke<Record[]>("get_records_by_date", { date: today });
      setRecords(data);
    } catch {
      setRecords([
        { id: 1, content: "处理邮件和消息，回复产品反馈", ai_followup: null, user_followup_reply: null, created_at: "2026-06-11T09:30:00" },
        { id: 2, content: "参加需求评审会议", ai_followup: "是什么主题的会？", user_followup_reply: "Q3 新功能规划", created_at: "2026-06-11T10:45:00" },
        { id: 3, content: "写碎片日报工具的产品方案", ai_followup: null, user_followup_reply: null, created_at: "2026-06-11T14:00:00" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", fontSize: "13px" }}>
        加载中...
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", gap: "8px" }}>
        <p style={{ fontSize: "13px" }}>今天还没有记录</p>
        <p style={{ fontSize: "12px", color: "#bbb" }}>等下次提醒到来时开始记录吧~</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <span style={{ fontSize: "13px", fontWeight: 500, color: "#333" }}>
          今日记录 ({records.length} 条)
        </span>
        <span style={{ fontSize: "11px", color: "#999" }}>
          {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}
        </span>
      </div>

      {records.map((record, index) => (
        <div key={record.id} style={{ display: "flex", gap: "12px", marginBottom: index < records.length - 1 ? "0" : "0" }}>
          {/* Timeline dot and line */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#534AB7", marginTop: "6px", flexShrink: 0 }} />
            {index < records.length - 1 && (
              <div style={{ width: "1px", flex: 1, background: "#e5e5e5", margin: "4px 0" }} />
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, paddingBottom: "16px" }}>
            <span style={{ fontSize: "11px", color: "#999", fontFamily: "monospace" }}>
              {formatTime(record.created_at)}
            </span>
            <p style={{ fontSize: "13px", color: "#333", marginTop: "4px", lineHeight: "1.5" }}>
              {record.content}
            </p>
            {record.user_followup_reply && (
              <p style={{ fontSize: "12px", color: "#666", marginTop: "4px", paddingLeft: "8px", borderLeft: "2px solid #e5e5e5" }}>
                {record.user_followup_reply}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
