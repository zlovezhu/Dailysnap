FROM nginx:alpine

# 删掉默认配置，用我们的
RUN rm /etc/nginx/conf.d/default.conf

# 拷入配置
COPY conf.d /etc/nginx/conf.d

# 拷入静态文件（index.html + downloads 目录）
COPY html /usr/share/nginx/html

EXPOSE 80