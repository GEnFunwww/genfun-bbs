FROM node:18-alpine

WORKDIR /app

# 澶嶅埗渚濊禆鏂囦欢
COPY package.json package-lock.json ./
RUN npm ci --production && npm cache clean --force

# 澶嶅埗婧愪唬鐮?COPY server.js ./
COPY GENFUN璁哄潧.html ./

# 鍒涘缓鏁版嵁鐩綍
RUN mkdir -p /data/genbbs/uploads

# 鏆撮湶绔彛
EXPOSE 3456

# 鍚姩
CMD ["node", "server.js"]
