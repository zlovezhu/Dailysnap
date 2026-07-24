import { listen } from "@tauri-apps/api/event";

/**
 * Listen for reminder triggers from the Rust scheduler
 */
export function onReminderTrigger(callback: () => void): Promise<() => void> {
  return listen("reminder-trigger", () => {
    callback();
  }).then((unlisten) => unlisten);
}

/**
 * Listen for new record saved events
 */
export function onNewRecordSaved(callback: (content: string) => void): Promise<() => void> {
  return listen<string>("new-record-saved", (event) => {
    callback(event.payload);
  }).then((unlisten) => unlisten);
}

/**
 * Listen for auto-generate report event
 */
export function onAutoGenerateReport(callback: () => void): Promise<() => void> {
  return listen("auto-generate-report", () => {
    callback();
  }).then((unlisten) => unlisten);
}
