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
  if (hour >= 6 && hour < 11) return "早上好，先记一句你现在在做什么？";
  if (hour >= 11 && hour < 14) return "中午好，现在的主要进展是什么？";
  if (hour >= 14 && hour < 18) return "下午好，当前最重要的任务是什么？";
  if (hour >= 18 && hour < 23) return "晚上好，今天还有哪些收尾工作？";
  return "夜深了，简单记录一下当前事项吧。";
}

const FALLBACK_PROMPTS = [
  "快捷记录：写一句当前进展。",
  "快速补记：你现在在做什么？",
  "临时记录：先记关键词，稍后再补充。",
  "点我速记：当前任务的一句话版本。",
  "轻量记录：先写一句，不打断节奏。",
];

export function pickFallbackPrompt(randomValue = Math.random()): string {
  const normalized = Number.isFinite(randomValue) ? Math.abs(randomValue) : 0;
  const idx = Math.floor((normalized % 1) * FALLBACK_PROMPTS.length);
  return FALLBACK_PROMPTS[idx];
}

export function isFinalReply(reply: string): boolean {
  return reply.includes("已记录") || reply.includes("记下了");
}
