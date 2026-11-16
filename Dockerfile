FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "server/src/index.js"]
