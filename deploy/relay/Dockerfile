FROM python:3.12-slim

WORKDIR /app

# 先装依赖（利用缓存）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 再拷源码
COPY app.py .

# 健康检查端口
EXPOSE 8000

# 启动命令（uvicorn 标准 worker，--proxy-headers 让 nginx 反代时 client IP 正确）
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
