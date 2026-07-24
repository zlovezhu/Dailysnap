import { create } from "zustand";

interface SettingsStore {
  reminderStartTime: string;
  reportGenerateTime: string;
  reminderIntervalMinutes: number;
  holidayDisable: boolean;
  apiKey: string;
  apiBaseUrl: string;
  modelName: string;
  updateSetting: (key: string, value: string | number | boolean) => void;
  setAllSettings: (settings: Partial<SettingsStore>) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  reminderStartTime: "09:30",
  reportGenerateTime: "18:00",
  reminderIntervalMinutes: 120,
  holidayDisable: true,
  apiKey: "",
  apiBaseUrl: "https://api.openai.com/v1",
  modelName: "gpt-4o-mini",
  updateSetting: (key, value) => set({ [key]: value }),
  setAllSettings: (settings) => set(settings),
}));
