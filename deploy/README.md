# DailySnap 部署配置

腾讯云 Lighthouse 上一键部署 DailySnap 中转服务 + 下载页。

## 架构

```
DailySnap app
  │
  │ base_url = http://<server>/v1/
  ▼
nginx（80 端口，对外）
  │  ├─ /         → 下载页
  │  ├─ /downloads/ → 静态 .dmg 文件
  │  └─ /v1/      → 反代到 relay
  ▼
relay（FastAPI，8000 端口，内部）
  │  鉴权：RELAY_TOKEN
  │  Bearer Token from app
  ▼
DeepSeek API（用户自己的 key，存在服务器 .env）
```

## 部署步骤

### 第一次部署

```bash
# 1. 准备项目目录（如果还没创建）
mkdir -p /opt/dailysnap/{relay,nginx,downloads}
sudo chown -R ubuntu:ubuntu /opt/dailysnap  # 必须用 ubuntu:ubuntu，不能用 $USER

# 2. 拷贝 deploy/ 下的文件到服务器
#    （在本地机器执行，把项目根目录的 deploy/ 整个传上去）
rsync -avz --exclude='.env' deploy/ ubuntu@<server-ip>:/opt/dailysnap/

# 或者用 scp 一个个拷：
# scp -r relay/ nginx/ docker-compose.yml ubuntu@<server-ip>:/opt/dailysnap/

# 3. 配置中转服务的环境变量
cd /opt/dailysnap
cp relay/.env.example relay/.env
nano relay/.env
# 填：
#   RELAY_TOKEN=<自己生成的长随机串，建议 openssl rand -hex 32>
#   DEEPSEEK_API_KEY=<你的 DeepSeek key>
# 其他字段有默认值，不用改

# 4. 启动服务（首次会 build 镜像，2-3 分钟）
docker compose up -d --build

# 5. 验证
#    - 健康检查
curl http://localhost/health
#    - 下载页
#      浏览器打开 http://<server-ip>/
#    - 中转服务测试（用真实 token）
TOKEN=$(grep '^RELAY_TOKEN=' relay/.env | cut -d= -f2)
curl -X POST http://localhost/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"max_tokens":50}'
```

### 上传新的 .dmg

```bash
# 本地 build
cd /path/to/Dailysnap
pnpm tauri build

# 传到服务器
scp src-tauri/target/release/bundle/dmg/DailySnap_*.dmg \
  ubuntu@<server-ip>:/opt/dailysnap/nginx/html/downloads/DailySnap.dmg
```

> nginx 的 `/downloads/` 目录是 host 卷挂载，文件改动立即生效，不需要重启容器。

### 查看日志 / 重启

```bash
# 实时日志（所有服务）
docker compose logs -f

# 单独看 relay
docker compose logs -f relay

# 重启某个服务
docker compose restart relay

# 重新 build（修改了 Dockerfile 或 app.py 后）
docker compose up -d --build relay
```

### 更新 app 的中转地址

中转地址必须硬编码在 app 里（因为删了 AI 设置）。更新流程：

1. 修改 `src-tauri/src/commands/cat.rs` 里的 `default` base_url
2. 或者更干净：在 `settingsStore.ts` 里改初始默认值（migration 处理老用户）
3. `pnpm tauri build` 重新打包 .dmg
4. scp 传到服务器

## 安全注意

- **绝对不要**把 `.env` commit 到 git
- `.env` 文件权限应该 `chmod 600`（只有 ubuntu 可读写）
- `RELAY_TOKEN` 泄露后可以在服务器上改 `.env` 然后 `docker compose restart relay`，app 用户需要更新 base_url 配置
- 定期去 DeepSeek 控制台看用量，发现异常立即在服务器上 disable relay

## 性能

- 中转服务是轻量级，纯文本请求，单机 2 核 2G 跑 100+ QPS 无压力
- 流式响应延迟：~50ms（nginx 直连 upstream，不绕路）
- 公网带宽：3Mbps 下行，API 调用只占几 KB/s，完全够用；下载 .dmg 时是 ~375 KB/s（50MB 要 2 分钟）

## 故障排查

```bash
# 1. relay 起不来？
docker compose logs relay
# 看是不是 .env 配置错了（健康检查会显示 token_configured / upstream_configured）

# 2. 中转不通？
#    在服务器本地：
TOKEN=$(grep '^RELAY_TOKEN=' relay/.env | cut -d= -f2)
curl -v -X POST http://localhost/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}'

# 3. 下载页打不开？
curl -I http://localhost/
docker compose logs nginx
```