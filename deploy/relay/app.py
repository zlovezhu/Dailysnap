"""
DailySnap 中转服务 - OpenAI 兼容协议

接收客户端（DailySnap app）的 OpenAI 格式请求，验证 Bearer Token，
转发到 DeepSeek API 并把响应（SSE 流式）原样回传。

为什么不直连 DeepSeek：
1. 防止 app 内硬编码的 deepseek key 被逆向提取盗刷
2. 客户端用自定义 RELAY_TOKEN，泄露后可服务端轮换
3. 流量集中管控，能加限流 / 监控 / 日志
"""
import os
import time
import logging
from typing import AsyncIterator

import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse, PlainTextResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("relay")

app = FastAPI(title="DailySnap Relay", version="1.0.0")

# 配置（启动时从 .env 读入）
RELAY_TOKEN = os.environ.get("RELAY_TOKEN", "").strip()
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash").strip()

# 启动时 sanity check（避免上线后才发现配置漏了）
if not RELAY_TOKEN:
    log.warning("⚠️  RELAY_TOKEN is empty — auth will reject all requests!")
if not DEEPSEEK_API_KEY:
    log.warning("⚠️  DEEPSEEK_API_KEY is empty — upstream calls will fail!")


def _check_token(auth_header: str | None):
    """校验 Bearer Token。无 token 或不匹配返回 401。"""
    if not RELAY_TOKEN:
        raise HTTPException(401, "Server has no RELAY_TOKEN configured")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Missing Authorization Bearer header")
    token = auth_header[7:].strip()
    if token != RELAY_TOKEN:
        # 不要在错误信息里透露 token 内容（哪怕只告诉用户"不匹配"也会让攻击者调试）
        raise HTTPException(401, "Invalid token")


@app.get("/health")
async def health():
    """健康检查端点（docker healthcheck + 人工探活都用这个）"""
    return {
        "status": "ok",
        "token_configured": bool(RELAY_TOKEN),
        "upstream_configured": bool(DEEPSEEK_API_KEY),
        "model": DEEPSEEK_MODEL,
    }


@app.get("/v1/models")
async def list_models(request: Request):
    """OpenAI 兼容的 /v1/models（让客户端能 ping 验证中转可用）"""
    _check_token(request.headers.get("Authorization"))
    # 直接代理到 deepseek（不暴露完整列表，简单返回 model name）
    return {
        "object": "list",
        "data": [{"id": DEEPSEEK_MODEL, "object": "model", "created": int(time.time()), "owned_by": "dailysnap-relay"}],
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """OpenAI 兼容的 chat completions 端点（流式 + 非流式都支持）"""
    _check_token(request.headers.get("Authorization"))

    # 读 body（透传给 deepseek，不解析字段）
    body = await request.body()
    if not body:
        raise HTTPException(400, "Empty request body")

    # 如果客户端没指定 model，用我们配置的默认
    # （不解析 JSON 再改回 JSON，直接在 bytes 上做最小修改会很难；
    #  这里解析一次再 dumps，多一次开销但代码简单可靠）
    import json
    try:
        body_json = json.loads(body)
    except Exception:
        raise HTTPException(400, "Invalid JSON body")
    if not body_json.get("model"):
        body_json["model"] = DEEPSEEK_MODEL
    # 强制 stream=True（DailySnap 客户端用流式打字效果）
    body_json["stream"] = True
    new_body = json.dumps(body_json).encode("utf-8")

    # 拼 upstream URL（OpenAI 兼容 /chat/completions）
    upstream_url = f"{DEEPSEEK_BASE_URL}/chat/completions"

    log.info(f"→ {upstream_url}  model={body_json.get('model')}  stream=True")

    # 用 httpx 异步客户端调 upstream
    # - timeout 长一点（流式响应可能很久）
    # - 不读完整 body，按 chunk 透传
    client = httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0))

    async def stream_upstream() -> AsyncIterator[bytes]:
        try:
            async with client.stream(
                "POST",
                upstream_url,
                content=new_body,
                headers={
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                    "Accept": "text/event-stream",
                },
            ) as resp:
                if resp.status_code != 200:
                    # upstream 非 2xx：读 body 返回给客户端（让客户端能拿到具体错误）
                    err_body = await resp.aread()
                    log.error(f"upstream {resp.status_code}: {err_body[:200]}")
                    yield f"data: {{\"error\": \"upstream {resp.status_code}\"}}\n\n".encode()
                    return
                # 透传 SSE chunk
                async for chunk in resp.aiter_bytes():
                    yield chunk
        except httpx.RequestError as e:
            log.error(f"upstream connection error: {e}")
            yield f"data: {{\"error\": \"upstream unreachable: {e.__class__.__name__}\"}}\n\n".encode()
        finally:
            await client.aclose()

    return StreamingResponse(
        stream_upstream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # 关掉 nginx buffering，确保流式实时
        },
    )


@app.get("/")
async def root():
    """根路径返回简单信息（避免被误以为中转服务暴露了 web）"""
    return PlainTextResponse("DailySnap Relay\n", status_code=200)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """统一错误格式（让客户端能拿到 status + message）"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"message": exc.detail, "type": "relay_error"}},
    )
