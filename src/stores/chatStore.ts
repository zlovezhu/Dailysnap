import { create } from "zustand";

interface ChatMessage {
  role: "ai" | "user";
  content: string;
}

interface ChatStore {
  messages: ChatMessage[];
  isLoading: boolean;
  addMessage: (msg: ChatMessage) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [{ role: "ai", content: "嗨~ 现在在忙什么呀？" }],
  isLoading: false,
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  setLoading: (loading) => set({ isLoading: loading }),
  reset: () =>
    set({
      messages: [{ role: "ai", content: "嗨~ 现在在忙什么呀？" }],
      isLoading: false,
    }),
}));
