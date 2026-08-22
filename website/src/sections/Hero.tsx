import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Download, FileText, Folder } from "lucide-react";
import Cat, { type CatMood } from "../components/Cat";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Bubble {
  id: number;
  role: "cat" | "user";
  text: string;
}

// Hero 区的多轮预设对话（每轮一组，5.5s 自动切换到下一轮循环）
const HERO_PRESET_ROUNDS: Array<{ role: "cat" | "user"; text: string }[]> = [
  // 轮 0：开场 + 介绍
  [
    { role: "cat", text: "喵~ 你好呀！我是你的 DailySnap 小猫。" },
    { role: "cat", text: "以后就蹲在你桌上了。" },
  ],
  // 轮 1：问职业（+ 快捷回复对应）
  [
    { role: "cat", text: "对了，你是做什么工作的呀？" },
  ],
  // 轮 2：问项目（+ 快捷回复对应）
  [
    { role: "cat", text: "嗯，那最近在忙什么项目？跟我说说细节嘛~" },
  ],
  // 轮 3：完成收尾
  [
    { role: "cat", text: "好的，记下来啦~ 滑动看完整演示吧！" },
  ],
];

// 每轮对应的快捷回复（最后一轮不放）
const HERO_QUICK_BY_ROUND: string[][] = [
  [],
  ["写代码的", "做设计"],
  ["写 DailySnap", "公司项目"],
  [],
];

const petReplies = [
  "喵？！……就摸一下哦。",
  "哼，再摸尾巴要翘起来了。",
  "好啦好啦，陪你一下~ 然后记得干活。",
];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** 暖色线条风格的文件夹图标（无背景，跟其他 lucide 图标统一） */
function FolderIcon() {
  return <Folder className="h-full w-full" strokeWidth={1.5} style={{ color: "#c4892f" }} />;
}

function MdFileIcon() {
  return <FileText className="h-full w-full" strokeWidth={1.5} style={{ color: "#5d564b" }} />;
}

const desktopIcons = [
  { key: "work", label: "工作", icon: <FolderIcon /> },
  { key: "idea", label: "灵感", icon: <FolderIcon /> },
  { key: "md", label: "today.md", icon: <MdFileIcon /> },
];

export default function Hero() {
  const [bubbles, setBubbles] = useState<Bubble[]>(
    () => HERO_PRESET_ROUNDS[0].map((b, i) => ({ ...b, id: i - 100 }))
  );
  const [roundIdx, setRoundIdx] = useState(0);
  const [mood, setMood] = useState<CatMood>("calm");
  const [tempVideo, setTempVideo] = useState<string | null>(null);
  const [quick, setQuick] = useState<string[]>(HERO_QUICK_BY_ROUND[0]);
  const [input, setInput] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const idRef = useRef(1);
  const busyRef = useRef(false);
  const idleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const pushBubbles = useCallback((items: { role: "cat" | "user"; text: string }[]) => {
    setBubbles((bs) => [...bs, ...items.map((b) => ({ ...b, id: idRef.current++ }))].slice(-5));
  }, []);

  const resetIdle = useCallback(() => {
    clearTimeout(idleRef.current);
    // 5 分钟静止才进入睡觉
    idleRef.current = setTimeout(() => setMood("sleepy"), 5 * 60_000);
  }, []);

  // 常态动作更频繁：calm 状态下每 4-10s 随机插播 wash/hum
  useEffect(() => {
    if (mood !== "calm") return;
    let alive = true;
    const schedule = () => {
      const delay = 4000 + Math.random() * 6000;
      const t = setTimeout(() => {
        if (!alive) return;
        const isWash = Math.random() < 0.5;
        const src = isWash ? "/cats/wash.webp" : "/cats/hum.webp";
        setTempVideo(src);
        setTimeout(() => setTempVideo(null), isWash ? 4280 : 4960);
        schedule();
      }, delay);
      return t;
    };
    const t = schedule();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [mood]);

  // 开场：猫醒来，然后让 PRESET_ROUNDS[0] 自动展示（5s 切换）
  useEffect(() => {
    setTempVideo("/cats/sleep-wake.webm");
    const t = setTimeout(() => setTempVideo(null), 1800);
    resetIdle();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 5.5s 自动切换到下一轮预设对话
  useEffect(() => {
    const t = setTimeout(() => {
      setRoundIdx((i) => {
        const next = (i + 1) % HERO_PRESET_ROUNDS.length;
        setBubbles(
          HERO_PRESET_ROUNDS[next].map((b, idx) => ({ ...b, id: idx - 100 }))
        );
        setQuick(HERO_QUICK_BY_ROUND[next]);
        return next;
      });
    }, 5500);
    return () => clearTimeout(t);
  }, [roundIdx]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busyRef.current) return;
      busyRef.current = true;
      resetIdle();
      setInput("");
      // 追加用户消息（限制最多 5 条，超出截断）
      pushBubbles([{ role: "user", text }]);
      setMood("curious");
      setQuick([]);

      // 简化版回复（不依赖 respond）：根据关键词给一句
      let reply = "好的，记下来啦~ 今天也挺能干的~";
      if (/谢谢|感谢|可爱|好乖|摸摸/.test(text)) reply = "哼，才、才没有很开心呢~（但我会记住的）";
      else if (/累|烦|崩|困/.test(text)) reply = "累就歇会儿嘛~ 你的记录我都收着呢";
      else if (/你好|hi|hello/.test(text)) reply = "喵~ 你回来啦！我猜，你又打算开始干活了？";
      await sleep(700);
      pushBubbles([{ role: "cat", text: reply }]);
      busyRef.current = false;

      // 5s 后切到下一轮预设（覆盖当前对话气泡）
      setTimeout(() => {
        setRoundIdx((i) => {
          const next = (i + 1) % HERO_PRESET_ROUNDS.length;
          setBubbles(
            HERO_PRESET_ROUNDS[next].map((b, idx) => ({ ...b, id: idx - 100 }))
          );
          setQuick(HERO_QUICK_BY_ROUND[next]);
          return next;
        });
      }, 5000);
    },
    [pushBubbles, resetIdle]
  );

  // 点击猫 = 摸摸头
  const pet = () => {
    if (busyRef.current) return;
    resetIdle();
    setMood("happy");
    pushBubbles([{ role: "cat", text: pick(petReplies) }]);
  };

  return (
    <section id="top" className="desktop-wall relative flex min-h-screen flex-col overflow-hidden min-[2560px]:min-h-[70vh]">
      <div className="h-16 shrink-0" />

      <div className="relative mx-auto grid w-full max-w-6xl flex-1 px-5 md:px-8 lg:grid-cols-[minmax(0,520px)_1fr]">
        {/* 左侧文案 */}
        <div className="flex flex-col justify-center pr-2 py-14 md:pr-8 lg:py-0">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="label-caps text-ink-faint"
          >
            桌面宠物 × 工作记录 · macOS / Windows
          </motion.p>

          <h1 className="mt-6 text-[40px] font-bold leading-[1.18] tracking-tight md:text-[54px]">
            {["陪着你，", "也帮你记住这一天"].map((line, i) => (
              <span key={line} className="block overflow-hidden">
                <motion.span
                  className="block"
                  initial={{ y: "110%" }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.2 + i * 0.14, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.6 }}
            className="mt-6 max-w-md text-[15.5px] leading-relaxed text-ink-soft"
          >
            忙一天想不起自己做了什么，写日报又太累？<br />
            养只小猫当上班搭子——你负责上班，它负责把这一天记好。<br />
            随手丢给它一句话，它来帮你整理日报、周报。
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <a href="#demo" className="btn-ink flex items-center gap-2 px-6 py-3 text-[15px] font-medium">
              先逗逗它
              <ArrowDown size={16} />
            </a>
            <a href="#download" className="btn-ghost flex items-center gap-2 bg-paper/60 px-6 py-3 text-[15px] font-medium">
              <Download size={16} />
              下载桌面版
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.6 }}
            className="mt-8 text-[12.5px] text-ink-faint"
          >
            先别急着滑——右边这只猫是真的，戳它一下试试。
          </motion.p>
        </div>

        {/* 右侧桌面场景 */}
        <div className="relative flex flex-col items-center justify-center min-h-[560px] pt-32 lg:min-h-0 lg:pt-0">
          {/* 桌面图标 */}
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="absolute right-4 top-20 flex flex-col gap-5 md:right-8 md:top-28"
          >
            {desktopIcons.map((ic) => (
              <button
                key={ic.key}
                onClick={() => setSelectedIcon(ic.key)}
                className="group flex w-[64px] flex-col items-center gap-1"
              >
                <span
                  className={`h-11 w-12 rounded-md p-0.5 transition-colors ${
                    selectedIcon === ic.key ? "bg-paper/60 ring-1 ring-ink/20" : ""
                  }`}
                >
                  {ic.icon}
                </span>
                <span
                  className={`rounded px-1 text-[11px] leading-tight text-ink/75 [text-shadow:0_1px_2px_rgba(245,243,236,0.9)] ${
                    selectedIcon === ic.key ? "bg-paper/70" : ""
                  }`}
                >
                  {ic.label}
                </span>
              </button>
            ))}
            {/* DailySnap 本体：双击打开主窗口 */}
            <button
              onClick={() => setSelectedIcon("app")}
              onDoubleClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}
              className="group flex w-[64px] flex-col items-center gap-1"
              title="双击打开主窗口"
            >
              <span
                className={`h-11 w-11 overflow-hidden rounded-[10px] transition-all ${
                  selectedIcon === "app" ? "ring-2 ring-cat-brown/50" : "group-hover:scale-105"
                }`}
              >
                <img src="/icon/icon-64.png" alt="DailySnap" className="h-full w-full" />
              </span>
              <span
                className={`rounded px-1 text-[11px] leading-tight text-ink/75 [text-shadow:0_1px_2px_rgba(245,243,236,0.9)] ${
                  selectedIcon === "app" ? "bg-paper/70" : ""
                }`}
              >
                DailySnap
              </span>
            </button>
          </motion.div>

          {/* 猫 + 气泡 + 输入条（气泡 absolute 锚定猫头顶，猫位置固定） */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex w-[340px] mx-auto flex-col items-center pt-[270px]"
          >
            {/* 气泡：absolute 定位在猫上方，底部对齐向上堆叠，不挤猫 */}
            <div className="absolute top-0 left-0 right-0 flex h-[260px] flex-col items-start justify-end gap-2 overflow-hidden">
              <AnimatePresence>
                {bubbles.map((b) => (
                  <motion.div
                    key={b.id}
                    layout
                    initial={{ opacity: 0, y: 14, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className={`max-w-[280px] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-lg ${
                      b.role === "cat"
                        ? "self-start rounded-bl-md border border-ink/10 bg-paper/75 text-ink backdrop-blur"
                        : "self-end rounded-br-md bg-ink/90 text-paper"
                    }`}
                  >
                    {b.text}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* 猫（固定位置，常态轻微呼吸 + 偶尔偏头） */}
            <div className="flex justify-center">
              <button
                onClick={pet}
                aria-label="摸摸猫头"
                className="cat-idle group relative transition-transform hover:scale-[1.03] active:scale-95"
              >
                <Cat mood={mood} size={230} tempVideo={tempVideo} onSeqEnd={() => setMood("calm")} />
                <span
                  aria-hidden
                  className="cat-shadow pointer-events-none absolute -bottom-1 left-1/2 h-2 w-32 -translate-x-1/2 rounded-full bg-ink/15 blur-md"
                />
              </button>
            </div>

            {/* 输入条 */}
            <div className="mt-2 flex w-full items-center rounded-full border border-ink/10 bg-surface/90 py-1.5 pl-4 pr-1.5 shadow-lg backdrop-blur">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(input)}
                placeholder="写一句话…"
                className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-faint"
              />
              <button
                onClick={() => send(input)}
                aria-label="发送"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-paper transition-transform hover:scale-105 active:scale-95"
              >
                <ArrowUp size={15} />
              </button>
            </div>

            {/* 快捷回复（在输入条下面） */}
            <div className="mt-3 flex min-h-[30px] w-full flex-nowrap items-center justify-center gap-2 overflow-hidden">
              <AnimatePresence>
                {quick.map((q) => (
                  <motion.button
                    key={q}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.25 }}
                    onClick={() => send(q)}
                    className="rounded-full border border-ink/10 bg-paper/75 px-3 py-1.5 text-[12px] text-ink-soft backdrop-blur whitespace-nowrap transition-colors hover:border-ink/30 hover:text-ink"
                  >
                    {q}
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>

      {/* 下滑提示 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="pointer-events-none absolute bottom-3 left-6 hidden items-center gap-2 text-[11px] text-ink-faint md:flex"
      >
        <ArrowDown size={12} className="animate-bounce" />
        主窗口在下面
      </motion.div>
    </section>
  );
}
