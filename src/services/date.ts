/**
 * 统一的"日期边界"工具。
 *
 * 采用凌晨 4 点边界：00:00–03:59 算「前一天」，04:00 之后才算「新的一天」。
 * 这样熬夜到凌晨 1-2 点还在工作的人，记录和对话仍属于「今天」。
 * 与日报生成时间（凌晨 4 点）保持一致。
 */

/** 计算某个时间点所属的"日期字符串"（凌晨4点边界） */
export function dayKey(now: Date = new Date()): string {
  // 减 4 小时后再取日期：00:00-03:59 会落到前一天
  const d = new Date(now.getTime() - 4 * 3600 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 今天的日期字符串（凌晨4点边界） */
export function getTodayKey(): string {
  return dayKey();
}

/** 今天往前推 days 天的日期字符串（凌晨4点边界，days=1 是昨天） */
export function offsetDayKey(days: number): string {
  const todayStr = getTodayKey();
  // 用中午 12 点作为基准，避免时区/夏令时导致 setDate 偏移错误
  const d = new Date(todayStr + "T12:00:00");
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 判断某个日期字符串（"YYYY-MM-DD"）是否等于今天（凌晨4点边界） */
export function isTodayKey(dateStr: string): boolean {
  return dateStr === getTodayKey();
}
