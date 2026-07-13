FROM node:18-alpine

WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json ./
RUN npm ci --production && npm cache clean --force

# 复制源代码
COPY server.js ./
COPY GENFUN论坛.html ./

# 创建数据目录
RUN mkdir -p /data/genbbs/uploads

# 暴露端口
EXPOSE 3456

# 启动
CMD ["node", "server.js"]
