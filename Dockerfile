FROM node:20-alpine

RUN apk add --no-cache wget

WORKDIR /app

ARG PROXPANEL_VERSION=alpha
ENV PROXPANEL_VERSION=${PROXPANEL_VERSION}
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

LABEL org.opencontainers.image.title="ProxPanel" \
      org.opencontainers.image.description="Dashboard alternatif Proxmox VE" \
      org.opencontainers.image.source="https://github.com/sannier3/ProxPanel" \
      org.opencontainers.image.version="${PROXPANEL_VERSION}"

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public
COPY config.example.json ./config.example.json

RUN mkdir -p data/workspaces modules

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "src/index.js"]
