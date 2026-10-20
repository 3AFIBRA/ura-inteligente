FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/erp/package.json packages/erp/
COPY packages/whatsapp/package.json packages/whatsapp/
COPY packages/speech/package.json packages/speech/
COPY apps/api/package.json apps/api/
COPY apps/engine/package.json apps/engine/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build
RUN npm run prisma:generate

FROM node:20-alpine AS api
WORKDIR /app
RUN apk add --no-cache sox ffmpeg wget
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "apps/api/dist/src/main.js"]

FROM node:20-alpine AS engine
WORKDIR /app
RUN apk add --no-cache sox ffmpeg
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/engine/dist ./apps/engine/dist
CMD ["node", "apps/engine/dist/main.js"]

FROM nginx:alpine AS web
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
