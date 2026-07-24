import { describe, expect, it } from "vitest";
import {
  canOpenOnDoubleClick,
  formatHHmm,
  getDisplayDialogues,
  getDynamicPromptByHour,
  isFinalReply,
  pickFallbackPrompt,
  shouldStartDrag,
  truncateForHint,
} from "./floatInteraction";

describe("float interaction helpers", () => {
  it("鼠标移动超过阈值时应触发拖拽", () => {
    expect(
      shouldStartDrag({ x: 100, y: 100 }, { x: 108, y: 101 }, 6)
    ).toBe(true);
  });

  it("鼠标移动未超过阈值时不应触发拖拽", () => {
    expect(
      shouldStartDrag({ x: 100, y: 100 }, { x: 103, y: 104 }, 6)
    ).toBe(false);
  });

  it("发生拖拽后应阻止双击打开", () => {
    expect(canOpenOnDoubleClick(true)).toBe(false);
    expect(canOpenOnDoubleClick(false)).toBe(true);
  });

  it("应只显示最近5条并返回是否有更早记录", () => {
    const items = Array.from({ length: 7 }).map((_, i) => ({
      content: `记录${i + 1}`,
      createdAt: `2026-06-11T10:0${i}:00`,
    }));

    const { hasMore, displayItems } = getDisplayDialogues(items, 5);
    expect(hasMore).toBe(true);
    expect(displayItems.length).toBe(5);
    expect(displayItems[0].content).toBe("记录3");
    expect(displayItems[4].content).toBe("记录7");
  });

  it("超长文本应按 24 字截断并添加省略号", () => {
    expect(truncateForHint("这是一个很长很长的文本用于测试截断逻辑", 8)).toBe("这是一个很长很长...");
  });

  it("应输出 HH:mm 时间格式", () => {
    expect(formatHHmm("2026-06-12T09:05:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
    expect(formatHHmm("invalid")).toBe("--:--");
  });

  it("兜底提示应可按随机值稳定选中", () => {
    expect(pickFallbackPrompt(0)).toBe("快捷记录：写一句当前进展。");
    expect(pickFallbackPrompt(0.9999)).toBe("轻量记录：先写一句，不打断节奏。");
  });

  it("动态文案应按时间段变化", () => {
    expect(getDynamicPromptByHour(9)).toContain("早上好");
    expect(getDynamicPromptByHour(12)).toContain("中午好");
    expect(getDynamicPromptByHour(16)).toContain("下午好");
    expect(getDynamicPromptByHour(20)).toContain("晚上好");
  });

  it("应正确判断回复是否已收束", () => {
    expect(isFinalReply("好的，已记录！")).toBe(true);
    expect(isFinalReply("我再追问一个细节：会议产出是什么？")).toBe(false);
  });
});
