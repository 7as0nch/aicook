FROM golang:1.25-alpine AS builder

WORKDIR /src

# 先下载依赖，利用 Docker 缓存加快构建。
COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /app/server ./cmd/backend

FROM alpine:latest

# ffmpeg：语音/聊天音频入模前转码用——微信开发者工具/浏览器录的是 WebM，
# MiMo ASR 只认 wav/mp3，需 ffmpeg 转 WAV（真机录 mp3 时不触发转码）。
RUN apk add --no-cache ca-certificates tzdata ffmpeg && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

COPY --from=builder /app/server .
# 仅打包占位模板做兜底；真实配置在运行时由 ConfigMap 挂载到 /data/conf/config.yaml（AICOOK_CONFIG）。
# 切勿把含真实密钥的 configs/config.yaml 烤进推送到公共仓库的镜像。
COPY configs/config.yaml.example /app/configs/config.yaml

EXPOSE 8000
EXPOSE 9000

VOLUME ["/data/conf", "/app/logs"]

ENV AICOOK_CONFIG=/data/conf/config.yaml

ENTRYPOINT ["./server"]
