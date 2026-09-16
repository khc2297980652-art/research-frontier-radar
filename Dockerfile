FROM node:22-alpine

WORKDIR /app

# 先装依赖，利用镜像层缓存
COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npx vite build

ENV PORT=8787
EXPOSE 8787

CMD ["node", "server/index.mjs"]
