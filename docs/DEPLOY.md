# DailySnap 部署文档（从本地到线上）

> 最后更新：2026-08-25。本文档说明「改一行代码 → 线上生效」的完整链路。

---

## 1. 完整链路（6 层）

```
① 本地代码          website/src/*.tsx
        ↓ npm run build
② 构建产物          website/dist/（index.html + assets + cats + icon）
        ↓ tar 打包 + scp 上传
③ 服务器静态目录    /opt/dailysnap/nginx/html/
        ↓ Docker 挂载
④ nginx 容器        80 端口 serve 静态 + /v1/ 反代 relay
        ↓ 端口映射 80:80
⑤ CloudFlare        DNS A 记录（Proxied）+ SSL + CDN 边缘
        ↓ 用户访问 https://dailysnap.online
⑥ 用户浏览器        面试官/访客最终看到的内容
```

**一句话**：本地 React 代码 → build 成静态文件 → scp 传到香港服务器 → nginx 容器 serve → CloudFlare 代理 + 加 HTTPS → 用户访问。

---

## 2. 各层详解

### ① 本地代码

- 路径：`Dailysnap/website/src/`
- 结构：`sections/`（Hero / Features / Companion / Demo / Download / Contact / Footer / Nav）+ `components/` + `demo/`
- 技术栈：React 19 + TypeScript + Vite 7 + TailwindCSS 3 + Framer Motion

### ② 构建产物

```bash
cd Dailysnap/website
npm install        # 首次或依赖变化时
npm run build      # 生成 dist/
```

产出 `dist/`：
- `index.html`（入口）
- `assets/`（JS + CSS，文件名带 hash）
- `cats/`（猫动画 webp/png 素材）
- `icon/`（应用图标）
- `favicon.png`

> ⚠️ 已知坑：新版 `lucide-react` 移除了 `Github` 品牌图标，代码里已改用 `GitBranch`。

### ③ 服务器静态目录

- 服务器：**腾讯云香港轻量应用服务器**（不要求 ICP 备案）
- 路径：`/opt/dailysnap/nginx/html/`
- 子目录：`downloads/`（Windows 安装包）

### ④ nginx 容器

- 配置：`/opt/dailysnap/nginx/conf.d/default.conf`
- 作用：
  - 80 端口 serve 静态（`try_files $uri $uri/ =404`）
  - `/v1/` 反代 relay 中转服务
  - `/health` 健康检查
- 由 docker-compose 管理，容器名 `dailysnap-nginx`

### ⑤ CloudFlare

- 域名 `dailysnap.online` 的 NS 已切到 CloudFlare（`ashley.ns.cloudflare.com` / `walt.ns.cloudflare.com`）
- A 记录：`dailysnap.online → 124.156.141.10`，**Proxied（橙色云朵）**
- SSL 模式：**Flexible**（客户端到 CF 是 HTTPS，CF 到源站是 HTTP）

> ⚠️ 为什么用 Flexible：源站 nginx 目前只配了 HTTP（80 端口），没配 443。后续可以补源站证书，切到 Full (Strict) 实现端到端加密。

### ⑥ 用户浏览器

- 访问 `https://dailysnap.online`，看到的是 CloudFlare 边缘缓存的静态内容。

---

## 3. 改一次官网的完整操作（核心流程）

改官网任何页面（文案/样式/结构），走下面 6 步：

```bash
# 1. 改代码（本地）
#    编辑 website/src/sections/*.tsx

# 2. 本地构建
cd /Users/zhujiating/WorkBuddy/2026-07-24-11-24-24/Dailysnap/website
npm run build

# 3. 打包 dist
tar czf /tmp/site.tar.gz -C dist .

# 4. scp 上传到服务器
scp /tmp/site.tar.gz ubuntu@124.156.141.10:/tmp/

# 5. 服务器解压覆盖
ssh ubuntu@124.156.141.10 \
  "cd /opt/dailysnap/nginx/html && tar xzf /tmp/site.tar.gz && rm -f /tmp/site.tar.gz"

# 6. 验证
curl -sL https://dailysnap.online/ | grep -o "<title>[^<]*</title>"
```

---

## 4. 服务器信息

| 项 | 值 |
|----|-----|
| 云厂商 | 腾讯云轻量应用服务器（香港） |
| IP | `124.156.141.10` |
| 系统 | Ubuntu 24.04 LTS |
| SSH | `ssh ubuntu@124.156.141.10` |
| SSH 密码 | `{M75z%QJ~k)2:t\`` |
| 部署目录 | `/opt/dailysnap/` |
| Docker 容器 | `dailysnap-nginx` + `dailysnap-relay` |

### 目录结构

```
/opt/dailysnap/
├── docker-compose.yml
├── nginx/
│   ├── conf.d/default.conf     # nginx 配置（HTTP 版）
│   └── html/                    # 官网静态文件
│       ├── index.html
│       ├── assets/ cats/ icon/
│       └── downloads/           # Windows 安装包
└── relay/                       # FastAPI 中转服务
    ├── .env                     # DeepSeek key（不 commit）
    └── app.py
```

### 常用服务器命令

```bash
# 查看容器状态
docker ps

# 查看 nginx 日志
docker logs --tail 50 dailysnap-nginx

# 重启服务
cd /opt/dailysnap && docker compose restart

# 重建（改了配置后）
cd /opt/dailysnap && docker compose up -d --build
```

---

## 5. 部署踩过的坑（重要）

1. **expect 缓冲 OOM**：scp + ssh 不要合并成一条命令（会 exit 137），分步执行；docker build 输出量大，重定向到文件避免 expect 缓冲撑爆。

2. **tar 打包路径**：`tar czf -C dist .` 确保解压后文件在 html 根目录，不带 dist/ 前缀。

3. **DNS 传播延迟**：CloudFlare 改 A 记录后，全球 DNS 缓存要几小时才完全切过去（我这边 dig 可能还显示旧 IP，但用户端可能已生效）。验证用「手机 4G 打开」最准。

4. **未备案拦截**：国内节点（如原腾讯云广州 124.220.21.190）会对未备案域名做 HTTP 302 + HTTPS RST 拦截，且**不分来源**（CloudFlare 回源也被拦）。香港节点不受此限制，这是迁移的根本原因。

5. **lucide-react 品牌图标**：新版移除了 `Github` 图标，改用 `GitBranch`。

---

## 6. 待办（后续完善）

- [ ] 源站补 SSL 证书（CloudFlare Origin CA 或 Let's Encrypt），切 Full (Strict)
- [ ] relay 的 `.env` 目前是占位，需填真实的 `DEEPSEEK_API_KEY` + `RELAY_TOKEN`
- [ ] 旧服务器（124.220.21.190）可释放，省 ¥/月
- [ ] 域名 ICP 备案（如果要迁回国内节点，速度更快）
