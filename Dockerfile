FROM node:20-slim AS build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install --include=dev
COPY frontend/ ./
RUN npm run build

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY backend/package.json ./backend/
RUN npm --prefix backend install --omit=dev

COPY backend/src ./backend/src
COPY --from=build /app/frontend/dist ./frontend/dist

EXPOSE 4000
ENV PORT=4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/src/index.js"]
