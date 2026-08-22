import type { CatMood } from "../components/Cat";

export interface ChatMessage {
  id: number;
  role: "cat" | "user";
  text: string;
  time: string;
}

export interface RecordItem {
  id: number;
  time: string;
  text: string;
}

export interface EngineResult {
  replies: string[];
  mood?: CatMood;
  /** 临时覆盖播放的动画（如 a-ha 瞬间） */
  tempVideo?: string;
  addRecord?: string;
  loveDelta?: number;
  moodDelta?: number;
  generateReport?: boolean;
  quickReplies?: string[];
}

export interface EngineCtx {
  step: number; // onboarding 进度：0 问职业 1 问项目 2 自由聊
  job?: string;
  project?: string;
  records: RecordItem[];
  followupCount: number;
}

export const OPENING_QUICK_REPLIES = ["写代码的", "做设计的", "搞产品的", "自由职业"];
export const PROJECT_QUICK_REPLIES = ["在写 DailySnap", "公司的新项目", "在忙毕设", "随便逛逛"];
export const IDLE_QUICK_REPLIES = ["刚开完项目周会", "写完一个功能，提 PR 了", "生成日报", "我上周做了什么"];

/** 官网落地页演示用的多轮预设对话。每轮一组，5.5s 自动切换到下一轮循环展示 */
export const PRESET_ROUNDS: ChatMessage[][] = [
  // 轮 0：半完成信息 + 猫追问职业
  [
    { id: -1, role: "user", text: "在写 DailySnap 的官网", time: "00:56" },
    { id: -2, role: "cat", text: "听起来不错~ 你的本职是？", time: "00:56" },
  ],
  // 轮 1：追问项目细节
  [
    { id: -3, role: "cat", text: "嗯，那今天进展到哪一步了？", time: "01:00" },
  ],
  // 轮 2：完成记录
  [
    { id: -4, role: "cat", text: "好的，记下来啦~ 哼，今天也挺能干的嘛~", time: "01:02" },
  ],
  // 轮 3：鼓励滑动看演示
  [
    { id: -5, role: "cat", text: "滑动看完整功能演示吧！", time: "01:03" },
  ],
];

/** 每轮对应的快捷回复（最后一两轮不放） */
export const ROUND_QUICK_REPLIES: string[][] = [
  ["写代码的", "做设计", "搞产品", "自由职业"],
  ["在写新模块", "在改 bug"],
  [],
  [],
];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const recordReplies = [
  "好的，记下来啦~",
  "已存进 today.md。哼，又干活了吧，记得喝水哦~",
  "收到收到。你忙你的，我帮你攒着，晚上给你写成日报~",
  "这条不错，记好了。继续吧，我盯着呢~",
];

const chatReplies = [
  "嗯~ 我听着呢",
  "我在呀。屏幕角落蹲着，挺好的~",
  "你说话的时候，我尾巴会翘起来——就一下，别多想。",
  "今天记了几条了，不错。继续保持，别让我饿肚子哦~",
];

const comfortReplies = [
  "累就歇会儿嘛。我只是一只猫，懂什么时间管理，但你喝水我总懂吧~",
  "过来，让我趴你键盘上待一会儿。……开玩笑的，你键盘太烫了。",
  "歇十分钟不丢人。你的记录我都收着呢，一条没丢~",
];

const shyReplies = [
  "哼，少说这些。……不过你能来，我还挺高兴的~",
  "才、才没有很开心呢。好感度只是刚好涨了一点而已。",
];

const followupReplies = [
  "嗯~ 还想再多了解一点，能说得更具体些吗？",
  "再具体一点嘛——做了什么？进展到哪了？有没有卡住的地方？",
];

export function respond(raw: string, ctx: EngineCtx): EngineResult {
  const input = raw.trim();

  // ── Onboarding ──
  if (ctx.step === 0) {
    return {
      replies: [
        `哦，${input.replace(/的$/, "")}啊。记住了，写进 profile.md 了~`,
        "那你最近在忙什么项目？",
      ],
      mood: "happy",
      loveDelta: 5,
      moodDelta: 8,
      quickReplies: PROJECT_QUICK_REPLIES,
    };
  }
  if (ctx.step === 1) {
    return {
      replies: [
        input.includes("DailySnap")
          ? "喵？在写我？！……咳，我是说，还挺有眼光的~"
          : `「${input}」，行，我记下了~`,
        "以后干活的时候随手丢一句给我就行——我帮你攒成日报。试试看？",
      ],
      mood: input.includes("DailySnap") ? "satisfied" : "happy",
      loveDelta: 6,
      moodDelta: 8,
      quickReplies: IDLE_QUICK_REPLIES,
    };
  }

  // ── 意图识别（模拟 function calling）──
  if (/日报|周报|report|总结今天/i.test(input)) {
    return {
      replies: ["好嘞，我翻翻今天的记录……"],
      mood: "curious",
      generateReport: true,
      quickReplies: IDLE_QUICK_REPLIES,
    };
  }

  if (/上周|昨天|之前|前些天|做过什么|干了什么|还记得/i.test(input)) {
    return {
      replies: [
        "我翻翻记忆……（search_memory）",
        "上周你挺忙的：周一定了 Q3 OKR，周三把记忆系统重构成了 Markdown 三层，周五修好了桌面气泡的淡出动画。要我展开哪天的日报吗？",
      ],
      mood: "curious",
      tempVideo: "/cats/curious-a-ha.webm",
      loveDelta: 2,
      quickReplies: IDLE_QUICK_REPLIES,
    };
  }

  if (/累|烦|崩|不想干|摸鱼|好困/i.test(input)) {
    return { replies: [pick(comfortReplies)], mood: "calm", loveDelta: 3, moodDelta: 3 };
  }

  if (/谢谢|感谢|爱你|可爱|好乖|摸摸/i.test(input)) {
    return { replies: [pick(shyReplies)], mood: "satisfied", loveDelta: 4, moodDelta: 6 };
  }

  if (/你好|hi|hello|在吗|在不在/i.test(input)) {
    return {
      replies: ["喵~ 你回来啦！根据你最近的记录和现在这个点儿……我猜，你又打算开始干活了？"],
      mood: "happy",
      loveDelta: 1,
    };
  }

  // 疑问句 → 闲聊
  if (/[?？]$/.test(input)) {
    return { replies: [pick(chatReplies)], mood: "calm", loveDelta: 1 };
  }

  // 太短太模糊 → 追问（最多 2 轮）
  if (input.length < 6 || /^(忙完了|刚忙完|在忙|干活了|弄完了)$/.test(input)) {
    if (ctx.followupCount < 2) {
      return {
        replies: [followupReplies[ctx.followupCount]],
        mood: "curious",
        tempVideo: "/cats/curious-a-ha.webm",
        loveDelta: 1,
      };
    }
    return {
      replies: ["好吧好吧，不逼你了。等你想说的时候再告诉我~"],
      mood: "calm",
    };
  }

  // 默认：存为记录
  return {
    replies: [pick(recordReplies)],
    mood: "happy",
    addRecord: input,
    loveDelta: 5,
    moodDelta: 10,
  };
}

export function makeMessage(id: number, role: "cat" | "user", text: string): ChatMessage {
  const d = new Date();
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { id, role, text, time };
}

export function buildDailyReport(records: RecordItem[], job?: string, project?: string): string {
  const items = records.length
    ? records
    : [
        { id: -1, time: "09:40", text: "开项目周会，敲定 Q3 OKR" },
        { id: -2, time: "11:20", text: "重构记忆系统为 Markdown 三层结构" },
      ];
  const lines = items.map((r) => `- ${r.time}  ${r.text}`).join("\n");
  return `# 今日工作日报

**日期**：${new Date().toLocaleDateString("zh-CN")}　**记录条数**：${items.length}

## 今日进展
${lines}

## 小结
今天围绕${project ? `「${project}」` : "手头项目"}推进了 ${items.length} 件事，节奏不错。
${job ? `作为${job}，` : ""}建议明天先把最棘手的那件排在上午——趁猫还没困。

—— 由 DailySnap 小猫整理 ✦`;
}
