# DailySnap

一只陪你上班的小黑猫。记一条，她就开心一点；不记，她会想你。

DailySnap 把"工作记录"做成桌宠养成——你随手记一句话，AI 帮你整理成时间线、日报、周报，猫也跟着成长。记忆是透明的 Markdown 文件，你能看到猫记住了你什么。

> 当前版本：P0 完成 · 桌宠形态 + 三层记忆系统 + 意图识别 + Onboarding

## 核心特性

### 桌宠养成
- 屏幕角落常驻一只小黑猫（暖白橘耳黑眼，温馨傲娇性格）
- 6 种状态表情：calm / happy / curious / sleepy / sad / satisfied
- 心情值、好感度、亲密度三维养成
- 记一条猫就开心，2 小时没记猫打哈欠，日报生成后猫满足

### 猫脑（三层记忆系统）
所有记忆都是 Markdown 文件，存在 `~/.dailysnap/memory/`，可以同步到 iCloud / Dropbox：

| 文件 | 用途 | 类比 |
|------|------|------|
| `profile.md` | 你的偏好（职业、项目、提醒频率、猫的性格） | 永远在视野里的"核心记忆" |
| `today.md` | 今日原始记录 | 工作记忆 |
| `daily-summaries/YYYY-MM-DD.md` | 每日 AI 整理摘要 | 近期回顾 |
| `long-term.md` | AI 从多日记录中提炼的规律 | 长期记忆 |
| `states.json` | 猫的养成状态（mood/love/affinity/streak） | 猫的成长档案 |

### AI Agent（意图识别）
AI 用 function calling 自己判断该做什么，不写死规则：

| 工具 | 触发场景 |
|------|---------|
| `save_record` | 用户分享工作进展 |
| `search_memory` | 用户问过去的事（"我上周做了什么"） |
| `generate_report` | 用户说"生成日报" |
| `chat` | 用户闲聊、倾诉情绪 |

每次 AI 回应前会自动读取 `profile.md` + 最近摘要作为上下文——猫记得你是谁。

### Onboarding（第一次见面）
- 第一次启动时猫主动开口："喵~ 你好呀！我是你的 DailySnap 小猫"
- 自然聊天收集 5 个偏好（职业/项目/提醒频率/打扰方式/猫性格）
- 回答写入 `profile.md`，不是问卷是聊天

### 导航（方案 B）
- 顶部 4 个 tab：**对话 / 时间轴 / 报告 / 统计**
- "报告" 内部子 tab 切换：日报 / 周报
- 设置入标题栏齿轮，弹出菜单（提醒设置 / AI 设置 / 主题切换）
- 键盘快捷键 1-5 切 tab

### 悬浮球（2 状态精简）
- `compact`：屏幕角落一只猫（默认）
- `expanded`：480×340 输入面板（标题 + quick replies 2×2 + 输入框 + 发送 + 猫栏）
- 单击猫展开，3 分钟无操作自动收起
- 定时提醒触发时直接展开（不再有气泡中间态）
- 双击猫打开主窗口

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite + TailwindCSS 4 |
| 动效 | Framer Motion |
| 图表 | Recharts |
| Markdown 渲染 | react-markdown |
| 后端 | Rust（reqwest + tokio + serde） |
| 数据库 | SQLite（tauri-plugin-sql） |
| 文件系统 | tauri-plugin-fs + tauri-plugin-dialog |
| 设计参考 | [impeccable](https://impeccable.style) skill（避免泛 AI 审美） |

## 项目结构

```
Dailysnap/
├── src/                          # 前端
│   ├── components/
│   │   ├── MainWindow.tsx        # 主窗口（4 tab + 设置齿轮 + 猫头像）
│   │   ├── ChatPanel.tsx         # 对话面板（onboarding + agent_turn）
│   │   ├── TimelinePanel.tsx     # 时间轴（spine + dot 风格）
│   │   ├── ReportPanel.tsx       # 日报
│   │   ├── WeeklyPanel.tsx       # 周报
│   │   ├── StatsPanel.tsx        # 统计（饼图 + 柱状图 + 热力图）
│   │   ├── FloatBall.tsx         # 悬浮球（compact / expanded 2 状态）
│   │   └── Cat.tsx               # 猫 SVG 组件（6 状态 + framer-motion 动画）
│   ├── services/
│   │   ├── ai.ts                 # AI 调用封装
│   │   └── db.ts                 # SQLite 操作
│   ├── hooks/useTheme.ts         # 亮/暗主题
│   ├── stores/recordStore.ts     # Zustand 状态
│   ├── styles/globals.css        # 设计 token（warm-tinted neutrals）
│   └── utils/floatInteraction.ts # 浮球交互工具
├── src-tauri/                    # Rust 后端
│   └── src/
│       ├── services/
│       │   ├── memory.rs         # 猫脑（三层 Markdown 文件 + CatState）
│       │   ├── ai_client.rs      # AI client（function calling 4 工具）
│       │   ├── scheduler.rs      # 提醒调度
│       │   └── holiday.rs        # 节假日判断
│       └── commands/
│           ├── cat.rs            # agent_turn / get_cat_state / onboarding 等
│           ├── ai.rs             # ai_chat（旧版兼容）
│           ├── records.rs        # save_record / get_records_by_date
│           ├── settings.rs       # get_settings / update_setting
│           ├── reminder.rs       # show_float_ball / set_float_mode
│           └── devtools.rs       # switch_tab（dev-only）
└── ~/.dailysnap/memory/          # 用户记忆目录（自动创建）
    ├── profile.md
    ├── today.md
    ├── daily-summaries/
    ├── long-term.md
    └── states.json
```

## 设计理念

### 反 AI 审美
参考 [impeccable](https://impeccable.style) 设计 skill，避免泛 AI 审美：
- 配色：warm-tinted neutrals（暖米色背景 + 墨色文字），不用紫色 accent
- 字体：system font + label-caps（uppercase + letter-spacing 编辑风小标签）
- 间距：模块化节奏（4 的倍数），section 之间 28px 大间距
- 按钮：方形圆角 6px（不是 12px 大圆角），文字按钮不用 emoji
- 时间线：spine + dot 风格（左竖线 + 彩色圆点），不堆卡片

### 猫的人格
温馨 + 傲娇 + 贱兮兮：
- 说话简短（30-80 字），用第一人称"我"
- 不叫用户"主人"或"您"，直接"你"
- 看到用户做事会开心（但不会直接说"我好感动"，而是"哼，又干活了吧，记得喝水"）
- 偶尔自嘲（"我只是一只猫，懂什么时间管理"）

## 快速开始

### 环境要求
- Node.js 18+
- pnpm
- Rust（rustup）
- macOS（主要目标平台）

### 安装运行
```bash
cd Dailysnap
pnpm install
pnpm tauri dev
```

### 配置 AI
1. 启动后第一次进入会触发 onboarding（猫主动聊天）
2. 标题栏点齿轮 → AI 设置 → 填 API Key
3. 推荐用 gpt-4o-mini 或国产兼容 OpenAI 协议的模型

## 路线图

### P0（已完成）
- ✅ 猫脑（三层 Markdown 文件记忆系统）
- ✅ 意图识别（function calling 4 工具）
- ✅ Onboarding 流程（猫主动聊天认识你）
- ✅ 养成机制（好感度 + 亲密度 + 心情值）
- ✅ 猫 SVG（6 状态 + framer-motion 动画）
- ✅ 导航方案 B（4 tab + 报告子导航）
- ✅ 悬浮球精简（2 状态）

### P1（计划中）
- 📝 语音记录（按住悬浮球说话 → Whisper 转文字 → 存记录）
- 📝 猫素材升级（PNG 替换 SVG，更可爱）

### P2（计划中）
- 📝 图片识别（截图发猫 → GPT-4o Vision）
- 📝 长期记忆向量检索（参考 Mem0）

### P3（远期）
- 📝 手机端（React Native + iCloud 同步）
- 📝 Live2D 高保真猫

## 参考

- [Letta (MemGPT)](https://github.com/letta-ai/letta) — 三层记忆架构理念
- [Mem0](https://github.com/mem0ai/mem0) — 自动提取记忆 + 向量检索
- [tiny-roommate](https://github.com/nblintao/tiny-roommate) — 纯 Markdown 文件记忆方案
- [desktop-pet (toller892)](https://github.com/toller892/desktop-pet) — Tauri + React 橘猫 SVG 动画
- [impeccable](https://impeccable.style) — 高品质前端设计工具集

## License

MIT
