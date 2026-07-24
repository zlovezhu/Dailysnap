import { create } from "zustand";

interface RecordItem {
  content: string;
  createdAt: string;
}

interface RecordStore {
  todayRecords: RecordItem[];
  addRecord: (record: RecordItem) => void;
  setRecords: (records: RecordItem[]) => void;
  clearRecords: () => void;
}

export const useRecordStore = create<RecordStore>((set) => ({
  todayRecords: [],
  addRecord: (record) =>
    set((state) => ({
      todayRecords: [...state.todayRecords, record],
    })),
  setRecords: (records) => set({ todayRecords: records }),
  clearRecords: () => set({ todayRecords: [] }),
}));
