# DailySnap 项目交接文档

> 本文档用于把 DailySnap 项目交接给新开发者（Codex）继续开发。
> 最后更新：2026-08-22

---

## 1. 项目概览

**DailySnap** 是一只陪你上班的桌面小猫（AI 桌宠 × 工作记录）。

- **产品定位**：上班搭子。忙一天想不起自己做了什么、写日报太累——养只小猫当搭子，你负责上班，它负责把这一天记好。
- **核心能力**：
  - AI 记录：随手丢给它一句话，帮你整理成时间线、日报、周报
  - 桌宠养成：6 种心情动画 × 养成值（心情/好感/亲密度），陪伴感
  - 透明记忆：所有记忆是 Markdown 文件，存在本机，不上传云端
  - 意图识别：function calling 自调度工具（save_record / followup / search_memory / generate_report / chat）

**当前版本**：`0.1.1`（桌面端）、官网 `v7u`

---

## 2. 代码仓库

### 本机路径

| 项目 | 路径 | 说明 |
|------|------|------|
| **主仓库（含桌面端 + 官网 + 部署）** | `/Users/zhujiating/WorkBuddy/2026-07-24-11-24-24/Dailysnap/` | 唯一的正式代码位置 |
| 桌面应用前端 | `Dailysnap/src/` | React 18 + TS |
| 桌面应用后端 | `Dailysnap/src-tauri/` | Rust |
| 官网 | `Dailysnap/website/` | React 19 + Vite（**2026-08-22 刚从 /tmp 迁回正式位置**） |
| 服务器部署配置 | `Dailysnap/deploy/` | nginx + relay Docker |
| 文档 | `Dailysnap/docs/` | 含 images/、交接文档 |

### GitHub

- **仓库地址**：`https://github.com/zlovezhu/Dailysnap`
- **主分支**：`main`
- **远程**：`origin = https://github.com/zlovezhu/Dailysnap.git`

> ⚠️ 重要：远程 main 曾做过 force update（历史被重写过）。拉取时如果遇到冲突，先 `git fetch` 再 `git pull --rebase`，冲突以远程为准即可（本地大多是与远程重复的提交）。

---

## 3. 两个子项目（结构说明）

### 3.1 桌面应用（Dailysnap 根目录）

Tauri 2 桌面应用，前端 + Rust 后端。

```
Dailysnap/
├── src/                          # 前端（React 18 + TS + Tailwind 4）
│   ├── components/               # MainWindow / ChatPanel / TimelinePanel / Cat 等
│   ├── services/                 # ai / db / date / greeting / reportBackfill
│   ├── hooks/                    # useTheme / useCatAnim
│   ├── stores/                   # Zustand 状态
│   └── utils/
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs / lib.rs      # 入口 + SQLite migration
│   │   ├── services/             # memory / ai_client / scheduler / holiday
│   │   ├── commands/             # cat / ai / records / settings / reminder
│   │   └── macos_window.rs       # macOS 无边框窗口处理
│   ├── icons/                    # 应用图标（多尺寸 png + .ico + .icns）
│   └── tauri.conf.json           # Tauri 配置
├── index.html                    # 主窗口
├── float.html                    # 悬浮球
├── mini.html                     # mini 聊天窗
└── package.json
```

**技术栈**：
- 前端：React 18 + TypeScript + Vite 6 + TailwindCSS 4 + Zustand + Framer Motion
- 后端：Rust（tauri 2 + serde + reqwest + tokio + tauri-plugin-sql/sqlite）
- 桌面框架：Tauri 2

**开发命令**：
```bash
cd Dailysnap
pnpm install          # 装依赖
pnpm tauri dev        # 开发模式（启动桌面应用）
pnpm tauri build      # 构建安装包
```

### 3.2 官网（Dailysnap/website/）

独立的 React 官网（落地页），用于宣传 + 下载分发。

```
website/
├── src/
│   ├── sections/               # Hero / Features / Companion / Demo / Download / Contact / Footer / Nav
│   ├── components/             # Cat
│   ├── demo/                   # ChatPanel / ReportPanel / StatsPanel / TimelinePanel / engine
│   └── main.tsx / App.tsx
├── public/                     # 静态资源（cat 动画 webp/png、icon）
│   ├── cat/                    # 猫动画素材（calm-idle.webp 等 12 个 webp + 静态 png）
│   └── icon/                   # 应用图标（app-icon.png / icon-64.png）
├── index.html
└── package.json
```

**技术栈**：React 19 + TypeScript + Vite 7 + TailwindCSS 3 + Framer Motion + lucide-react

**开发命令**：
```bash
cd Dailysnap/website
npm install
npm run dev           # 开发预览
npm run build         # 构建到 dist/
```

---

## 4. AI 配置

### DeepSeek（桌面应用 + relay 都用）

| 项 | 值 |
|----|-----|
| Base URL | `https://api.deepseek.com`（**注意：无 /v1 或 /v4 路径**） |
| 模型 | `deepseek-v4-flash`（旧的 `deepseek-chat` 已于 2026/07/24 弃用） |
| 协议 | OpenAI 兼容 |

> ⚠️ 关键坑：base_url 就是 `https://api.deepseek.com`，不要加 `/v1`。

### relay 中转服务（服务器端）

桌面应用通过 relay 中转调用 DeepSeek（避免 API key 暴露给客户端）。

配置在 `deploy/relay/.env`（服务器上，不 commit）：
```
RELAY_TOKEN=<客户端鉴权 token>
DEEPSEEK_API_KEY=<DeepSeek key>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

---

## 5. 网站部署信息

### 5.1 服务器

| 项 | 值 |
|----|-----|
| 云厂商 | 腾讯云轻量应用服务器（Lighthouse） |
| 实例 | `lhins-l2unhwi30`（Ubuntu 24.04.4 LTS） |
| IP | `124.220.21.190` |
| SSH | `ssh ubuntu@124.220.21.190` |
| SSH 密码 | `}7PT5c;/ZG8s.X@` |
| sudo | 免密（ubuntu 用户） |

### 5.2 域名

| 项 | 值 |
|----|-----|
| 域名 | `dailysnap.online` |
| 注册商 | DNSPod（腾讯旗下） |
| DNS | A 记录 → `124.220.21.190` |
| 注册时间 | 2026-08-17 |

> ⚠️ Safari 反钓鱼警告：域名注册 <90 天，Safari 会弹"不安全"警告，Chrome/Edge 正常。注册满 90 天（约 2026-11-15）自动解除。

### 5.3 HTTPS 证书

- **Let's Encrypt 免费证书**，`certbot` 管理
- 证书路径（宿主机）：`/etc/letsencrypt/live/dailysnap.online/`
- 自动续期：certbot 已设置 systemd timer，无需手动
- 有效期：到 2026-11-15

### 5.4 部署架构

```
腾讯云服务器 124.220.21.190
├── Docker
│   ├── dailysnap-nginx        # nginx（80 + 443）
│   │   ├── 挂载 /opt/dailysnap/nginx/html → /usr/share/nginx/html（官网 + downloads）
│   │   ├── 挂载 /etc/letsencrypt → 证书
│   │   └── conf: /opt/dailysnap/nginx/conf.d/default.conf
│   └── dailysnap-relay        # FastAPI 中转服务（8000 端口，内网）
│       └── env: /opt/dailysnap/relay/.env
└── 目录结构
    /opt/dailysnap/
    ├── docker-compose.yml
    ├── nginx/conf.d/default.conf
    ├── nginx/html/            # 官网静态文件（index.html + assets + cats + icon）
    │   └── downloads/         # 安装包下载目录
    └── relay/                 # 中转服务源码
```

**nginx 端口**：
- 80：HTTP → 重定向到 HTTPS（除 .well-known/acme-challenge）
- 443：HTTPS 主服务（官网 + downloads + /v1/ 反代 relay）

---

## 6. 官网部署流程（发布新版本）

官网是**静态站**（React build 产物），部署 = 把 dist 传到服务器 nginx html 目录。

### 标准流程

```bash
# 1. 本地构建
cd Dailysnap/website
npm run build

# 2. 打包 dist
tar czf /tmp/kimi_dist.tar.gz -C dist .

# 3. scp 上传（分步，避免 expect 缓冲 OOM）
scp /tmp/kimi_dist.tar.gz ubuntu@124.220.21.190:/tmp/

# 4. ssh 解压部署
ssh ubuntu@124.220.21.190 "cd /opt/dailysnap/nginx/html && tar xzf /tmp/kimi_dist.tar.gz && rm -f /tmp/kimi_dist.tar.gz"
```

### 部署踩过的坑（重要）

1. **expect 缓冲 OOM**：scp + ssh 不要合并成一条命令（会 exit 137），必须分步执行。
2. **tar 打包路径**：`tar czf -C dist .` 要确保解压后文件直接在 html 根目录，不带 dist/ 前缀。
3. **macOS xattr**：tar 会带 `LIBARCHIVE.xattr` 警告，无害，忽略。
4. **nginx 配置改动需要重建镜像**：`default.conf` 是 COPY 进镜像的，改完要 `docker compose up -d --build nginx`。

---

## 7. Windows 安装包发布流程

Windows 安装包通过 **GitHub Actions** 构建（本地 macOS 无法直接构建 Windows）。

### 7.1 CI 配置

- Workflow：`.github/workflows/build-windows.yml`
- 触发：push 到 main（忽略 `*.md` / `deploy/**` / `docs/**` / `.workbuddy/**`）+ 手动 `workflow_dispatch`
- 产物：NSIS `.exe` + MSI `.msi`，上传为 artifact

### 7.2 发布步骤

1. 改 `src-tauri/tauri.conf.json` 的 `version`（如 `0.1.2`）
2. git commit + push → 触发 GitHub Actions
3. 构建完成后，在 GitHub Actions 页面下载 artifact（zip）
4. 解压出 `nsis/*.exe` + `msi/*.msi`
5. scp 上传到服务器 `/opt/dailysnap/nginx/html/downloads/`
6. 改 `website/src/sections/Download.tsx` 里的 `WIN_DOWNLOAD` 指向新版本文件名
7. 重新部署官网（见第 6 节）
8. 删掉服务器上旧版本文件

### 7.3 关键坑

1. **WebView2 Runtime**：Windows 端"点击没反应"几乎都是 WebView2 缺失。已在 `tauri.conf.json` 配 `webviewInstallMode: {silent: true, type: "downloadBootstrapper"}`，安装时会自动装。
2. **webviewInstallMode 的 schema**：必须是**对象**形式（`{silent, type}`），不是数字 2 也不是字符串（前两种都会导致构建失败）。
3. **Node 20 deprecated warning**：构建日志里的 Node 20 警告无害，不影响产物。

---

## 8. 应用图标

图标源文件（去黑边版）：`src-tauri/icons/icon.png`（1024×1024 透明底）

- 官网图标：`website/public/icon/`（app-icon.png + icon-64.png + icon-source-1024.png）
- 桌面应用图标：`src-tauri/icons/`（32x32 / 128x128 / 128x128@2x / icon.ico / icon.icns + Square 系列）
- 生成方式：用 Pillow 从 1024 源图缩放生成各尺寸

> 用户对图标"黑边/毛边"极敏感，图标必须透明底、无黑边。

---

## 9. 猫素材（动画）

- 位置：`website/public/cat/`（官网用）+ `Dailysnap/public/cat/`（桌面端用）
- 12 个 webp 动画（calm-idle / wash / hum / curious-* / excited / sleep-* / return-normal）+ 静态 png
- 尺寸 320×320，15fps，quality 60（2026-08-18 压缩过，总 6.6MB）
- 压缩命令：`ffmpeg -vf "fps=15,format=yuva420p" -c:v libwebp_anim -lossless 0 -quality 60 -loop 0`

---

## 10. 当前待办 / 遗留问题

1. **macOS 版本有问题**：官网已改为"敬请期待"，不提供下载。旧 dmg 还在服务器 `/downloads/`（3 个，69MB），可删或等修复复用。
2. **域名 Safari 警告**：注册 <90 天，约 2026-11-15 后自动解除。
3. **Windows 0.1.1 验收**：需在"之前点不开的那台机器"上重装 0.1.1，确认 WebView2 修复生效。
4. **记忆目录**：用户记忆存 `~/.dailysnap/memory/`（profile.md / today.md / daily-summaries / long-term.md / states.json）。

---

## 11. 关键约定（来自 Jade 的偏好）

- 桌宠素材：全身完整、透明底、程序化动画、alpha 纯二值化（阈值 180）、零半透明像素、NEAREST 缩放
- 画布 256×256，脚底锚定，呼吸幅度 ±1.5%
- 背景色去污染
- 用户对毛边/半透明边缘极敏感，宁可硬边不要光晕
- 视觉：简洁，拒绝红色背景和花哨设计
- 文案：反感 AI 味、空泛排比，偏好贴近真实工作流

---

## 12. 速查表

| 想做什么 | 去哪 |
|---------|------|
| 改桌面应用前端 | `Dailysnap/src/` |
| 改桌面应用后端 | `Dailysnap/src-tauri/src/` |
| 改官网页面 | `Dailysnap/website/src/sections/` |
| 改官网下载链接 | `website/src/sections/Download.tsx` |
| 改服务器部署 | `Dailysnap/deploy/` |
| 发新版本 | 改 version → push → Actions 构建 → 下载 → 上传 downloads/ → 改 Download.tsx |
| 部署官网 | `npm run build` → tar → scp → ssh 解压 |
| SSH 服务器 | `ssh ubuntu@124.220.21.190`（密码 `}7PT5c;/ZG8s.X@`） |
| 看部署状态 | `ssh` 后 `docker ps` / `ls /opt/dailysnap/nginx/html/downloads/` |
