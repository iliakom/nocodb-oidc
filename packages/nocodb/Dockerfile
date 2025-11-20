# syntax=docker/dockerfile:1

###########
# Litestream Builder (используем готовый бинарник)
###########
FROM alpine:3.19 as lt-builder

WORKDIR /tmp

# Скачиваем и распаковываем бинарник Litestream для Linux
RUN apk add --no-cache curl \
    && curl -L "https://github.com/benbjohnson/litestream/releases/download/v0.5.2/litestream-0.5.2-linux-x86_64.tar.gz" -o litestream.tar.gz \
    && tar -xzf litestream.tar.gz \
    && rm litestream.tar.gz

###########
# Builder
###########
FROM node:18.19.1-alpine as builder
WORKDIR /usr/src/app

# Устанавливаем зависимости для node-gyp и sqlite3
RUN apk add --no-cache python3 make g++ curl

# Устанавливаем pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Копируем файлы манифестов
COPY ./package.json ./package.json
RUN printf "packages:\n  - ./nc-lib-gui" > ./pnpm-workspace.yaml
COPY --link ./docker/main.js ./docker/main.js
COPY --link ./docker/start-litestream.sh /usr/src/appEntry/start.sh
COPY --link src/public/ ./docker/public/
COPY ./docker/nc-lib-gui/ ./nc-lib-gui/

# Настройка pnpm для генерации плоской структуры node_modules
RUN echo "node-linker=hoisted" > .npmrc

# Установка production зависимостей и очистка
RUN pnpm install --prod --shamefully-hoist \
    && pnpm dlx modclean --patterns="default:*" --ignore="nc-lib-gui/**,dayjs/**,express-status-monitor/**,@azure/msal-node/dist/**" --run \
    && chmod +x /usr/src/appEntry/start.sh

##########
# Runner
##########
FROM alpine:3.19
WORKDIR /usr/src/app

# Переменные окружения
ENV LITESTREAM_S3_SKIP_VERIFY=false \
    LITESTREAM_RETENTION=1440h \
    LITESTREAM_RETENTION_CHECK_INTERVAL=72h \
    LITESTREAM_SNAPSHOT_INTERVAL=24h \
    LITESTREAM_SYNC_INTERVAL=60s \
    NC_DOCKER=0.6 \
    NC_TOOL_DIR=/usr/app/data/ \
    NODE_ENV=production \
    PORT=8080

# Установка необходимых пакетов
RUN apk add --update --no-cache \
    dumb-init \
    nodejs \
    curl \
    && curl -L "https://github.com/TomWright/dasel/releases/download/v2.8.1/dasel_linux_amd64" -o /usr/local/bin/dasel \
    && chmod +x /usr/local/bin/dasel

# Копируем Litestream и конфиг
COPY --from=lt-builder /tmp/litestream /usr/local/bin/litestream
COPY --link ./docker/litestream.yml /etc/litestream.yml

# Копируем production код
COPY --link --from=builder /usr/src/app/ /usr/src/app/
COPY --link --from=builder /usr/src/appEntry/ /usr/src/appEntry/

EXPOSE 8080
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Запуск Nocodb
CMD ["/usr/src/appEntry/start.sh"]
