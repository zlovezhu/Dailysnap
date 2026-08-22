import { motion } from "framer-motion";
import type { RecordItem } from "./engine";

export default function TimelinePanel({ records }: { records: RecordItem[] }) {
  const sorted = [...records].sort((a, b) => a.time.localeCompare(b.time));
  return (
    <div className="slim-scroll h-full overflow-y-auto px-5 py-5 md:px-7">
      <p className="label-caps text-ink-faint">TIMELINE / 今天的时间轴</p>
      <div className="relative mt-6 pl-7">
        <div className="absolute bottom-2 left-[8px] top-2 w-px bg-ink/15" />
        {sorted.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.35 }}
            className="relative pb-6 last:pb-0"
          >
            <span
              className={`absolute -left-7 top-[6px] h-[10px] w-[10px] rounded-full border-2 border-paper ${
                i === sorted.length - 1 ? "bg-cat-brown" : "bg-success"
              }`}
            />
            <p className="font-mono2 text-[11.5px] text-ink-faint">{r.time}</p>
            <p className="mt-1 text-[14px] leading-relaxed">{r.text}</p>
          </motion.div>
        ))}
        {sorted.length === 0 && (
          <p className="text-[13px] text-ink-faint">还没有记录。去「对话」里随手记一条试试。</p>
        )}
      </div>
      <p className="mt-8 text-[11.5px] text-ink-faint">
        · 每条记录实时落盘 today.md，spine + dot 风格，不堆卡片
      </p>
    </div>
  );
}
