import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Moon, Sun } from "lucide-react";
import { getAllSettings, updateSetting as dbUpdateSetting } from "../services/db";
import { useTheme } from "../hooks/useTheme";

interface Settings {
  reminderStartTime: string;
  reportGenerateTime: string;
  reminderIntervalMinutes: number;
  holidayDisable: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  reminderStartTime: "09:30",
  reportGenerateTime: "04:00",
  reminderIntervalMinutes: 120,
  holidayDisable: true,
};

const INTERVAL_OPTIONS = [
  { value: 0, label: "30 秒（测试）" },
  { value: 60, label: "1 小时" },
  { value: 90, label: "1.5 小时" },
  { value: 120, label: "2 小时" },
  { value: 180, label: "3 小时" },
];

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { theme, setTheme } = useTheme();

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const data = await getAllSettings();
      setSettings({
        reminderStartTime: data.reminder_start_time || "09:30",
        reportGenerateTime: data.report_generate_time || "04:00",
        reminderIntervalMinutes: Number(data.reminder_interval_minutes || "120"),
        holidayDisable: (data.holiday_disable || "true") === "true",
      });
      setIsDirty(false);
    } catch { /* use defaults */ }
  };

  const updateSetting = (key: keyof Settings, value: string | number | boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
    setSaved(false);
    setSaveError("");
  };

  const camelToSnake = (str: string) =>
    str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

  const formatError = (error: unknown) => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    try { return JSON.stringify(error); } catch { return "未知错误"; }
  };

  const saveAllSettings = async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    setSaveError("");
    try {
      const entries = Object.entries(settings) as Array<[keyof Settings, Settings[keyof Settings]]>;
      const runtimeSyncErrors: string[] = [];
      for (const [key, value] of entries) {
        const dbKey = camelToSnake(key);
        const dbValue = String(value);
        try { await dbUpdateSetting(dbKey, dbValue); }
        catch (dbError) { throw new Error(`字段 ${dbKey} 本地落库失败：${formatError(dbError)}`); }
        try { await invoke("update_setting", { key: dbKey, value: dbValue }); }
        catch (invokeError) { runtimeSyncErrors.push(`${dbKey}: ${formatError(invokeError)}`); }
      }
      const reloaded = await getAllSettings();
      const verified: Settings = {
        reminderStartTime: reloaded.reminder_start_time || "09:30",
        reportGenerateTime: reloaded.report_generate_time || "04:00",
        reminderIntervalMinutes: Number(reloaded.reminder_interval_minutes || "120"),
        holidayDisable: (reloaded.holiday_disable || "true") === "true",
      };
      const matched =
        verified.reminderStartTime === settings.reminderStartTime &&
        verified.reportGenerateTime === settings.reportGenerateTime &&
        verified.reminderIntervalMinutes === settings.reminderIntervalMinutes &&
        verified.holidayDisable === settings.holidayDisable;
      if (!matched) { setSaveError("本地保存校验失败，请重试"); setSaved(false); return; }

      setSettings(verified);
      setSaved(true);
      setIsDirty(false);
      setTimeout(() => setSaved(false), 1500);
    } catch (error) {
      setSaved(false);
      setSaveError(`保存失败：${formatError(error)}`);
    } finally { setIsSaving(false); }
  };

  const inputStyle = {
    width: "100%",
    padding: "9px 12px",
    fontSize: "var(--text-base)",
    background: "var(--surface)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    outline: "none",
  };

  return (
    <div style={{ padding: "20px 20px 24px 20px", overflowY: "auto", height: "100%" }}>
      {/* 主题 */}
      <section style={{ marginBottom: "28px" }}>
        <div className="label-caps" style={{ color: "var(--text-tertiary)", marginBottom: "12px" }}>
          外观
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={() => setTheme("light")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "10px",
              fontSize: "var(--text-sm)",
              borderRadius: "var(--radius-md)",
              border: theme === "light" ? "1px solid var(--text)" : "1px solid var(--border)",
              background: theme === "light" ? "var(--surface)" : "transparent",
              color: theme === "light" ? "var(--text)" : "var(--text-tertiary)",
              cursor: "pointer",
              fontWeight: theme === "light" ? 500 : 400,
            }}
          >
            <Sun size={13} /> 亮色
          </button>
          <button
            onClick={() => setTheme("dark")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "10px",
              fontSize: "var(--text-sm)",
              borderRadius: "var(--radius-md)",
              border: theme === "dark" ? "1px solid var(--text)" : "1px solid var(--border)",
              background: theme === "dark" ? "var(--surface)" : "transparent",
              color: theme === "dark" ? "var(--text)" : "var(--text-tertiary)",
              cursor: "pointer",
              fontWeight: theme === "dark" ? 500 : 400,
            }}
          >
            <Moon size={13} /> 暗色
          </button>
        </div>
      </section>

      {/* 提醒 */}
      <section style={{ marginBottom: "28px" }}>
        <div className="label-caps" style={{ color: "var(--text-tertiary)", marginBottom: "14px" }}>
          提醒
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "6px" }}>
            每日开始时间
          </label>
          <input
            type="time"
            value={settings.reminderStartTime}
            onChange={(e) => updateSetting("reminderStartTime", e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "8px" }}>
            提醒周期
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
            {INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateSetting("reminderIntervalMinutes", opt.value)}
                style={{
                  padding: "9px 8px",
                  fontSize: "var(--text-sm)",
                  background: settings.reminderIntervalMinutes === opt.value ? "var(--text)" : "var(--surface)",
                  color: settings.reminderIntervalMinutes === opt.value ? "var(--bg)" : "var(--text-secondary)",
                  border: "1px solid",
                  borderColor: settings.reminderIntervalMinutes === opt.value ? "var(--text)" : "var(--border)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  fontWeight: settings.reminderIntervalMinutes === opt.value ? 500 : 400,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "6px" }}>
            日报时间
          </label>
          <input
            type="time"
            value={settings.reportGenerateTime}
            onChange={(e) => updateSetting("reportGenerateTime", e.target.value)}
            style={inputStyle}
          />
        </div>

        <div
          className="flex items-center justify-between"
          style={{ padding: "8px 0" }}
        >
          <div>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text)", marginBottom: "2px" }}>节假日自动关闭</p>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>法定节假日不提醒</p>
          </div>
          <button
            onClick={() => updateSetting("holidayDisable", !settings.holidayDisable)}
            style={{
              position: "relative",
              width: "38px",
              height: "22px",
              borderRadius: "999px",
              border: "none",
              background: settings.holidayDisable ? "var(--text)" : "var(--border)",
              cursor: "pointer",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "3px",
                left: settings.holidayDisable ? "19px" : "3px",
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                background: "var(--bg)",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>
      </section>

      {/* AI */}
      <section style={{ marginBottom: "28px" }}>
        <div className="label-caps" style={{ color: "var(--text-tertiary)", marginBottom: "12px" }}>
          AI
        </div>
        <div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)", lineHeight: 1.6 }}>
            AI 能力由 DailySnap 服务端提供，无需配置即可使用。
          </p>
        </div>
      </section>

      {/* Save */}
      <div style={{ paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={saveAllSettings}
          disabled={!isDirty || isSaving}
          style={{
            width: "100%",
            padding: "11px",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            background: isDirty && !isSaving ? "var(--text)" : "var(--border)",
            color: isDirty && !isSaving ? "var(--bg)" : "var(--text-tertiary)",
            border: "none",
            borderRadius: "var(--radius-md)",
            cursor: isDirty && !isSaving ? "pointer" : "not-allowed",
          }}
        >
          {isSaving ? "保存中..." : "保存设置"}
        </button>
        {saved && (
          <div style={{ textAlign: "center", fontSize: "12px", color: "var(--success)", padding: "8px 0 0" }}>
            ✓ 已保存
          </div>
        )}
        {saveError && (
          <div style={{ textAlign: "center", fontSize: "12px", color: "var(--danger)", padding: "8px 0 0" }}>
            {saveError}
          </div>
        )}
      </div>
    </div>
  );
}
