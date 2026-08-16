import { useState, useEffect } from "react";
import { BarChart3 } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { getRecordsByDateRange, type RecordRow } from "../services/db";
import { categoryLabel, CATEGORY_COLORS } from "../services/ai";
import { getTodayKey } from "../services/date";

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

function getToday(): string {
  return getTodayKey();
}

function getLast30Days(): string {
  const now = new Date();
  now.setDate(now.getDate() - 30);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function StatsPanel() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    setLoading(true);
    try { setRecords(await getRecordsByDateRange(getLast30Days(), getToday())); }
    catch { setRecords([]); }
    finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
        加载中 …
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ gap: "16px" }}>
        <BarChart3 size={28} style={{ color: "var(--text-tertiary)" }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>还没有记录数据</div>
          <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>记录几条后能看到统计</div>
        </div>
      </div>
    );
  }

  const categoryCount: Record<string, number> = {};
  records.forEach((r) => {
    const cat = r.category || "other";
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  });
  const pieData = Object.entries(categoryCount).map(([key, value]) => ({
    name: categoryLabel(key),
    value,
    color: CATEGORY_COLORS[key] || CATEGORY_COLORS.other,
  }));

  const hourCount: Record<number, number> = {};
  records.forEach((r) => {
    const hour = new Date(r.created_at).getHours();
    hourCount[hour] = (hourCount[hour] || 0) + 1;
  });
  const barData = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}`, count: hourCount[h] || 0 }));

  const today = new Date();
  const heatmap = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const count = records.filter((r) => r.date === dateStr).length;
    heatmap.push({ date: dateStr, count, day: d.getDate() });
  }
  const maxHeat = Math.max(...heatmap.map((d) => d.count), 1);

  const activeDays = new Set(records.map((r) => r.date)).size;

  const tooltipStyle = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    fontSize: "12px",
    padding: "6px 10px",
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ padding: "20px 20px 24px 20px" }}>
      {/* 概览 */}
      <section style={{ marginBottom: "28px" }}>
        <div className="label-caps" style={{ color: "var(--text-tertiary)", marginBottom: "14px" }}>
          近 30 天
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          <StatBlock label="记录" value={records.length.toString()} unit="条" />
          <StatBlock label="活跃天" value={activeDays.toString()} unit="天" />
        </div>
      </section>

      {/* 分类 */}
      <section style={{ marginBottom: "28px" }}>
        <div className="label-caps" style={{ color: "var(--text-tertiary)", marginBottom: "14px" }}>
          分类分布
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ width: "130px", height: "130px", flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={55} innerRadius={34}
                  paddingAngle={2} strokeWidth={0}
                >
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
            {pieData.map((item) => (
              <div key={item.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: item.color }} />
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{item.name}</span>
                </div>
                <span className="mono" style={{ fontSize: "var(--text-sm)", color: "var(--text)", fontWeight: 500 }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 时段 */}
      <section style={{ marginBottom: "28px" }}>
        <div className="label-caps" style={{ color: "var(--text-tertiary)", marginBottom: "14px" }}>
          时段分布
        </div>
        <div style={{ height: "120px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 4, right: 0, bottom: 0, left: -28 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="hour" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                interval={3} axisLine={{ stroke: "var(--border)" }} tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} 条`, "记录"]} labelFormatter={(l) => `${l} 点`} />
              <Bar dataKey="count" fill="var(--text)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 热力图 */}
      <section>
        <div className="label-caps" style={{ color: "var(--text-tertiary)", marginBottom: "14px" }}>
          30 天频率
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(15, 1fr)", gap: "4px" }}>
          {heatmap.map((day) => {
            const intensity = day.count === 0 ? 0 : Math.max(0.15, day.count / maxHeat);
            return (
              <div
                key={day.date}
                title={`${day.date}: ${day.count} 条`}
                style={{
                  aspectRatio: "1",
                  borderRadius: "3px",
                  background: day.count === 0
                    ? "var(--surface)"
                    : `rgba(31, 29, 24, ${intensity})`,
                  border: "1px solid var(--border)",
                }}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatBlock({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
        <span className="mono" style={{ fontSize: "28px", fontWeight: 500, color: "var(--text)", lineHeight: 1, letterSpacing: "-0.02em" }}>
          {value}
        </span>
        <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{unit}</span>
      </div>
    </div>
  );
}
