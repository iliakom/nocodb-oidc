# syntax=docker/dockerfile:1

###########
# Litestream Builder
###########
FROM golang:alpine3.19 as lt-builder

WORKDIR /usr/src/

RUN apk add --no-cache git make musl-dev gcc

# build litestream
RUN apk add --no-cache curl \
    && curl -L "https://github.com/benbjohnson/litestream/releases/download/v0.5.2/litestream-0.5.2-linux-x86_64.tar.gz" -o litestream.tar.gz \
    && mkdir -p litestream \
    && tar -xzf litestream.tar.gz -C litestream \
    && rm litestream.tar.gz

RUN cp litestream/litestream /usr/src/lt


###########
# Builder
###########
FROM node:18.19.1-bullseye as builder
WORKDIR /usr/src/app

# install node-gyp dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

# install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy application dependency manifests to the container image.
COPY ./package.json ./package.json
RUN printf "packages:\n  - ./nc-lib-gui" > ./pnpm-workspace.yaml
COPY --link ./docker/main.js ./docker/main.js
COPY --link ./docker/start-litestream.sh /usr/src/appEntry/start.sh
COPY --link src/public/ ./docker/public/
COPY ./docker/nc-lib-gui/ ./nc-lib-gui/

# for pnpm to generate a flat node_modules without symlinks
# so that modclean could work as expected
RUN echo "node-linker=hoisted" > .npmrc

# install production dependencies,
# reduce node_module size with modclean & removing sqlite deps,
# and add execute permission to start.sh
RUN pnpm install --prod --shamefully-hoist \
    && pnpm dlx modclean --patterns="default:*" --ignore="nc-lib-gui/**,dayjs/**,express-status-monitor/**,@azure/msal-node/dist/**" --run  \
    && rm -rf ./node_modules/sqlite3/deps \
    && chmod +x /usr/src/appEntry/start.sh

##########
# Runner
##########
FROM alpine:3.19
WORKDIR /usr/src/app

ENV LITESTREAM_S3_SKIP_VERIFY=false \
    LITESTREAM_RETENTION=1440h \
    LITESTREAM_RETENTION_CHECK_INTERVAL=72h \
    LITESTREAM_SNAPSHOT_INTERVAL=24h \
    LITESTREAM_SYNC_INTERVAL=60s \
    NC_DOCKER=0.6 \
    NC_TOOL_DIR=/usr/app/data/ \
    NODE_ENV=production \
    PORT=8080

RUN apk add --update --no-cache \
    dasel \
    dumb-init \
    nodejs

# Copy litestream binary and config file
COPY --link --from=lt-builder /usr/src/lt /usr/local/bin/litestream
COPY --link ./docker/litestream.yml /etc/litestream.yml
# Copy production code & main entry file
COPY --link --from=builder /usr/src/app/ /usr/src/app/
COPY --link --from=builder /usr/src/appEntry/ /usr/src/appEntry/

EXPOSE 8080
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start Nocodb
CMD ["/usr/src/appEntry/start.sh"]