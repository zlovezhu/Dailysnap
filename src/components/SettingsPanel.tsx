import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getAllSettings, updateSetting as dbUpdateSetting } from "../services/db";

interface Settings {
  reminderStartTime: string;
  reportGenerateTime: string;
  reminderIntervalMinutes: number;
  holidayDisable: boolean;
  apiKey: string;
}

const DEFAULT_SETTINGS: Settings = {
  reminderStartTime: "09:30",
  reportGenerateTime: "18:00",
  reminderIntervalMinutes: 120,
  holidayDisable: true,
  apiKey: "",
};

const INTERVAL_OPTIONS = [
  { value: 0, label: "每 30 秒（测试）" },
  { value: 60, label: "每 1 小时" },
  { value: 90, label: "每 1.5 小时" },
  { value: 120, label: "每 2 小时" },
  { value: 180, label: "每 3 小时" },
];

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveWarning, setSaveWarning] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await getAllSettings();
      setSettings({
        reminderStartTime: data.reminder_start_time || "09:30",
        reportGenerateTime: data.report_generate_time || "18:00",
        reminderIntervalMinutes: Number(data.reminder_interval_minutes || "120"),
        holidayDisable: (data.holiday_disable || "true") === "true",
        apiKey: data.api_key || "",
      });
      setIsDirty(false);
    } catch {
      // Use default
    }
  };

  const updateSetting = (key: keyof Settings, value: string | number | boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
    setSaved(false);
    setSaveError("");
    setSaveWarning("");
  };

  const camelToSnake = (str: string) =>
    str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

  const formatError = (error: unknown) => {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "未知错误";
    }
  };

  const saveAllSettings = async () => {
    if (!isDirty || isSaving) return;

    setIsSaving(true);
    setSaveError("");
    setSaveWarning("");

    try {
      const entries = Object.entries(settings) as Array<[keyof Settings, Settings[keyof Settings]]>;
      const runtimeSyncErrors: string[] = [];

      for (const [key, value] of entries) {
        const dbKey = camelToSnake(key);
        const dbValue = String(value);

        try {
          await dbUpdateSetting(dbKey, dbValue);
        } catch (dbError) {
          throw new Error(`字段 ${dbKey} 本地落库失败：${formatError(dbError)}`);
        }

        try {
          await invoke("update_setting", {
            key: dbKey,
            value: dbValue,
          });
        } catch (invokeError) {
          runtimeSyncErrors.push(`${dbKey}: ${formatError(invokeError)}`);
        }
      }

      // Read-back verification to avoid false-success UI.
      const reloaded = await getAllSettings();
      const verified: Settings = {
        reminderStartTime: reloaded.reminder_start_time || "09:30",
        reportGenerateTime: reloaded.report_generate_time || "18:00",
        reminderIntervalMinutes: Number(reloaded.reminder_interval_minutes || "120"),
        holidayDisable: (reloaded.holiday_disable || "true") === "true",
        apiKey: reloaded.api_key || "",
      };

      const matched =
        verified.reminderStartTime === settings.reminderStartTime &&
        verified.reportGenerateTime === settings.reportGenerateTime &&
        verified.reminderIntervalMinutes === settings.reminderIntervalMinutes &&
        verified.holidayDisable === settings.holidayDisable &&
        verified.apiKey === settings.apiKey;

      if (!matched) {
        setSaveError("本地保存校验失败，请重试");
        setSaved(false);
        return;
      }

      setSettings(verified);
      setSaved(true);
      setIsDirty(false);

      if (runtimeSyncErrors.length > 0) {
        setSaveWarning(`已保存到本地，部分实时同步失败（重启后生效）：${runtimeSyncErrors[0]}`);
      }

      setTimeout(() => setSaved(false), 1500);
    } catch (error) {
      setSaved(false);
      setSaveError(`保存失败：${formatError(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    fontSize: "13px",
    border: "1px solid #e5e5e5",
    borderRadius: "6px",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "13px",
    color: "#555",
    marginBottom: "6px",
  };

  return (
    <div style={{ padding: "16px", overflowY: "auto", height: "100%" }}>
      <div style={{ marginBottom: "24px" }}>
        <h3 style={{ fontSize: "12px", color: "#999", fontWeight: 500, marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          提醒设置
        </h3>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>每日开始提醒时间</label>
          <input
            type="time"
            value={settings.reminderStartTime}
            onChange={(e) => updateSetting("reminderStartTime", e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>提醒周期</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateSetting("reminderIntervalMinutes", opt.value)}
                style={{
                  padding: "8px",
                  fontSize: "12px",
                  border: settings.reminderIntervalMinutes === opt.value ? "1px solid #534AB7" : "1px solid #e5e5e5",
                  borderRadius: "6px",
                  background: settings.reminderIntervalMinutes === opt.value ? "#f3f0ff" : "#fff",
                  color: settings.reminderIntervalMinutes === opt.value ? "#534AB7" : "#555",
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>自动生成日报时间</label>
          <input
            type="time"
            value={settings.reportGenerateTime}
            onChange={(e) => updateSetting("reportGenerateTime", e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
          <div>
            <p style={{ fontSize: "13px", color: "#555" }}>节假日自动关闭</p>
            <p style={{ fontSize: "11px", color: "#999", marginTop: "2px" }}>法定节假日不提醒</p>
          </div>
          <button
            onClick={() => updateSetting("holidayDisable", !settings.holidayDisable)}
            style={{
              position: "relative",
              width: "36px",
              height: "20px",
              borderRadius: "10px",
              border: "none",
              background: settings.holidayDisable ? "#534AB7" : "#ccc",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: "2px",
                left: settings.holidayDisable ? "18px" : "2px",
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: "12px", color: "#999", fontWeight: 500, marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          AI 设置
        </h3>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>API Key</label>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => updateSetting("apiKey", e.target.value)}
            placeholder="sk-..."
            style={{ ...inputStyle, fontFamily: "monospace" }}
          />
        </div>
      </div>

      <div style={{ position: "sticky", bottom: 0, background: "#fff", paddingTop: "12px", paddingBottom: "4px" }}>
        <button
          onClick={saveAllSettings}
          disabled={!isDirty || isSaving}
          style={{
            width: "100%",
            padding: "9px 12px",
            borderRadius: "8px",
            border: "none",
            background: !isDirty || isSaving ? "#d9d9d9" : "#534AB7",
            color: "#fff",
            fontSize: "13px",
            fontWeight: 600,
            cursor: !isDirty || isSaving ? "not-allowed" : "pointer",
          }}
        >
          {isSaving ? "保存中..." : "保存设置"}
        </button>

        {saved && (
          <div style={{ textAlign: "center", fontSize: "12px", color: "#4caf50", padding: "6px 0 0" }}>
            设置已保存 ✓
          </div>
        )}
        {saveError && (
          <div style={{ textAlign: "center", fontSize: "12px", color: "#d32f2f", padding: "6px 0 0" }}>
            {saveError}
          </div>
        )}
        {saveWarning && (
          <div style={{ textAlign: "center", fontSize: "12px", color: "#ef6c00", padding: "6px 0 0" }}>
            {saveWarning}
          </div>
        )}
      </div>
    </div>
  );
}
