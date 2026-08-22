import { motion } from "framer-motion";
import { type CatMood } from "../components/Cat";

const fadeUp = {
  initial: { opacity: 0, y: 26 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
};

/** 状态机画廊：与设计规范的动画序列一一对应 */
const stateGallery: { mood: CatMood; label: string; seq: string; desc: string; png: string }[] = [
  { mood: "calm", label: "平静 calm", seq: "calm-idle 循环", desc: "默认待机，轻微呼吸", png: "/cats/calm.png" },
  { mood: "curious", label: "好奇 curious", seq: "intro → loop", desc: "你发消息，AI 思考中", png: "/cats/curious.png" },
  { mood: "happy", label: "开心 happy", seq: "excited → 回归", desc: "记完一条 / 闲聊开心", png: "/cats/excited.png" },
  { mood: "satisfied", label: "满足 satisfied", seq: "excited → hum", desc: "日报生成完毕", png: "/cats/hum.png" },
  { mood: "sleepy", label: "犯困 sleepy", seq: "intro → dream 循环", desc: "2 小时没理它", png: "/cats/sleep.png" },
  { mood: "sad", label: "想你 sad", seq: "入睡 → 做梦 → 醒来", desc: "好久没见", png: "/cats/return.png" },
];

/** 小动作彩蛋 */
const sideActions: { src: string; label: string; desc: string }[] = [
  { src: "/cats/wash.png", label: "洗脸", desc: "待机偶尔触发的小动作" },
  { src: "/cats/hum.png", label: "哼歌", desc: "开心时哼两声" },
  { src: "/cats/a-ha.png", label: "灵光一闪", desc: "想到追问的 a-ha 瞬间" },
];

function StaticImg({ src, size }: { src: string; size: number }) {
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      loading="lazy"
      decoding="async"
      style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
    />
  );
}

export default function Companion() {
  return (
    <section id="companion" className="bg-beige py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <motion.div {...fadeUp} className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-caps text-ink-faint">COMPANION / 桌宠养成</p>
            <h2 className="mt-6 max-w-2xl text-[30px] font-semibold leading-snug tracking-tight md:text-[40px]">
              它有 6 种心情，
              <br />
              全写在<span className="text-cat-brown">脸上</span>。
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
              记一条它就开心，两小时没记它会打哈欠睡着，日报生成后它一脸满足。
              以下是它全部的实时状态动画——不是示意图，就是正在跑的它。
            </p>
          </div>
        </motion.div>

        <div className="mt-12 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">
          {stateGallery.map((m, i) => (
            <motion.div
              key={m.mood}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.07, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center text-center"
            >
              <div className="rounded-md border border-hairline bg-surface px-2 py-3">
                <StaticImg src={m.png} size={104} />
              </div>
              <p className="label-caps mt-3 text-ink">{m.label}</p>
              <p className="font-mono2 mt-1 text-[10.5px] text-ink-faint">{m.seq}</p>
              <p className="mt-0.5 text-[12px] text-ink-faint">{m.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* 小动作彩蛋 */}
        <motion.div {...fadeUp} className="mt-10 grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-3">
          {sideActions.map((a) => (
            <div key={a.label} className="flex items-center gap-4 bg-surface p-4">
              <div className="h-[72px] w-[72px] shrink-0">
                <StaticImg src={a.src} size={72} />
              </div>
              <div>
                <p className="text-[14px] font-semibold">{a.label}</p>
                <p className="mt-0.5 text-[12px] text-ink-faint">{a.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* 三维养成 */}
        <motion.div {...fadeUp} className="mt-14 flex flex-wrap gap-x-10 gap-y-4">
          {[
            ["心情值", "随互动实时起伏", 86, "bg-cat"],
            ["好感度", "记一条，涨一点", 64, "bg-cat-brown"],
            ["亲密度", "日子久了，它更懂你", 42, "bg-success"],
          ].map(([name, desc, v, c]) => (
            <div key={name as string} className="min-w-[220px] flex-1">
              <div className="flex items-baseline justify-between">
                <p className="text-[14px] font-medium">{name}</p>
                <p className="text-[12px] text-ink-faint">{desc}</p>
              </div>
              <div className="mt-2 h-[6px] overflow-hidden rounded-full bg-ink/10">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${v}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                  className={`h-full rounded-full ${c}`}
                />
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
