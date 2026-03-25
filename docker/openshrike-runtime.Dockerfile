FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ripgrep ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/tool

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY best_practices ./best_practices
COPY docs ./docs

RUN npm run build

ENV PATH="/workspace/tool/node_modules/.bin:${PATH}"

CMD ["node", "dist/cli.js"]
