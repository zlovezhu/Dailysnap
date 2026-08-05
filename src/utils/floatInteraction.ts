export interface Point {
  x: number;
  y: number;
}

export interface DialogueItem {
  content: string;
  createdAt: string;
}

export function shouldStartDrag(start: Point, current: Point, threshold = 6): boolean {
  const dx = Math.abs(current.x - start.x);
  const dy = Math.abs(current.y - start.y);
  return dx >= threshold || dy >= threshold;
}

export function canOpenOnDoubleClick(hasDragged: boolean): boolean {
  return !hasDragged;
}

export function getDisplayDialogues(items: DialogueItem[], limit = 5): {
  hasMore: boolean;
  displayItems: DialogueItem[];
} {
  const safeItems = [...items]
    .filter((item) => item.content.trim().length > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const hasMore = safeItems.length > limit;
  const displayItems = safeItems.slice(-limit);
  return { hasMore, displayItems };
}

export function truncateForHint(text: string, maxLength = 24): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export function formatHHmm(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "--:--";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function getDynamicPromptByHour(hour: number): string {
  if (hour >= 6 && hour < 11) return "喵~ 早上好，今天打算做什么呀？";
  if (hour >= 11 && hour < 14) return "中午了，刚做完的事跟我说一句？";
  if (hour >= 14 && hour < 18) return "下午好~ 现在的进展到哪一步了？";
  if (hour >= 18 && hour < 23) return "晚上好~ 今天还剩什么要收尾的？";
  return "夜深了，简单写一句吧，明早看到会谢谢你。";
}

const FALLBACK_PROMPTS = [
  "喵~ 写一句你刚做完的事吧",
  "在忙什么呀？跟我说说~",
  "记一条今天的小进展？",
  "写下来就放心了~",
  "想偷懒也告诉我一声喵",
];

export function pickFallbackPrompt(randomValue = Math.random()): string {
  const normalized = Number.isFinite(randomValue) ? Math.abs(randomValue) : 0;
  const idx = Math.floor((normalized % 1) * FALLBACK_PROMPTS.length);
  return FALLBACK_PROMPTS[idx];
}

export function isFinalReply(reply: string): boolean {
  return reply.includes("已记录") || reply.includes("记下了");
}
