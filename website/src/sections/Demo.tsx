import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Settings } from "lucide-react";
import Cat, { MOOD_LABEL, type CatMood } from "../components/Cat";
import ChatPanel from "../demo/ChatPanel";
import TimelinePanel from "../demo/TimelinePanel";
import ReportPanel from "../demo/ReportPanel";
import StatsPanel from "../demo/StatsPanel";
import {
  buildDailyReport,
  makeMessage,
  PRESET_ROUNDS,
  ROUND_QUICK_REPLIES,
  type ChatMessage,
  type RecordItem,
} from "../demo/engine";

type Tab = "chat" | "timeline" | "report" | "stats";
const TABS: { key: Tab; label: string; hotkey: string }[] = [
  { key: "chat", label: "对话", hotkey: "1" },
  { key: "timeline", label: "时间轴", hotkey: "2" },
  { key: "report", label: "报告", hotkey: "3" },
  { key: "stats", label: "统计", hotkey: "4" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Demo() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "start 25%"],
  });
  const rotateX = useTransform(scrollYProgress, [0, 1], [26, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.92, 1]);
  const winOpacity = useTransform(scrollYProgress, [0, 1], [0.45, 1]);

  const [tab, setTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>(PRESET_ROUNDS[0]);
  const [roundIdx, setRoundIdx] = useState(0);
  const [typing, setTyping] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>(ROUND_QUICK_REPLIES[0]);
  const [job] = useState<string>();
  const [project] = useState<string>();
  const [records] = useState<RecordItem[]>([
    { id: 1, time: "09:40", text: "项目周会：敲定 Q3 OKR 草案" },
    { id: 2, time: "11:20", text: "把记忆系统重构成 Markdown 三层结构" },
    { id: 3, time: "14:05", text: "修复桌面气泡三秒淡出的动画" },
  ]);
  const [mood, setMood] = useState<CatMood>("calm");
  const [moodVal, setMoodVal] = useState(72);
  const [love, setLove] = useState(34);
  const [affinity, setAffinity] = useState(18);
  const [report, setReport] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tempVideo, setTempVideo] = useState<string | null>(null);
  const idRef = useRef(10);
  const busyRef = useRef(false);

  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  const pushCat = useCallback(async (texts: string[], gap = 650) => {
    for (const t of texts) {
      setTyping(true);
      await sleep(gap + Math.min(t.length * 28, 900));
      setTyping(false);
      setMessages((ms) => [...ms, makeMessage(idRef.current++, "cat", t)]);
      await sleep(320);
    }
  }, []);

  // 开场：猫醒来（同步 PRESET_ROUNDS[0] 的消息已经显示在 UI 里）
  useEffect(() => {
    let alive = true;
    setTempVideo("/cats/sleep-wake.webm");
    const t1 = setTimeout(() => {
      if (alive) setTempVideo(null);
    }, 1500);
    return () => {
      alive = false;
      clearTimeout(t1);
    };
  }, []);

  // 5.5s 自动切换到下一轮预设（同时更新快捷回复 + 猫动态）
  useEffect(() => {
    const t = setTimeout(() => {
      setRoundIdx((i) => {
        const next = (i + 1) % PRESET_ROUNDS.length;
        setMessages(PRESET_ROUNDS[next]);
        setQuickReplies(ROUND_QUICK_REPLIES[next]);
        // 猫动态：随着轮次变化（轮 2 完成 → happy；其他 calm）
        setMood(next === 2 ? "happy" : "calm");
        return next;
      });
    }, 5500);
    return () => clearTimeout(t);
  }, [roundIdx]);

  // 空闲犯困
  useEffect(() => {
    const t = setTimeout(() => setMood("sleepy"), 45000);
    return () => clearTimeout(t);
  }, [messages]);

  // 键盘快捷键 1-4
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const hit = TABS.find((t) => t.hotkey === e.key);
      const r = sectionRef.current?.getBoundingClientRect();
      if (hit && r && r.top < window.innerHeight && r.bottom > 0) {
        setTab(hit.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const doGenerate = useCallback(async () => {
    if (generating || report) return;
    setGenerating(true);
    await sleep(2100);
    setReport(buildDailyReport(records, job, project));
    setGenerating(false);
    setMood("satisfied");
    setAffinity((a) => clamp(a + 4));
    setTab("report");
    pushCat(["写好了，在「报告」里。哼，今天也挺能干的嘛~"], 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating, report, records, job, project, pushCat]);

  const onSend = useCallback(
    async (text: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setTab("chat");
      setQuickReplies([]);
      setMessages((ms) => [...ms, makeMessage(idRef.current++, "user", text)]);

      // 快捷回复的精确匹配（点击对应回复）
      const QUICK_REPLIES: Record<string, string> = {
        "刚开完项目周会": "周会内容记一下：今天敲定了什么~",
        "写完一个功能，提 PR 了": "好的，PR 链接甩过来，我帮你记代码工作~",
        "生成日报": "好嘞，我翻翻今天的记录……",
        "我上周做了什么": "我翻翻记忆……上周你挺忙的：周会定了 OKR、周三把记忆系统重构了、周五修了气泡动画",
      };

      // 简化版：基于关键词给出 1 条回复 + 状态变化
      let reply = QUICK_REPLIES[text] ?? "好的，记下来啦~ 今天也挺能干的~";
      let newMood: CatMood = "happy";
      if (/谢谢|感谢|爱你|可爱|好乖|摸摸/.test(text)) {
        reply = "哼，才、才没有很开心呢~（但我会记住的）";
        newMood = "satisfied";
      } else if (/累|烦|崩|不想干|好困|摸鱼/.test(text)) {
        reply = "累就歇会儿嘛~ 你的记录我都收着呢，一条没丢";
        newMood = "calm";
      } else if (/你好|hi|hello|在吗/.test(text)) {
        reply = "喵~ 你回来啦！我猜，你又打算开始干活了？";
        newMood = "happy";
      }
      setMood(newMood);
      setLove((v) => clamp(v + 3));
      setMoodVal((v) => clamp(v + 5));

      await sleep(700);
      setMessages((ms) => [...ms, makeMessage(idRef.current++, "cat", reply)]);
      busyRef.current = false;

      // 5s 后切到下一轮预设
      setTimeout(() => {
        setRoundIdx((i) => {
          const next = (i + 1) % PRESET_ROUNDS.length;
          setMessages(PRESET_ROUNDS[next]);
          setQuickReplies(ROUND_QUICK_REPLIES[next]);
          setMood(next === 2 ? "happy" : "calm");
          return next;
        });
      }, 5000);
    },
    []
  );

  const gearAction = (kind: string) => {
    setMenuOpen(false);
    if (kind === "theme") pushCat(["演示模式就不换衣服啦，正式版里明暗主题随你换。"], 300);
    if (kind === "remind") pushCat(["提醒设置收到：每小时提醒你喝水、两小时没记录我就打哈欠。"], 300);
    if (kind === "ai") pushCat(["AI 设置在正式版里填 API Key 就行，推荐 DeepSeek 或任意 OpenAI 兼容协议。"], 300);
  };

  return (
    <section ref={sectionRef} id="demo" className="relative overflow-hidden bg-beige py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <p className="label-caps text-ink-faint">LIVE DEMO / 在线体验</p>
            <h2 className="mt-4 max-w-xl text-[30px] font-semibold leading-snug tracking-tight md:text-[40px]">
              随手记一条，它会为你开心；
              <br />
              很久不记录，它会想你。
            </h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink-soft">
              桌面猫负责随手记，主窗口负责好好看——对话、时间轴、报告、统计都在这里。
              从第一次见面到一键日报，直接上手试。
            </p>
          </div>
          <p className="label-caps pb-1 text-ink-faint">按 1-4 切换 Tab</p>
        </motion.div>
      </div>

      {/* 3D 窗口 */}
      <div className="relative mx-auto mt-14 max-w-6xl px-5 md:px-8" style={{ perspective: 1400 }}>
        <motion.div
          style={{ rotateX, scale, opacity: winOpacity, transformStyle: "preserve-3d" }}
          className="window-shadow relative overflow-hidden rounded-xl border border-hairline bg-surface"
        >
          {/* 窗口标题栏 */}
          <div className="hairline-b relative flex h-10 items-center bg-accent-soft/70 px-4">
            <div className="flex gap-2">
              <span className="h-[11px] w-[11px] rounded-full bg-[#ff5f57]" />
              <span className="h-[11px] w-[11px] rounded-full bg-[#febc2e]" />
              <span className="h-[11px] w-[11px] rounded-full bg-[#28c840]" />
            </div>
            <p className="absolute left-1/2 -translate-x-1/2 text-[12.5px] font-medium text-ink-soft">
              DailySnap
            </p>
            <div className="relative ml-auto">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="rounded p-1 text-ink-faint transition-colors hover:text-ink"
                aria-label="设置"
              >
                <Settings size={15} />
              </button>
              {menuOpen && (
                <div className="window-shadow absolute right-0 top-8 z-30 w-36 overflow-hidden rounded-md border border-hairline bg-surface py-1 text-left">
                  {[
                    ["remind", "提醒设置"],
                    ["ai", "AI 设置"],
                    ["theme", "主题切换"],
                  ].map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => gearAction(k)}
                      className="block w-full px-3.5 py-2 text-[12.5px] text-ink-soft transition-colors hover:bg-accent-soft hover:text-ink"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tab 栏 */}
          <div className="hairline-b flex items-center gap-1 px-3 py-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  tab === t.key ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
            <span className="ml-auto hidden items-center gap-2 pr-2 text-[11px] text-ink-faint sm:flex">
              <span className={`h-[7px] w-[7px] rounded-full ${mood === "sleepy" ? "bg-warning" : "bg-success"}`} />
              桌面猫已同步
            </span>
          </div>

          {/* 内容区 */}
          <div className="h-[520px]">
            {tab === "chat" && (
              <div className="grid h-full md:grid-cols-[1fr_250px]">
                <ChatPanel
                  messages={messages}
                  typing={typing}
                  quickReplies={quickReplies}
                  onSend={onSend}
                  catMood={mood}
                />
                {/* 猫状态栏 */}
                <div className="hidden flex-col items-center border-l border-hairline bg-accent-soft/50 px-5 py-6 md:flex">
                  <Cat mood={mood} size={150} tempVideo={tempVideo} onSeqEnd={() => setMood("calm")} />
                  <p className="mt-3 text-[14px] font-semibold">布丁</p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    {MOOD_LABEL[mood]}
                  </p>
                  <div className="mt-6 w-full space-y-4">
                    {[
                      ["心情", moodVal, "bg-cat"],
                      ["好感", love, "bg-cat-brown"],
                      ["亲密", affinity, "bg-success"],
                    ].map(([name, v, c]) => (
                      <div key={name as string}>
                        <div className="flex justify-between text-[11px] text-ink-soft">
                          <span>{name}</span>
                          <span className="font-mono2">{v}</span>
                        </div>
                        <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-ink/10">
                          <motion.div
                            animate={{ width: `${v}%` }}
                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                            className={`h-full rounded-full ${c}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-auto pt-6 text-center text-[10.5px] leading-relaxed text-ink-faint">
                    记忆目录
                    <br />
                    <span className="font-mono2">~/.dailysnap/memory/</span>
                  </p>
                </div>
              </div>
            )}
            {tab === "timeline" && <TimelinePanel records={records} />}
            {tab === "report" && (
              <ReportPanel report={report} generating={generating} onGenerate={doGenerate} />
            )}
            {tab === "stats" && <StatsPanel />}
          </div>
        </motion.div>
      </div>

      <p className="mx-auto mt-16 max-w-6xl px-5 text-[12px] text-ink-faint md:px-8">
        · 网页模拟版：意图识别、养成数值、日报生成均为本地脚本演示；正式版由真实 AI 驱动，数据存在你自己机器上。
      </p>
    </section>
  );
}
