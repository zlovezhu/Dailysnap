import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun, X, Settings, Bell, Sparkles, Eye, EyeOff, Pencil } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { TimelinePanel } from "./TimelinePanel";
import { ReportPanel } from "./ReportPanel";
import { WeeklyPanel } from "./WeeklyPanel";
import { StatsPanel } from "./StatsPanel";
import { OnboardingScreen } from "./OnboardingScreen";
import { useTheme } from "../hooks/useTheme";
import { updateSetting as dbUpdateSetting, getAllSettings as dbGetAllSettings, getDailyReport, getRecordsByDate } from "../services/db";
import { backfillMissingReports } from "../services/reportBackfill";
import { offsetDayKey } from "../services/date";

type Tab = "chat" | "timeline" | "report" | "weekly" | "stats";
type ReportSubTab = "daily" | "weekly";

const LIGHT_TIP_MS = 5000;

const TAB_KEYS: Tab[] = ["chat", "timeline", "report", "weekly", "stats"];
const REPORT_SUB_KEYS: ReportSubTab[] = ["daily", "weekly"];

interface SettingsMenuProps {
  open: boolean;
  onClose: () => void;
  onSelect: (action: "reminder" | "ai" | "theme" | "profile") => void;
}

function SettingsMenu({ open, onClose, onSelect }: SettingsMenuProps) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.12 }}
        className="absolute right-3 top-9 z-40 w-52 rounded-lg overflow-hidden shadow-lg"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem icon={<Bell size={13} />} label="提醒设置" onClick={() => { onClose(); onSelect("reminder"); }} />
        <MenuItem icon={<Sparkles size={13} />} label="AI 设置" onClick={() => { onClose(); onSelect("ai"); }} />
        <div className="h-px" style={{ background: "var(--border)" }} />
        <MenuItem icon={<Pencil size={13} />} label="修改我的偏好" onClick={() => { onClose(); onSelect("profile"); }} />
        <MenuItem icon={<Moon size={13} />} label="主题切换" onClick={() => { onClose(); onSelect("theme"); }} />
      </motion.div>
    </>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center w-full text-left transition-colors"
      style={{
        gap: "10px",
        padding: "10px 12px",
        fontSize: "var(--text-sm)",
        color: "var(--text)",
        background: "transparent",
        border: "none",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ color: "var(--text-tertiary)" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/* === Settings Modal (reminder / AI) === */
function SettingsModal({ type, onClose }: { type: "reminder" | "ai" | null; onClose: () => void }) {
  if (!type) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => e.stopPropagation()}
          className="w-[320px] max-h-[80vh] overflow-y-auto rounded-xl shadow-xl"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
            <div className="label-caps" style={{ color: "var(--text-tertiary)" }}>
              {type === "reminder" ? "提醒设置" : "AI 设置"}
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center transition-colors"
              style={{
                width: "22px", height: "22px", borderRadius: "var(--radius-sm)",
                background: "transparent", color: "var(--text-tertiary)",
                border: "none", cursor: "pointer",
              }}
            >
              <X size={13} />
            </button>
          </div>
          <div style={{ padding: "16px" }}>
            {type === "reminder" ? <ReminderSettings onClose={onClose} /> : <AISettings onClose={onClose} />}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ReminderSettings({ onClose }: { onClose: () => void }) {
  const [startTime, setStartTime] = useState("09:30");
  const [interval, setInterval] = useState("120");
  const [reportTime, setReportTime] = useState("04:00");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    dbGetAllSettings()
      .then((data) => {
        if (data.reminder_start_time) setStartTime(data.reminder_start_time);
        if (data.reminder_interval_minutes) setInterval(String(data.reminder_interval_minutes));
        if (data.report_generate_time) setReportTime(data.report_generate_time);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      // Write to DB (primary source of truth)
      await dbUpdateSetting("reminder_start_time", startTime);
      await dbUpdateSetting("reminder_interval_minutes", interval);
      await dbUpdateSetting("report_generate_time", reportTime);
      // Also notify backend scheduler
      await invoke("update_setting", { key: "reminder_start_time", value: startTime }).catch(() => {});
      await invoke("update_setting", { key: "reminder_interval_minutes", value: interval }).catch(() => {});
      await invoke("update_setting", { key: "report_generate_time", value: reportTime }).catch(() => {});
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 800);
    } catch (err) {
      console.error("save reminder settings failed:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Field label="开始提醒时间">
        <input type="time" value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="w-full px-3 py-2.5 text-sm rounded-md outline-none"
          style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
        />
      </Field>
      <Field label="提醒周期">
        <select value={interval}
          onChange={(e) => setInterval(e.target.value)}
          className="w-full px-3 py-2.5 text-sm rounded-md outline-none cursor-pointer"
          style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
        >
          <option value="30">每 30 分钟</option>
          <option value="60">每 1 小时</option>
          <option value="120">每 2 小时</option>
          <option value="180">每 3 小时</option>
        </select>
      </Field>
      <Field label="日报时间">
        <input type="time" value={reportTime}
          onChange={(e) => setReportTime(e.target.value)}
          className="w-full px-3 py-2.5 text-sm rounded-md outline-none"
          style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
        />
      </Field>
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-2 text-sm font-medium rounded-md transition-all flex items-center justify-center"
        style={{
          padding: "12px", height: "42px",
          background: saved ? "var(--success)" : "var(--text)",
          color: "var(--bg)", border: "none", cursor: saving ? "wait" : "pointer",
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? "保存中..." : saved ? "✓ 已保存" : "保存"}
      </button>
    </div>
  );
}

function AISettings({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    dbGetAllSettings()
      .then((data) => {
        if (data.api_key) setApiKey(data.api_key);
        if (data.api_base_url) setBaseUrl(data.api_base_url);
        if (data.model_name) setModel(data.model_name);
      })
      .catch(() => {});
  }, []);

  const PRESETS: Array<{ label: string; url: string; model: string }> = [
    { label: "DeepSeek (推荐)", url: "https://api.deepseek.com", model: "deepseek-v4-flash" },
    { label: "OpenAI (国外)", url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    { label: "月之暗面 Kimi", url: "https://api.moonshot.cn/v1", model: "kimi-k3" },
    { label: "智谱 GLM-4", url: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
    { label: "通义千问", url: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-turbo" },
  ];

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      // Write to DB (primary source of truth)
      await dbUpdateSetting("api_key", apiKey);
      await dbUpdateSetting("api_base_url", baseUrl);
      await dbUpdateSetting("model_name", model);
      // Also notify backend AI client (so agent_turn can use the new config)
      await invoke("sync_ai_config", {
        apiKey,
        baseUrl,
        model,
      }).catch((err) => console.error("sync_ai_config failed:", err));
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 800);
    } catch (err) {
      console.error("save ai settings failed:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <Field label="API Key">
        <div style={{ position: "relative" }}>
          <input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full px-3 text-sm rounded-md outline-none font-mono"
            style={{
              background: "var(--bg)", color: "var(--text)",
              border: "1px solid var(--border)", paddingRight: "36px",
              paddingTop: "12px", paddingBottom: "12px",
              height: "42px", fontSize: "13px",
            }}
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="flex items-center justify-center"
            style={{
              position: "absolute", right: "8px", top: "50%",
              transform: "translateY(-50%)", background: "transparent",
              border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "4px",
            }}
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </Field>

      <Field label="API 接入点">
        <input
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="w-full px-3 text-sm rounded-md outline-none font-mono"
          style={{
            background: "var(--bg)", color: "var(--text)",
            border: "1px solid var(--border)",
            paddingTop: "12px", paddingBottom: "12px",
            height: "42px", fontSize: "13px",
          }}
        />
      </Field>

      <Field label="模型">
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gpt-4o-mini"
          className="w-full px-3 text-sm rounded-md outline-none font-mono"
          style={{
            background: "var(--bg)", color: "var(--text)",
            border: "1px solid var(--border)",
            paddingTop: "12px", paddingBottom: "12px",
            height: "42px", fontSize: "13px",
          }}
        />
      </Field>

      {PRESETS.map((p) => (
        <button
          key={p.url}
          onClick={() => { setBaseUrl(p.url); setModel(p.model); }}
          className="text-xs rounded-md transition-all"
          style={{
            padding: "8px 10px",
            textAlign: "left",
            background: baseUrl === p.url ? "var(--accent-soft)" : "transparent",
            border: "1px solid var(--border)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          <span style={{ fontWeight: 500 }}>{p.label}</span>
          <span style={{ color: "var(--text-tertiary)", marginLeft: "8px", fontSize: "10px" }}>
            {p.url} · {p.model}
          </span>
        </button>
      ))}

      <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "-6px", lineHeight: 1.5 }}>
        留空时使用本地规则生成。点击下方预设可直接填入国内常用 API（DeepSeek、Kimi、智谱、通义）。
      </p>
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-2 text-sm font-medium rounded-md transition-all flex items-center justify-center"
        style={{
          padding: "12px", height: "42px",
          background: saved ? "var(--success)" : "var(--text)",
          color: "var(--bg)", border: "none", cursor: saving ? "wait" : "pointer",
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? "保存中..." : saved ? "✓ 已保存" : "保存"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginBottom: "6px" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function MainWindow() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [reportSub, setReportSub] = useState<ReportSubTab>("daily");
  const [showLightReminder, setShowLightReminder] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsModal, setSettingsModal] = useState<"reminder" | "ai" | null>(null);
  // 首次使用 onboarding：null=加载中，false=需引导，true=已完成
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  // 在已 onboarded 状态下，从设置里「修改我的偏好」进入 onboarding 时为 true
  const [editProfile, setEditProfile] = useState(false);
  // 编辑模式下的初始数据（按需拉取）
  const [profileInitial, setProfileInitial] = useState<import("./OnboardingScreen").OnboardingInitialData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // 把后端 UserProfile 转成 OnboardingScreen 需要的初始数据
  const convertProfile = (p: Record<string, unknown>) => {
    const segs = (p.workday_segments as string | undefined) || "";
    const blocks: Array<{ start: number; end: number }> = [];
    for (const seg of segs.split(",").filter(Boolean)) {
      const [s, e] = seg.split("-").map((s) => s.trim());
      const [sh, sm] = (s || "").split(":").map(Number);
      const [eh, em] = (e || "").split(":").map(Number);
      if (!Number.isNaN(sh) && !Number.isNaN(eh)) {
        blocks.push({ start: sh * 60 + (sm || 0), end: eh * 60 + (em || 0) });
      }
    }
    return {
      catName: (p.cat_name as string) || "",
      occupation: (p.occupation as string) || "",
      interruptStyle: ((p.interrupt_style as string) === "quiet" ? "quiet" : "popup") as "popup" | "quiet",
      reminderIntervalMinutes: Number(p.reminder_interval_minutes) || 60,
      catPersonality: ((p.cat_personality as string) || "warm") as "warm" | "cheeky" | "quiet",
      workdayStart: (p.workday_start as string) || "09:00",
      workdayEnd: (p.workday_end as string) || "18:00",
      workdays: String(p.workdays || "1,2,3,4,5").split(",").map(Number).filter(Boolean),
      workdaySegments: blocks,
    };
  };

  const openProfileEditor = async () => {
    setProfileLoading(true);
    try {
      const p = await invoke<Record<string, unknown>>("get_profile");
      setProfileInitial(convertProfile(p));
      setEditProfile(true);
    } catch (e) {
      console.error("[MainWindow] get_profile failed", e);
    } finally {
      setProfileLoading(false);
    }
  };
  // macOS WKWebView 透明窗口在 hide/show 后经常出现"内容区空白但
  // #root 背景正常"的问题。这是 AnimatePresence 的 exit 动画卡在
  // 中间状态导致的——窗口被 hide 时 motion.div 触发 exit (opacity:0)，
  // show 回来时 exit 没机会完成，新的 content 因为 exit 残留不显示。
  // 用 renderKey 在 window focus 时强制重挂 tab 内容。
  const [renderKey, setRenderKey] = useState(0);
  const lightTimerRef = useRef<number | null>(null);
  const { theme, toggleTheme } = useTheme();

  const handleClose = async () => {
    try { await invoke("show_float_ball"); }
    catch { await getCurrentWindow().hide(); }
  };

  const handleDrag = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    await invoke("start_drag_window", { label: "main" }).catch(() => {});
  };

  const showTopReminder = () => {
    setShowLightReminder(true);
    if (lightTimerRef.current) window.clearTimeout(lightTimerRef.current);
    lightTimerRef.current = window.setTimeout(() => setShowLightReminder(false), LIGHT_TIP_MS);
  };

  // ── 修复「窗口失焦回来后内容区空白」——
  // macOS WKWebView 在 hide/show 时会暂停 AnimatePresence 的 exit 动画，
  // 导致 motion.div 残留 exit 中间态（opacity:0），新内容不显示。
  // 监听 window focus 事件（不只是 visibilitychange，更可靠），
  // 用 setRenderKey 强制 remount tab 内容。
  useEffect(() => {
    const onFocus = () => setRenderKey((k) => k + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // 检查是否已完成 onboarding
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const done = await invoke<boolean>("is_onboarded");
        if (!cancelled) setOnboarded(done);
      } catch {
        // 后端异常时默认当作已完成，避免卡在 onboarding
        if (!cancelled) setOnboarded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 启动时静默补生成漏掉的日报（凌晨关机 / 几天没开程序也能补上）
  // 同时早上 6:00-12:00 之间：检测昨天有 records 没日报 → 弹 toast 提示
  const [reportReminder, setReportReminder] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const n = await backfillMissingReports(7);
      if (n > 0) console.log(`[MainWindow] 启动补生成 ${n} 天日报`);

      const hour = new Date().getHours();
      if (hour >= 6 && hour < 12) {
        const yesterday = offsetDayKey(1);
        try {
          const existing = await getDailyReport(yesterday);
          if (existing) return;
          const records = await getRecordsByDate(yesterday);
          if (records.length > 0) {
            setReportReminder(`昨天有 ${records.length} 条记录但还没生成日报，要现在补吗？`);
          }
        } catch (err) {
          console.error("[MainWindow] report reminder check failed:", err);
        }
      }
    })();
  }, []);

  const handleClickLightReminder = async () => {
    setShowLightReminder(false);
    setActiveTab("chat");
    await emit("focus-chat-input").catch(() => {});
  };

  // Sync tab with URL hash
  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.replace("#", "") as Tab;
      if (TAB_KEYS.includes(hash)) setActiveTab(hash);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  useEffect(() => {
    if (activeTab === "report") {
      window.location.hash = `report-${reportSub}`;
    } else {
      window.location.hash = activeTab;
    }
  }, [activeTab, reportSub]);

  // Keyboard shortcut: 1-5 to switch tabs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const map: Record<string, Tab> = {
        "1": "chat",
        "2": "timeline",
        "3": "report",
        "4": "report",  // jumps to weekly via subtab
        "5": "stats",
      };
      if (map[e.key]) {
        e.preventDefault();
        const tab = map[e.key];
        setActiveTab(tab);
        if (e.key === "4") setReportSub("weekly");
        else setReportSub("daily");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Setup scheduler sync + listeners + AI config sync
  useEffect(() => {
    const syncSchedulerSettings = async () => {
      try {
        const data = await dbGetAllSettings();
        const pairs: Array<[string, string]> = [
          ["reminder_start_time", data.reminder_start_time || "09:30"],
          ["reminder_interval_minutes", data.reminder_interval_minutes || "120"],
          ["report_generate_time", data.report_generate_time || "04:00"],
          ["holiday_disable", data.holiday_disable || "true"],
          ["api_key", data.api_key || ""],
          ["api_base_url", data.api_base_url || "https://api.deepseek.com"],
          ["model_name", data.model_name || "deepseek-v4-flash"],
        ];
        for (const [key, value] of pairs) {
          await invoke("update_setting", { key, value });
        }
        // CRITICAL: also push the API key into the Rust AiClient state.
        // Without this, the back-end AiClient starts with an empty key
        // on every app launch and falls back to the mock reply, even
        // though the DB already has the key saved.
        if (data.api_key) {
          await invoke("sync_ai_config", {
            apiKey: data.api_key,
            baseUrl: data.api_base_url || "https://api.deepseek.com",
            model: data.model_name || "deepseek-v4-flash",
          }).catch((err) => console.error("sync_ai_config failed:", err));
        }
      } catch (error) { console.error(error); }
    };

    const setupListener = async () => {
      await syncSchedulerSettings();
      const { listen } = await import("@tauri-apps/api/event");
      const unlistenSwitchTab = await listen<string>("switch-tab", (event) => {
        setActiveTab(event.payload as Tab);
      });
      const unlistenReminder = await listen("main-reminder-trigger", () => {
        showTopReminder();
      });
      return () => {
        unlistenSwitchTab();
        unlistenReminder();
      };
    };

    const unlistenPromise = setupListener();
    return () => {
      if (lightTimerRef.current) window.clearTimeout(lightTimerRef.current);
      unlistenPromise.then((fn) => fn && fn());
    };
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "chat", label: "对话" },
    { key: "timeline", label: "时间轴" },
    { key: "report", label: "报告" },
    { key: "stats", label: "统计" },
  ];

  // 首次使用 onboarding
  if (onboarded === null) {
    // 加载中
    return <div style={{ width: "100%", height: "100%", background: "var(--bg)" }} />;
  }
  if (onboarded === false) {
    return <OnboardingScreen onDone={() => setOnboarded(true)} />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Title bar */}
      <div
        data-tauri-drag-region
        onMouseDown={handleDrag}
        className="flex items-center justify-between select-none"
        style={{ padding: "8px 12px 4px 12px" }}
      >
        <div className="flex items-center" style={{ gap: "8px" }}>
          <span
            data-tauri-drag-region
            className="label-caps"
            style={{ color: "var(--text-tertiary)" }}
          >
            DailySnap
          </span>
        </div>
        <div className="flex items-center" style={{ gap: "2px" }}>
          <button
            onClick={toggleTheme}
            onMouseDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex items-center justify-center transition-colors"
            style={{
              width: "22px", height: "22px", borderRadius: "var(--radius-sm)",
              background: "transparent", color: "var(--text-tertiary)",
              border: "none", cursor: "pointer",
            }}
            title={theme === "light" ? "切换暗色" : "切换亮色"}
          >
            {theme === "light" ? <Moon size={12} /> : <Sun size={12} />}
          </button>
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            onMouseDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex items-center justify-center transition-colors"
            style={{
              width: "22px", height: "22px", borderRadius: "var(--radius-sm)",
              background: settingsOpen ? "var(--surface-hover)" : "transparent",
              color: settingsOpen ? "var(--text)" : "var(--text-tertiary)",
              border: "none", cursor: "pointer",
            }}
            title="设置"
          >
            <Settings size={12} />
          </button>
          <button
            onClick={handleClose}
            onMouseDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex items-center justify-center transition-colors"
            style={{
              width: "22px", height: "22px", borderRadius: "var(--radius-sm)",
              background: "transparent", color: "var(--text-tertiary)",
              border: "none", cursor: "pointer",
            }}
            title="最小化到悬浮球"
          >
            <X size={13} />
          </button>
        </div>

        <SettingsMenu
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onSelect={(action) => {
            if (action === "theme") {
              toggleTheme();
            } else if (action === "profile") {
              // 从设置进入「修改我的偏好」：拉取 profile 后弹出 onboarding
              void openProfileEditor();
            } else {
              setSettingsModal(action);
            }
          }}
        />
      </div>

      {/* Settings modal (reminder / AI) */}
      <SettingsModal type={settingsModal} onClose={() => setSettingsModal(null)} />

      <AnimatePresence>
        {showLightReminder && (
          <motion.button
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onClick={handleClickLightReminder}
            className="text-left"
            style={{
              border: "none",
              borderTop: "1px solid var(--accent-soft)",
              borderBottom: "1px solid var(--accent-soft)",
              background: "var(--accent-soft)",
              color: "var(--accent-text)",
              fontSize: "var(--text-sm)",
              padding: "8px 16px",
              cursor: "pointer",
              overflow: "hidden",
            }}
          >
            猫喊你啦~ 现在在忙什么？（点击跳转记录）
          </motion.button>
        )}
        {reportReminder && (
          <motion.button
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onClick={() => { setActiveTab("report"); setReportReminder(null); }}
            className="text-left"
            style={{
              border: "none",
              borderTop: "1px solid var(--accent-soft)",
              borderBottom: "1px solid var(--accent-soft)",
              background: "var(--accent-soft)",
              color: "var(--accent-text)",
              fontSize: "var(--text-sm)",
              padding: "8px 16px",
              cursor: "pointer",
              overflow: "hidden",
            }}
          >
            {reportReminder}（点此生成）
          </motion.button>
        )}
      </AnimatePresence>

      {/* Top tabs (4 instead of 6) */}
      <div
        className="flex items-center"
        style={{
          padding: "8px 16px 0 16px",
          gap: "18px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="relative transition-colors"
            style={{
              padding: "8px 0 10px 0",
              fontSize: "var(--text-sm)",
              color: activeTab === tab.key ? "var(--text)" : "var(--text-tertiary)",
              fontWeight: activeTab === tab.key ? 500 : 400,
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            {tab.label}
            {activeTab === tab.key && (
              <motion.div
                layoutId="activeTab"
                style={{
                  position: "absolute",
                  bottom: "-1px",
                  left: 0,
                  right: 0,
                  height: "2px",
                  background: "var(--text)",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Report sub-tabs (only when report tab active) */}
      <AnimatePresence>
        {activeTab === "report" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
            style={{
              borderBottom: "1px solid var(--border)",
              background: "var(--bg)",
            }}
          >
            <div className="flex items-center" style={{ padding: "10px 20px", gap: "16px" }}>
              {REPORT_SUB_KEYS.map((sub) => (
                <button
                  key={sub}
                  onClick={() => setReportSub(sub)}
                  className="relative transition-colors"
                  style={{
                    padding: "4px 0",
                    fontSize: "var(--text-xs)",
                    color: reportSub === sub ? "var(--text)" : "var(--text-tertiary)",
                    fontWeight: reportSub === sub ? 500 : 400,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {sub === "daily" ? "日报" : "周报"}
                  {reportSub === sub && (
                    <motion.div
                      layoutId="activeSub"
                      style={{
                        position: "absolute",
                        bottom: "-1px",
                        left: 0,
                        right: 0,
                        height: "1.5px",
                        background: "var(--text)",
                      }}
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab content */}
      <div className="flex-1 relative" style={{ overflow: "hidden" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab + "-" + (activeTab === "report" ? reportSub : "") + "-rk" + renderKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            style={{ position: "absolute", inset: 0 }}
          >
            {activeTab === "chat" && <ChatPanel />}
            {activeTab === "timeline" && <TimelinePanel />}
            {activeTab === "report" && reportSub === "daily" && <ReportPanel />}
            {activeTab === "report" && reportSub === "weekly" && <WeeklyPanel />}
            {activeTab === "stats" && <StatsPanel />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Edit profile overlay：从设置里「修改我的偏好」时全屏覆盖 onboarding */}
      <AnimatePresence>
        {editProfile && profileInitial && (
          <motion.div
            key="onboarding-edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 60,
              background: "var(--bg)",
            }}
          >
            <OnboardingScreen
              mode="edit"
              initialData={profileInitial}
              onDone={() => {
                setEditProfile(false);
                setProfileInitial(null);
              }}
              onCancel={() => {
                setEditProfile(false);
                setProfileInitial(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile loading hint（拉数据期间的提示） */}
      {profileLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.25)",
            color: "var(--text)",
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          加载偏好中…
        </div>
      )}
    </div>
  );
}