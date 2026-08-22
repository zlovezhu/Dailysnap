import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const pieData = [
  { name: "开发", value: 38 },
  { name: "会议", value: 18 },
  { name: "沟通协作", value: 16 },
  { name: "学习", value: 14 },
  { name: "其他", value: 14 },
];
const PIE_COLORS = ["#5c4033", "#f2c078", "#8e6620", "#e3b374", "#4d6c39"];

const barData = [
  { d: "一", n: 6 },
  { d: "二", n: 9 },
  { d: "三", n: 5 },
  { d: "四", n: 11 },
  { d: "五", n: 8 },
  { d: "六", n: 2 },
  { d: "日", n: 1 },
];

/** 确定性伪随机，保证每次渲染一致 */
function seed(x: number, y: number) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

const heatColors = ["#efe9da", "#f7e8d0", "#f2c078", "#e0a050", "#5c4033"];

export default function StatsPanel() {
  return (
    <div className="slim-scroll grid h-full gap-8 overflow-y-auto px-5 py-5 md:grid-cols-2 md:px-7">
      <div>
        <p className="label-caps text-ink-faint">时间分布 / 本周</p>
        <div className="mt-3 h-[190px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={3}
                strokeWidth={0}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#1c1a17",
                  border: "none",
                  borderRadius: 6,
                  color: "#f5f3ec",
                  fontSize: 12,
                }}
                itemStyle={{ color: "#f5f3ec" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
          {pieData.map((d, i) => (
            <span key={d.name} className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
              <span className="h-[8px] w-[8px] rounded-[2px]" style={{ background: PIE_COLORS[i] }} />
              {d.name} {d.value}%
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="label-caps text-ink-faint">记录条数 / 本周</p>
        <div className="mt-3 h-[190px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} barSize={20}>
              <XAxis
                dataKey="d"
                tickLine={false}
                axisLine={{ stroke: "rgba(28,26,23,0.14)" }}
                tick={{ fontSize: 11, fill: "#8b8375" }}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: "rgba(28,26,23,0.05)" }}
                contentStyle={{
                  background: "#1c1a17",
                  border: "none",
                  borderRadius: 6,
                  color: "#f5f3ec",
                  fontSize: 12,
                }}
                itemStyle={{ color: "#f5f3ec" }}
              />
              <Bar dataKey="n" radius={[3, 3, 0, 0]} fill="#5c4033" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="md:col-span-2">
        <p className="label-caps text-ink-faint">活跃热力 / 近 16 周</p>
        <div className="mt-3 flex gap-[3px]">
          {Array.from({ length: 16 }).map((_, w) => (
            <div key={w} className="flex flex-1 flex-col gap-[3px]">
              {Array.from({ length: 7 }).map((_, d) => {
                const v = seed(w, d);
                const level = v < 0.22 ? 0 : v < 0.45 ? 1 : v < 0.68 ? 2 : v < 0.87 ? 3 : 4;
                return (
                  <div
                    key={d}
                    className="aspect-square w-full rounded-[2px]"
                    style={{ background: heatColors[level] }}
                    title={`${level} 条记录`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-end gap-1.5 text-[10.5px] text-ink-faint">
          少
          {heatColors.map((c) => (
            <span key={c} className="h-[9px] w-[9px] rounded-[2px]" style={{ background: c }} />
          ))}
          多
        </div>
      </div>
    </div>
  );
}
