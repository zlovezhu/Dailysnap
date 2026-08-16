/**
 * 日报补生成。
 *
 * 程序启动时静默调用：遍历最近 N 天（不含今天），对「有记录但没生成日报」的天
 * 自动补生成，跳过空白天（没记录 / 没开程序 / 猫提示了但用户没回复，这些都算空白）。
 *
 * 这样即使凌晨关机、或几天没开程序，第二天打开也能补上漏掉的日报。
 */
import { getRecordsByDate, getDailyReport, saveDailyReport } from "./db";
import { generateReport } from "./ai";
import { offsetDayKey } from "./date";

/**
 * 静默补生成漏掉的日报。
 * @param days 往前检查多少天（不含今天），默认 7 天
 * @returns 补生成的天数
 */
export async function backfillMissingReports(days = 7): Promise<number> {
  let generated = 0;
  for (let i = 1; i <= days; i++) {
    const date = offsetDayKey(i);
    try {
      // 已生成 → 跳过
      const existing = await getDailyReport(date);
      if (existing) continue;

      // 空白天（没有记录）→ 跳过，不生成空日报
      const records = await getRecordsByDate(date);
      if (records.length === 0) continue;

      const content = await generateReport(records, date);
      const ids = records.map((r) => r.id).filter((id): id is number => id != null);
      await saveDailyReport(date, content, ids);
      generated++;
      console.log(`[backfill] 补生成 ${date} 日报（${records.length} 条记录）`);
    } catch (err) {
      console.error(`[backfill] 补生成 ${date} 失败:`, err);
    }
  }
  return generated;
}
