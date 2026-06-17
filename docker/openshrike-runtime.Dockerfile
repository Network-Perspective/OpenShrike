FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ripgrep ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/tool

COPY package.json ./package.json
COPY docker/openshrike-runtime.package-lock.json ./package-lock.json
RUN npm ci --omit=dev

COPY dist/cli.js ./dist/cli.js
COPY prompts ./prompts
COPY best_practices ./best_practices

ENV PATH="/workspace/tool/node_modules/.bin:${PATH}"

CMD ["node", "dist/cli.js"]
