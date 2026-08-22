import { motion } from "framer-motion";

const fadeUp = {
  initial: { opacity: 0, y: 26 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
};

const tools = [
  { name: "save_record", scene: "你分享工作进展时，它悄悄存进 today.md" },
  { name: "followup", scene: "信息不够具体，它追问两句（最多两轮，不烦人）" },
  { name: "search_memory", scene: "你问过去的事：「我上周做了什么」" },
  { name: "generate_report", scene: "你说「生成日报」" },
  { name: "chat", scene: "闲聊、撒娇、倾诉情绪" },
];

const memoryFiles = [
  { file: "profile.md", use: "你的画像：职业、项目、提醒频率、猫的性格" },
  { file: "today.md", use: "今日原始记录" },
  { file: "daily-summaries/", use: "每天的 AI 整理摘要" },
  { file: "long-term.md", use: "从多日记录里提炼出的规律" },
  { file: "states.json", use: "猫的成长档案：mood / love / affinity / streak" },
];

const cards = [
  {
    t: "上下文感知对话",
    d: "主动接住你昨天没干完的事——「喵~ 昨天那个文档写到一半，今天继续？」桌面、悬浮球、主窗口，看到的都是同一份对话。",
  },
  {
    t: "日报自动补生成",
    d: "关机几天也不漏。打开时自动补生成最近 7 天的日报；早上 6–12 点发现昨天的日报还没写，它会主动问你要不要现在补。",
  },
  {
    t: "凌晨 4 点的「一天」",
    d: "你的「今天」不是 0 点翻篇，而是凌晨 4 点——熬到一两点的活还属于今天，不会莫名其妙地滚到「明天」。",
  },
];

export default function Features() {
  return (
    <section id="product" className="mx-auto max-w-6xl px-5 py-24 md:px-8 md:py-32">
      <motion.p {...fadeUp} className="label-caps text-ink-faint">
        FEATURES / 核心功能
      </motion.p>
      <motion.h2
        {...fadeUp}
        className="mt-6 max-w-2xl text-[30px] font-semibold leading-snug tracking-tight md:text-[40px]"
      >
        你随口一句，
        <br />
        它当<span className="text-cat-brown">正经事</span>办。
      </motion.h2>

      <div className="mt-14 grid gap-12 md:grid-cols-[1fr_1.1fr] md:gap-16">
        {/* 意图识别 */}
        <motion.div {...fadeUp}>
          <h3 className="text-[20px] font-semibold tracking-tight">意图识别 · 它听得懂人话</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            AI 用 function calling 自己判断该做什么，不写死规则。你说人话，它选工具：
          </p>
          <ul className="mt-6 space-y-3.5">
            {tools.map((t) => (
              <li key={t.name} className="flex items-start gap-3 text-[14px]">
                <code className="font-mono2 mt-[1px] shrink-0 rounded border border-hairline bg-accent-soft px-1.5 py-0.5 text-[12px] text-cat-brown">
                  {t.name}
                </code>
                <span className="text-ink-soft">{t.scene}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* 三层记忆 */}
        <motion.div {...fadeUp}>
          <h3 className="text-[20px] font-semibold tracking-tight">三层记忆 · 透明的 Markdown</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            所有记忆都是 Markdown 文件，存在{" "}
            <code className="font-mono2 text-[13px] text-cat-brown">~/.dailysnap/memory/</code>
            ——猫记住了你什么，你随时能翻开看，也能同步到 iCloud / Dropbox。
          </p>
          <div className="relative mt-7 pl-6">
            <div className="absolute bottom-3 left-[7px] top-3 w-px bg-ink/15" />
            {memoryFiles.map((f, i) => (
              <motion.div
                key={f.file}
                initial={{ opacity: 0, x: 18 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.07, duration: 0.5 }}
                className="relative pb-6 last:pb-0"
              >
                <span
                  className={`absolute -left-6 top-[7px] h-[9px] w-[9px] rounded-full border-2 border-paper ${
                    i === 0 ? "bg-cat-brown" : i === 4 ? "bg-cat" : "bg-success"
                  }`}
                />
                <p className="font-mono2 text-[13.5px] font-medium">{f.file}</p>
                <p className="mt-0.5 text-[13px] text-ink-soft">{f.use}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* 更多能力 */}
      <div className="mt-16 grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline md:grid-cols-3">
        {cards.map((c, i) => (
          <motion.div
            key={c.t}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ delay: i * 0.1, duration: 0.55 }}
            className="bg-surface p-7"
          >
            <p className="label-caps text-cat-brown">0{i + 1}</p>
            <h4 className="mt-3 text-[17px] font-semibold tracking-tight">{c.t}</h4>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">{c.d}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
