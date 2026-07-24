import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { ChatPanel } from "./ChatPanel";
import { TimelinePanel } from "./TimelinePanel";
import { ReportPanel } from "./ReportPanel";
import { SettingsPanel } from "./SettingsPanel";
import { getAllSettings } from "../services/db";

type Tab = "chat" | "timeline" | "report" | "settings";

const LIGHT_TIP_MS = 5000;

export function MainWindow() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [showLightReminder, setShowLightReminder] = useState(false);
  const lightTimerRef = useRef<number | null>(null);

  const handleClose = async () => {
    try {
      await invoke("show_float_ball");
    } catch (e) {
      console.error("show_float_ball failed:", e);
      const win = getCurrentWindow();
      await win.hide();
    }
  };

  const handleDrag = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    await invoke("start_drag_window", { label: "main" }).catch(() => {});
  };

  const showTopReminder = () => {
    setShowLightReminder(true);
    if (lightTimerRef.current) {
      window.clearTimeout(lightTimerRef.current);
    }
    lightTimerRef.current = window.setTimeout(() => {
      setShowLightReminder(false);
    }, LIGHT_TIP_MS);
  };

  const handleClickLightReminder = async () => {
    setShowLightReminder(false);
    setActiveTab("chat");
    await emit("focus-chat-input").catch(() => {});
  };

  useEffect(() => {
    const syncSchedulerSettings = async () => {
      try {
        const data = await getAllSettings();
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
      } catch (error) {
        console.error("sync scheduler settings failed:", error);
      }
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
      if (lightTimerRef.current) {
        window.clearTimeout(lightTimerRef.current);
      }
      unlistenPromise.then((fn) => fn && fn());
    };
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "chat", label: "对话" },
    { key: "timeline", label: "时间轴" },
    { key: "report", label: "日报" },
    { key: "settings", label: "设置" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#fff", overflow: "hidden" }}>
      <div
        data-tauri-drag-region
        onMouseDown={handleDrag}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid #f0f0f0",
          cursor: "move",
          userSelect: "none",
        }}
      >
        <span data-tauri-drag-region style={{ fontSize: "14px", fontWeight: 600, color: "#333" }}>DailySnap</span>
        <button
          onClick={handleClose}
          onMouseDownCapture={(e) => {
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          style={{
            width: "24px",
            height: "24px",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: "16px",
            color: "#999",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "4px",
          }}
          title="最小化到悬浮球"
        >
          ✕
        </button>
      </div>

      {showLightReminder && (
        <button
          onClick={handleClickLightReminder}
          style={{
            border: "none",
            borderBottom: "1px solid #eee8ff",
            background: "#f6f3ff",
            color: "#534AB7",
            fontSize: "12px",
            padding: "7px 12px",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          到点啦，记一句当前进展（点击跳转到输入框）
        </button>
      )}

      <div style={{ display: "flex", borderBottom: "1px solid #f0f0f0" }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: "10px 0",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: "13px",
              color: activeTab === tab.key ? "#534AB7" : "#999",
              fontWeight: activeTab === tab.key ? 600 : 400,
              borderBottom: activeTab === tab.key ? "2px solid #534AB7" : "2px solid transparent",
              transition: "all 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "chat" && <ChatPanel />}
        {activeTab === "timeline" && <TimelinePanel />}
        {activeTab === "report" && <ReportPanel />}
        {activeTab === "settings" && <SettingsPanel />}
      </div>
    </div>
  );
}
