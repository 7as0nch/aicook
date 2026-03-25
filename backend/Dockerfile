FROM golang:1.25-alpine AS builder

WORKDIR /src

# 先下载依赖，利用 Docker 缓存加快构建。
COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /app/server ./cmd/server

FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

COPY --from=builder /app/server .
COPY configs/config.yaml /app/configs/config.yaml

EXPOSE 8000
EXPOSE 9000

VOLUME ["/data/conf", "/app/logs"]

ENV AICOOK_CONFIG=/data/conf/config.yaml

ENTRYPOINT ["./server"]
