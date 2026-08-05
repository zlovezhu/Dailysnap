import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun, X, Settings, Bell, Sparkles, Eye, EyeOff } from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { TimelinePanel } from "./TimelinePanel";
import { ReportPanel } from "./ReportPanel";
import { WeeklyPanel } from "./WeeklyPanel";
import { StatsPanel } from "./StatsPanel";
import { Cat, type CatMood } from "./Cat";
import { useTheme } from "../hooks/useTheme";
import { updateSetting as dbUpdateSetting, getAllSettings as dbGetAllSettings } from "../services/db";

type Tab = "chat" | "timeline" | "report" | "weekly" | "stats";
type ReportSubTab = "daily" | "weekly";

const LIGHT_TIP_MS = 5000;

const TAB_KEYS: Tab[] = ["chat", "timeline", "report", "weekly", "stats"];
const REPORT_SUB_KEYS: ReportSubTab[] = ["daily", "weekly"];

interface SettingsMenuProps {
  open: boolean;
  onClose: () => void;
  onSelect: (action: "reminder" | "ai" | "theme") => void;
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
  const [reportTime, setReportTime] = useState("18:00");
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
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    dbGetAllSettings()
      .then((data) => { if (data.api_key) setApiKey(data.api_key); })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      // Write to DB (primary source of truth)
      await dbUpdateSetting("api_key", apiKey);
      // Also notify backend AI client (so agent_turn can use the key)
      await invoke("sync_ai_config", {
        apiKey,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
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
      <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "-6px", lineHeight: 1.5 }}>
        留空时使用本地规则生成；配置后可启用 AI 追问和日报生成。推荐用 gpt-4o-mini 或国产模型。
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
  const [catMood, setCatMood] = useState<CatMood>("curious");
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

  const handleClickLightReminder = async () => {
    setShowLightReminder(false);
    setActiveTab("chat");
    await emit("focus-chat-input").catch(() => {});
  };

  // Sync cat mood with backend state
  useEffect(() => {
    const fetchState = async () => {
      try {
        const s = await invoke<{ state_label: string }>("get_cat_state");
        setCatMood(s.state_label as CatMood);
      } catch { /* ignore */ }
    };
    fetchState();
    const interval = setInterval(fetchState, 30000);
    return () => clearInterval(interval);
  }, []);

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

  // Setup scheduler sync + listeners
  useEffect(() => {
    const syncSchedulerSettings = async () => {
      try {
        const data = await invoke<Record<string, string>>("get_all_settings");
        const pairs: Array<[string, string]> = [
          ["reminder_start_time", data.reminder_start_time || "09:30"],
          ["reminder_interval_minutes", data.reminder_interval_minutes || "120"],
          ["report_generate_time", data.report_generate_time || "18:00"],
          ["holiday_disable", data.holiday_disable || "true"],
          ["api_key", data.api_key || ""],
          ["api_base_url", data.api_base_url || "https://api.openai.com/v1"],
          ["model_name", data.model_name || "gpt-4o-mini"],
        ];
        for (const [key, value] of pairs) {
          await invoke("update_setting", { key, value });
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
          <Cat mood={catMood} size={24} hasNotification={false} />
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
            key={activeTab + "-" + (activeTab === "report" ? reportSub : "")}
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
    </div>
  );
}