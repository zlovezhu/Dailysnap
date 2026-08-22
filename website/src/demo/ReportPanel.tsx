import { useEffect, useState } from "react";
import Cat from "../components/Cat";

interface Props {
  report: string | null;
  generating: boolean;
  onGenerate: () => void;
}

/** 极简 markdown-ish 渲染 */
function renderLine(line: string, i: number) {
  if (line.startsWith("# ")) {
    return (
      <h4 key={i} className="mb-3 mt-1 text-[18px] font-semibold tracking-tight">
        {line.slice(2)}
      </h4>
    );
  }
  if (line.startsWith("## ")) {
    return (
      <p key={i} className="label-caps mb-2 mt-5 text-cat-brown">
        {line.slice(3)}
      </p>
    );
  }
  if (line.startsWith("- ")) {
    return (
      <p key={i} className="my-1 flex gap-2 text-[13.5px] leading-relaxed">
        <span className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full bg-cat-brown" />
        <span>{bold(line.slice(2))}</span>
      </p>
    );
  }
  if (line.trim() === "") return <div key={i} className="h-2" />;
  return (
    <p key={i} className="my-1 text-[13.5px] leading-relaxed">
      {bold(line)}
    </p>
  );
}

function bold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
}

export default function ReportPanel({ report, generating, onGenerate }: Props) {
  const [sub, setSub] = useState<"daily" | "weekly">("daily");
  const [shown, setShown] = useState(0);

  // 打字机
  useEffect(() => {
    if (!report) return;
    setShown(0);
    const timer = setInterval(() => {
      setShown((s) => {
        if (s >= report.length) {
          clearInterval(timer);
          return s;
        }
        return s + 3;
      });
    }, 18);
    return () => clearInterval(timer);
  }, [report]);

  return (
    <div className="flex h-full flex-col">
      <div className="hairline-b flex items-center gap-1 px-4 py-2.5 md:px-5">
        {(["daily", "weekly"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              sub === k ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
            }`}
          >
            {k === "daily" ? "日报" : "周报"}
          </button>
        ))}
        <span className="ml-auto label-caps text-[9px] text-ink-faint">AUTO-BACKFILL ON</span>
      </div>

      <div className="slim-scroll flex-1 overflow-y-auto px-5 py-5 md:px-7">
        {sub === "weekly" ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Cat mood="calm" size={88} />
            <p className="mt-4 text-[13.5px] text-ink-soft">周报攒满一周的记录后自动生成。</p>
            <p className="mt-1 text-[12px] text-ink-faint">先在「日报」里看看今天吧。</p>
          </div>
        ) : generating ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Cat mood="curious" size={96} />
            <p className="mt-4 text-[13.5px] text-ink-soft">猫正在翻今天的记录……</p>
            <p className="mt-1 font-mono2 text-[11px] text-ink-faint">generate_report(today.md)</p>
          </div>
        ) : report ? (
          <div>
            {report.slice(0, shown).split("\n").map(renderLine)}
            {shown < report.length && <span className="caret-blink text-cat-brown">▍</span>}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Cat mood="calm" size={96} />
            <p className="mt-4 text-[13.5px] text-ink-soft">今天还没有日报。</p>
            <p className="mt-1 text-[12px] text-ink-faint">漏掉的日报，启动时会静默补生成。</p>
            <button onClick={onGenerate} className="btn-ink mt-5 px-5 py-2.5 text-[13px] font-medium">
              生成今日日报
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
