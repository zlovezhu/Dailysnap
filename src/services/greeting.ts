/**
 * 上下文感知的问候语生成器。
 *
 * 设计原则：**纯函数、确定性、无随机**。
 * 桌面端（FloatBall）和主窗口（ChatPanel）都调用同一个函数，
 * 只要输入一致（同一条最近 record + 同一时段），输出就必然一致，
 * 从而保证两端的问候语完全同步。
 */
import type { RecordRow } from "./db";
import { dayKey } from "./date";

export interface GreetingResult {
  /** 问候语 */
  text: string;
  /** 上下文感知的快捷回复（3-4 个） */
  quickReplies: string[];
}

/** 截断内容，避免把整段记录塞进问候语（用于昨天的短引用） */
function truncate(text: string, max = 10): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

/** 按时间段给出问候语（无 record 或今天的记录用） */
function timeGreeting(hour: number): string {
  if (hour < 6) return "还没睡？";
  if (hour < 11) return "早呀，今天做点什么？";
  if (hour < 14) return "午休啦？";
  if (hour < 18) return "下午好，忙到哪了？";
  if (hour < 22) return "晚上好，今天咋样？";
  return "夜深了，还在忙？";
}

/** 判断某条 record 是否属于今天（凌晨4点边界） */
function isToday(dateStr: string, now: Date): boolean {
  return dateStr === dayKey(now);
}

/**
 * 生成问候语 + 快捷回复。
 *
 * @param recentRecord 最近一条工作记录（可能为 null）
 * @param now 当前时间（默认 new Date()，测试可注入）
 */
export function generateGreeting(
  recentRecord: RecordRow | null,
  now: Date = new Date()
): GreetingResult {
  const hour = now.getHours();

  // 无任何记录：按时间段问候 + 通用快捷回复
  if (!recentRecord || !recentRecord.content) {
    return {
      text: timeGreeting(hour),
      quickReplies: ["开始工作", "开会中", "在写文档", "休息一下"],
    };
  }

  const today = isToday(recentRecord.date, now);

  // 今天的记录：不引用 content（避免「在忙 X」的模板感 + 把 placeholder 暴露给用户）。
  // 用时间段问候 + 承接式快捷回复。
  if (today) {
    return {
      text: timeGreeting(hour),
      quickReplies: ["还在做刚才的", "换别的了", "开会中", "休息一下"],
    };
  }

  // 昨天/更早的记录：短引用（10 字内），帮用户想起上次在做什么
  const content = truncate(recentRecord.content);
  return {
    text: `喵~ 上次的「${content}」，今天继续吗？`,
    quickReplies: ["继续做", "换新的了", "开会中", "休息一下"],
  };
}
