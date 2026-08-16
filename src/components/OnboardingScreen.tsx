import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cat } from "./Cat";

type StepName = "name" | "work" | "remind" | "time" | "freq" | "pers" | "done";

interface TimeBlock {
  start: number; // 分钟，如 540 = 09:00
  end: number;
}

/**
 * 编辑模式下的初始数据。键名跟 OnboardingData 保持一致（前端用自己的 camelCase）。
 * 字段全部可选：缺省字段会用默认值兜底。
 */
export interface OnboardingInitialData {
  catName?: string;
  occupation?: string;                  // 多选用 "、"分隔
  interruptStyle?: "popup" | "quiet";
  reminderIntervalMinutes?: number;    // 数字=预设分钟数，"custom"=自定义
  catPersonality?: "warm" | "cheeky" | "quiet";
  workdayStart?: string;               // "HH:MM"
  workdayEnd?: string;                 // "HH:MM"
  workdays?: number[];                 // [1..7]
  workdaySegments?: Array<{ start: number; end: number }>; // 直接给块，免 parse
}

interface OnboardingScreenProps {
  onDone: () => void;
  onCancel?: () => void;               // 编辑模式：「跳过」/「关闭」时调用，不写入
  mode?: "create" | "edit";            // 默认 "create"
  initialData?: OnboardingInitialData;
}

const ORANGE = "#e8a05c";

const WORK_OPTIONS = ["做产品", "写代码", "做设计", "做运营", "做测试"];

const PERS_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
  { value: "warm", label: "温馨鼓励", desc: "温柔陪伴，多夸夸你" },
  { value: "cheeky", label: "活泼俏皮", desc: "爱开玩笑，偶尔打趣你" },
  { value: "quiet", label: "安静可靠", desc: "话少，但每句都有分量" },
];

const FREQ_OPTIONS: Array<{ value: number | string; label: string; desc: string }> = [
  { value: 30, label: "半小时一次", desc: "适合深度工作，记得更细" },
  { value: 60, label: "一小时一次", desc: "普通节奏，适中" },
  { value: 120, label: "两小时一次", desc: "不想被打断太多" },
];

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

// ── 时间格式化 ──
function fmt(min: number): string {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

const AXIS_START = 6 * 60;
const AXIS_END = 22 * 60;
const SNAP = 30;

// 把 blocks 从字符串 "09:00-12:00,13:00-18:00" 解析回 TimeBlock[]
function parseSegments(segments?: string): TimeBlock[] {
  const fallback: TimeBlock[] = [
    { start: 9 * 60, end: 12 * 60 },
    { start: 13 * 60, end: 18 * 60 },
  ];
  if (!segments) return fallback;
  const result: TimeBlock[] = [];
  for (const seg of segments.split(",")) {
    const [s, e] = seg.split("-").map((s) => s.trim());
    if (!s || !e) continue;
    const [sh, sm] = s.split(":").map(Number);
    const [eh, em] = e.split(":").map(Number);
    if (Number.isNaN(sh) || Number.isNaN(eh)) continue;
    result.push({ start: sh * 60 + (sm || 0), end: eh * 60 + (em || 0) });
  }
  return result.length ? result : fallback;
}

export function OnboardingScreen({ onDone, onCancel, mode = "create", initialData }: OnboardingScreenProps) {
  const isEdit = mode === "edit";

  const [catName, setCatName] = useState(initialData?.catName ?? "");
  const [workChoices, setWorkChoices] = useState<string[]>(
    initialData?.occupation ? initialData.occupation.split("、").filter(Boolean) : []
  );
  const [remindChoice, setRemindChoice] = useState<"active" | "silent" | null>(
    initialData?.interruptStyle === "quiet" ? "silent" : initialData?.interruptStyle === "popup" ? "active" : null
  );
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(
    initialData?.workdaySegments?.length
      ? initialData.workdaySegments
      : parseSegments([initialData?.workdayStart, initialData?.workdayEnd].filter(Boolean).join("-"))
  );
  const [workdays, setWorkdays] = useState<number[]>(initialData?.workdays ?? [1, 2, 3, 4, 5]);
  const [freqChoice, setFreqChoice] = useState<number | string | null>(
    initialData?.reminderIntervalMinutes === 45 ? "custom" : (initialData?.reminderIntervalMinutes ?? null)
  );
  const [freqCustom, setFreqCustom] = useState(
    initialData?.reminderIntervalMinutes && !([30, 60, 120].includes(initialData.reminderIntervalMinutes))
      ? initialData.reminderIntervalMinutes
      : 45
  );
  const [persChoice, setPersChoice] = useState<string | null>(initialData?.catPersonality ?? null);
  const [saving, setSaving] = useState(false);
  // stepIndex：编辑模式固定从首步开始；create 模式从 localStorage 恢复
  const [stepIndex, setStepIndex] = useState<number>(() => {
    if (mode === "edit") return 0;
    try {
      const v = localStorage.getItem("dailysnap-onboarding-step");
      const n = v ? Number(v) : 0;
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch { return 0; }
  });

  // 动态步骤顺序
  const stepOrder: StepName[] = remindChoice === "active"
    ? ["name", "work", "remind", "time", "freq", "pers", "done"]
    : remindChoice === "silent"
      ? ["name", "work", "remind", "pers", "done"]
      : ["name", "work", "remind"];

  const currentStep = stepOrder[stepIndex];

  // 中断恢复：每次 stepIndex 变化时记录到 localStorage（仅 create 模式需要）
  useEffect(() => {
    if (isEdit) return;
    try {
      localStorage.setItem("dailysnap-onboarding-step", String(stepIndex));
    } catch {}
  }, [stepIndex, isEdit]);

  // 组装数据并提交
  const finish = useCallback(async (data: {
    catName: string;
    occupation: string;
    interruptStyle: string;
    reminderIntervalMinutes: number;
    catPersonality: string;
    workdayStart: string;
    workdayEnd: string;
    workdays: string;
    workdaySegments: string;
  }) => {
    setSaving(true);
    try {
      await invoke("complete_onboarding", { data });
      try { localStorage.removeItem("dailysnap-onboarding-step"); } catch {}
      onDone();
    } catch (e) {
      console.error("[onboarding] complete_onboarding failed:", e);
      setSaving(false);
    }
  }, [onDone]);

  // 完成流程
  const handleComplete = useCallback(() => {
    const blocks = timeBlocks;
    const segments = blocks.map((b) => `${fmt(b.start)}-${fmt(b.end)}`).join(",");
    const start = blocks.length ? fmt(blocks[0].start) : "09:00";
    const end = blocks.length ? fmt(blocks[blocks.length - 1].end) : "18:00";
    const interval = typeof freqChoice === "number" ? freqChoice : freqChoice === "custom" ? freqCustom : 60;

    finish({
      catName: catName.trim() || "小猫",
      occupation: workChoices.join("、") || "做产品",
      interruptStyle: remindChoice === "active" ? "popup" : "quiet",
      reminderIntervalMinutes: interval,
      catPersonality: persChoice || "warm",
      workdayStart: start,
      workdayEnd: end,
      workdays: workdays.join(","),
      workdaySegments: segments,
    });
  }, [timeBlocks, freqChoice, freqCustom, catName, workChoices, remindChoice, persChoice, workdays, finish]);

  // 跳过/关闭：
  //  - create 模式：用默认值完成
  //  - edit 模式：直接关闭，不写入
  const handleSkip = useCallback(() => {
    if (isEdit) {
      onCancel?.();
      return;
    }
    finish({
      catName: "小猫",
      occupation: "做产品",
      interruptStyle: "popup",
      reminderIntervalMinutes: 60,
      catPersonality: "warm",
      workdayStart: "09:00",
      workdayEnd: "18:00",
      workdays: "1,2,3,4,5",
      workdaySegments: "09:00-12:00,13:00-18:00",
    });
  }, [finish, isEdit, onCancel]);

  const next = () => { if (stepIndex < stepOrder.length - 1) setStepIndex(stepIndex + 1); };
  const prev = () => { if (stepIndex > 0) setStepIndex(stepIndex - 1); };

  // 各步骤按钮可用性
  const canContinue = (() => {
    switch (currentStep) {
      case "name": return catName.trim().length > 0;
      case "work": return workChoices.length > 0;
      case "remind": return remindChoice !== null;
      case "time": return true;
      case "freq": return freqChoice !== null;
      case "pers": return persChoice !== null;
      default: return true;
    }
  })();

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", position: "relative" }}>
      {/* 顶部：标题 + stepIndex 默认 0（编辑模式从首步开始） */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 6px", flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", letterSpacing: "0.5px" }}>
          {isEdit ? "修改我的偏好" : "DailySnap"}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
          第 {stepIndex + 1} / {stepOrder.length} 步
        </span>
        <button
          onClick={handleSkip}
          disabled={saving}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-tertiary)", fontSize: 12, textDecoration: "underline",
          }}
        >
          {isEdit ? "关闭" : "跳过"}
        </button>
      </div>

      {/* 圆点进度 */}
      <div style={{ display: "flex", gap: 6, justifyContent: "center", padding: "2px 0 8px", flexShrink: 0 }}>
        {stepOrder.map((_, i) => (
          <div
            key={i}
            style={{
              width: 7, height: 7, borderRadius: "50%",
              background: i < stepIndex ? "var(--success)" : i === stepIndex ? "var(--accent)" : "var(--border)",
              transform: i === stepIndex ? "scale(1.35)" : "scale(1)",
              transition: "all 0.2s",
            }}
          />
        ))}
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 16px" }}>
        {currentStep === "name" && <NameStep value={catName} onChange={setCatName} />}
        {currentStep === "work" && <WorkStep value={workChoices} onChange={setWorkChoices} />}
        {currentStep === "remind" && <RemindStep value={remindChoice} onChange={setRemindChoice} />}
        {currentStep === "time" && (
          <TimeStep
            blocks={timeBlocks}
            workdays={workdays}
            onBlocksChange={setTimeBlocks}
            onWorkdaysChange={setWorkdays}
          />
        )}
        {currentStep === "freq" && (
          <FreqStep value={freqChoice} custom={freqCustom} onChange={setFreqChoice} onCustomChange={setFreqCustom} />
        )}
        {currentStep === "pers" && <PersStep value={persChoice} onChange={setPersChoice} />}
        {currentStep === "done" && (
          <DoneStep
            catName={catName}
            workChoices={workChoices}
            remindChoice={remindChoice}
            timeBlocks={timeBlocks}
            workdays={workdays}
            freqChoice={freqChoice}
            freqCustom={freqCustom}
            persChoice={persChoice}
          />
        )}
      </div>

      {/* 底部按钮 */}
      {currentStep !== "done" && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "0 0 18px", flexShrink: 0 }}>
          {stepIndex > 0 && (
            <button onClick={prev} style={{ background: "none", border: "none", color: "var(--text-tertiary)", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>
              上一步
            </button>
          )}
          <button
            onClick={next}
            disabled={!canContinue}
            style={{
              background: "var(--accent)", color: "var(--surface)", border: "none",
              borderRadius: 999, padding: "10px 28px", fontSize: 13, cursor: canContinue ? "pointer" : "not-allowed",
              opacity: canContinue ? 1 : 0.35,
            }}
          >
            继续
          </button>
        </div>
      )}
      {currentStep === "done" && (
        <div style={{ display: "flex", justifyContent: "center", padding: "0 0 18px", flexShrink: 0 }}>
          <button
            onClick={handleComplete}
            disabled={saving}
            style={{
              background: "var(--accent)", color: "var(--surface)", border: "none",
              borderRadius: 999, padding: "10px 28px", fontSize: 13, cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "正在准备..." : "走，一起上班~"}
          </button>
        </div>
      )}

      {/* 小猫 */}
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none", opacity: 0.05 }}>
        {/* 底部水印猫，几乎透明，给个陪伴感 */}
      </div>
    </div>
  );
}

// ── 通用小猫 + 气泡 ──
function StepShell({ children, bubble }: { children: ReactNode; bubble: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 8 }}>
      <Cat mood="calm" size={88} variant="full" />
      <div
        style={{
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
          padding: "10px 14px", fontSize: 13, lineHeight: 1.55, color: "var(--text)",
          maxWidth: "100%", textAlign: "center", position: "relative",
        }}
      >
        {bubble}
      </div>
      {children}
    </div>
  );
}

function NameStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const chips = ["小球", "团子", "阿橘", "咪咪"];
  return (
    <StepShell bubble="喵~ 终于见到你啦！先给我起个名字吧？">
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="输入一个名字…"
          maxLength={8}
          style={{
            width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px",
            fontSize: 13, background: "var(--surface)", color: "var(--text)", outline: "none", fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => onChange(c)}
              style={{
                padding: "8px 14px", borderRadius: 999, border: "1px solid var(--border)",
                background: value === c ? "var(--accent)" : "var(--surface)",
                color: value === c ? "var(--surface)" : "var(--text)", fontSize: 13, cursor: "pointer",
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </StepShell>
  );
}

function WorkStep({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((x) => x !== opt) : [...value, opt]);
  };
  return (
    <StepShell bubble="你平时主要在忙什么呀？可以多选~">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {WORK_OPTIONS.map((opt) => {
          const selected = value.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              style={{
                padding: "8px 14px", borderRadius: 999, border: "1px solid var(--border)",
                background: selected ? "var(--accent)" : "var(--surface)",
                color: selected ? "var(--surface)" : "var(--text)", fontSize: 13, cursor: "pointer",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

function RemindStep({ value, onChange }: { value: "active" | "silent" | null; onChange: (v: "active" | "silent") => void }) {
  const options = [
    { value: "active", title: "主动提醒 + 自己记", desc: "定时弹窗喊你，自己也能随时记" },
    { value: "silent", title: "只自己记，不主动提醒", desc: "不打扰，你想记的时候来找我" },
  ] as const;
  return (
    <StepShell bubble="你想让我怎么提醒你记工作？">
      <div style={{ display: "flex", flexDirection: "column", gap: 9, width: "100%" }}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                display: "flex", alignItems: "center", gap: 11, padding: "12px 14px",
                borderRadius: 12, border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                background: selected ? "var(--accent-soft)" : "var(--surface)", cursor: "pointer", textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                {selected && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />}
              </span>
              <span>
                <span style={{ display: "block", fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{opt.title}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{opt.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

function PersStep({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <StepShell bubble="最后，你希望我是什么性格的猫？">
      <div style={{ display: "flex", flexDirection: "column", gap: 9, width: "100%" }}>
        {PERS_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                display: "flex", alignItems: "center", gap: 11, padding: "12px 14px",
                borderRadius: 12, border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                background: selected ? "var(--accent-soft)" : "var(--surface)", cursor: "pointer", textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                {selected && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />}
              </span>
              <span>
                <span style={{ display: "block", fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{opt.label}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{opt.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </StepShell>
  );
}

function FreqStep({
  value,
  custom,
  onChange,
  onCustomChange,
}: {
  value: number | string | null;
  custom: number;
  onChange: (v: number | string | null) => void;
  onCustomChange: (v: number) => void;
}) {
  const [showCustom, setShowCustom] = useState(value === "custom");
  return (
    <StepShell bubble="多久让我喊你一次？">
      <div style={{ display: "flex", flexDirection: "column", gap: 9, width: "100%" }}>
        {FREQ_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={String(opt.value)}
              onClick={() => { setShowCustom(false); onChange(opt.value); }}
              style={{
                display: "flex", alignItems: "center", gap: 11, padding: "12px 14px",
                borderRadius: 12, border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                background: selected ? "var(--accent-soft)" : "var(--surface)", cursor: "pointer", textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                {selected && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />}
              </span>
              <span>
                <span style={{ display: "block", fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{opt.label}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{opt.desc}</span>
              </span>
            </button>
          );
        })}
        {/* 自定义 */}
        <button
          onClick={() => { setShowCustom(true); onChange("custom"); }}
          style={{
            display: "flex", alignItems: "center", gap: 11, padding: "12px 14px",
            borderRadius: 12, border: `1px solid ${value === "custom" ? "var(--accent)" : "var(--border)"}`,
            background: value === "custom" ? "var(--accent-soft)" : "var(--surface)", cursor: "pointer", textAlign: "left",
          }}
        >
          <span
            style={{
              width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${value === "custom" ? "var(--accent)" : "var(--border)"}`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            {value === "custom" && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />}
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 13, color: "var(--text)", fontWeight: 500 }}>自己定一个</span>
            {showCustom ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <input
                  type="number"
                  value={custom}
                  min={5}
                  max={240}
                  step={5}
                  onChange={(e) => onCustomChange(parseInt(e.target.value) || 45)}
                  style={{
                    width: 80, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6,
                    background: "var(--bg)", fontSize: 12, outline: "none", textAlign: "center", color: "var(--text)", fontFamily: "inherit",
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>分钟一次</span>
              </span>
            ) : (
              <span style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>5 到 240 分钟</span>
            )}
          </span>
        </button>
      </div>
    </StepShell>
  );
}

function TimeStep({
  blocks,
  workdays,
  onBlocksChange,
  onWorkdaysChange,
}: {
  blocks: TimeBlock[];
  workdays: number[];
  onBlocksChange: (b: TimeBlock[]) => void;
  onWorkdaysChange: (d: number[]) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: "left" | "right" | "move"; idx: number; startPx: number; orig: TimeBlock[]; trackWidth: number } | null>(null);
  // track 内可用宽度（扣除左右各 14px padding）。监听 resize。
  const [innerWidth, setInnerWidth] = useState(0);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => setInnerWidth(Math.max(0, track.clientWidth - 28));
    update();
    const obs = new ResizeObserver(update);
    obs.observe(track);
    return () => obs.disconnect();
  }, []);

  const onPointerDown = (e: React.PointerEvent, idx: number, mode: "left" | "right" | "move") => {
    e.stopPropagation();
    e.preventDefault();
    const trackWidth = trackRef.current ? Math.max(0, trackRef.current.clientWidth - 28) : 0;
    dragRef.current = { mode, idx, startPx: e.clientX, orig: blocks.map((b) => ({ ...b })), trackWidth };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const trackWidth = drag.trackWidth || (trackRef.current ? Math.max(0, trackRef.current.clientWidth - 28) : 0);
    const deltaMin = ((e.clientX - drag.startPx) / trackWidth) * (AXIS_END - AXIS_START);
    const next = drag.orig.map((b) => ({ ...b }));
    const blk = next[drag.idx];

    if (drag.mode === "left") {
      let ns = clamp(drag.orig[drag.idx].start + deltaMin, AXIS_START, blk.end - SNAP);
      if (drag.idx > 0 && ns < next[drag.idx - 1].end) {
        const prev = next[drag.idx - 1];
        prev.end = Math.max(ns, prev.start + SNAP);
        ns = prev.end;
      }
      blk.start = ns;
    } else if (drag.mode === "right") {
      let ne = clamp(drag.orig[drag.idx].end + deltaMin, blk.start + SNAP, AXIS_END);
      if (drag.idx < next.length - 1 && ne > next[drag.idx + 1].start) {
        const nxt = next[drag.idx + 1];
        nxt.start = Math.min(ne, nxt.end - SNAP);
        ne = nxt.start;
      }
      blk.end = ne;
    } else {
      const dur = drag.orig[drag.idx].end - drag.orig[drag.idx].start;
      let ns = clamp(drag.orig[drag.idx].start + deltaMin, AXIS_START, AXIS_END - dur);
      if (drag.idx > 0) ns = Math.max(ns, next[drag.idx - 1].end);
      if (drag.idx < next.length - 1) ns = Math.min(ns, next[drag.idx + 1].start - dur);
      blk.start = ns;
      blk.end = ns + dur;
    }
    onBlocksChange(next);
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = blocks.map((b) => ({ ...b }));
    const blk = next[drag.idx];
    if (drag.mode === "left") {
      blk.start = clamp(Math.round(blk.start / SNAP) * SNAP, AXIS_START, blk.end - SNAP);
      if (drag.idx > 0 && blk.start <= next[drag.idx - 1].end) next[drag.idx - 1].end = blk.start;
    } else if (drag.mode === "right") {
      blk.end = clamp(Math.round(blk.end / SNAP) * SNAP, blk.start + SNAP, AXIS_END);
      if (drag.idx < next.length - 1 && blk.end >= next[drag.idx + 1].start) next[drag.idx + 1].start = blk.end;
    } else {
      const dur = drag.orig[drag.idx].end - drag.orig[drag.idx].start;
      blk.start = clamp(Math.round(blk.start / SNAP) * SNAP, AXIS_START, AXIS_END - dur);
      blk.end = blk.start + dur;
    }
    onBlocksChange(next);
    dragRef.current = null;
  };

  const toggleDay = (day: number) => {
    onWorkdaysChange(workdays.includes(day) ? workdays.filter((d) => d !== day) : [...workdays, day]);
  };

  // 合并/拆分
  const canMerge = blocks.length === 2 && blocks[0].end === blocks[1].start;
  const canSplit = blocks.length === 1;

  return (
    <StepShell bubble="你一般几点工作？有午休的话，分两段拖就行~">
      <div style={{ width: "100%" }}>
        <div ref={trackRef} style={{ position: "relative", height: 56, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, touchAction: "none" }}>
          {blocks.map((blk, idx) => {
            // 用 innerWidth 算 px，确保最右块不超出容器（CSS calc 不能扣百分比 padding）
            const leftPx = innerWidth ? ((blk.start - AXIS_START) / (AXIS_END - AXIS_START)) * innerWidth + 14 : 0;
            const widthPx = innerWidth ? ((blk.end - blk.start) / (AXIS_END - AXIS_START)) * innerWidth : 0;
            const touchRight = idx < blocks.length - 1 && blk.end === blocks[idx + 1].start;
            return (
              <div
                key={idx}
                style={{
                  position: "absolute", top: "50%", transform: "translateY(-50%)",
                  left: leftPx, width: widthPx,
                  height: 24, borderRadius: 6, background: ORANGE, cursor: "grab",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                onPointerDown={(e) => onPointerDown(e, idx, "move")}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <span style={{ fontSize: 10, color: "#fff", fontWeight: 600, whiteSpace: "nowrap", pointerEvents: "none" }}>
                  {fmt(blk.start)}–{fmt(blk.end)}
                </span>
                {/* 左 handle */}
                <span
                  onPointerDown={(e) => onPointerDown(e, idx, "left")}
                  style={{
                    position: "absolute", left: -7, top: "50%", transform: "translateY(-50%)",
                    width: 14, height: 14, borderRadius: "50%", background: "#fff",
                    border: `2.5px solid ${ORANGE}`, cursor: "ew-resize", zIndex: 2,
                  }}
                />
                {/* 右 handle（紧挨时隐藏，避免重叠） */}
                {!touchRight && (
                  <span
                    onPointerDown={(e) => onPointerDown(e, idx, "right")}
                    style={{
                      position: "absolute", right: -7, top: "50%", transform: "translateY(-50%)",
                      width: 14, height: 14, borderRadius: "50%", background: "#fff",
                      border: `2.5px solid ${ORANGE}`, cursor: "ew-resize", zIndex: 2,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-secondary)", marginTop: 10 }}>
          {blocks.map((b) => `${fmt(b.start)}–${fmt(b.end)}`).join(" ｜ ")}
        </div>

        <div style={{ textAlign: "center", marginTop: 6, minHeight: 20 }}>
          {canMerge && (
            <button
              onClick={() => onBlocksChange([{ start: blocks[0].start, end: blocks[1].end }])}
              style={{ fontSize: 11, color: ORANGE, textDecoration: "underline", cursor: "pointer", background: "none", border: "none" }}
            >
              合并成一段连续工作
            </button>
          )}
          {canSplit && (
            <button
              onClick={() => {
                const mid = Math.round((blocks[0].start + blocks[0].end) / 2 / SNAP) * SNAP;
                onBlocksChange([
                  { start: blocks[0].start, end: mid },
                  { start: mid + 60, end: blocks[0].end },
                ]);
              }}
              style={{ fontSize: 11, color: ORANGE, textDecoration: "underline", cursor: "pointer", background: "none", border: "none" }}
            >
              + 加午休
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
          {WEEKDAYS.map((d, i) => {
            const day = i + 1;
            const selected = workdays.includes(day);
            return (
              <button
                key={d}
                onClick={() => toggleDay(day)}
                style={{
                  width: 34, height: 34, borderRadius: 8, border: "1px solid var(--border)",
                  background: selected ? "var(--accent)" : "var(--surface)",
                  color: selected ? "var(--surface)" : "var(--text-tertiary)", fontSize: 12, cursor: "pointer",
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </StepShell>
  );
}

function DoneStep({
  catName,
  workChoices,
  remindChoice,
  timeBlocks,
  workdays,
  freqChoice,
  freqCustom,
  persChoice,
}: {
  catName: string;
  workChoices: string[];
  remindChoice: "active" | "silent" | null;
  timeBlocks: TimeBlock[];
  workdays: number[];
  freqChoice: number | string | null;
  freqCustom: number;
  persChoice: string | null;
}) {
  const name = catName.trim() || "小猫";
  const work = workChoices.length ? workChoices.join("、") : "做产品";
  const isActive = remindChoice === "active";
  const pers = PERS_OPTIONS.find((p) => p.value === persChoice)?.label || "温馨鼓励";

  const freqText = (() => {
    if (typeof freqChoice === "number") return `每 ${freqChoice} 分钟`;
    if (freqChoice === "custom") return `每 ${freqCustom} 分钟`;
    const opt = FREQ_OPTIONS.find((f) => f.value === freqChoice);
    return opt ? `每${opt.label.replace(/一次$/, "")}` : "你定的间隔";
  })();

  const days = workdays.map((d) => WEEKDAYS[d - 1]).join("、");
  const segs = timeBlocks.map((b) => `${fmt(b.start)}–${fmt(b.end)}`).join(" ｜ ");

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 8 }}>
      <Cat mood="happy" size={88} variant="full" />
      <div style={{ textAlign: "center", fontSize: 13, color: "var(--text)" }}>喵~ 都记住啦！</div>
      <div
        style={{
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
          padding: 14, fontSize: 13, lineHeight: 1.7, color: "var(--text)", width: "100%",
        }}
      >
        <div style={{ fontSize: 15, marginBottom: 8 }}>
          喵~ 我是 <span style={{ color: ORANGE, fontWeight: 600 }}>{name}</span>~
        </div>
        我做只 <span style={{ color: ORANGE, fontWeight: 600 }}>{pers}</span> 的猫陪你~
        <br />
        你<span style={{ color: ORANGE, fontWeight: 600 }}>{work}</span>，
        {isActive ? (
          <>
            <span style={{ color: ORANGE, fontWeight: 600 }}>{freqText}</span>我会主动找你一次。
            <br />
            每周<span style={{ color: ORANGE, fontWeight: 600 }}>{days}</span>，
            <span style={{ color: ORANGE, fontWeight: 600 }}>{segs}</span> 这段时间找你。
          </>
        ) : (
          <>想记的时候来找我就行~</>
        )}
      </div>
    </div>
  );
}
