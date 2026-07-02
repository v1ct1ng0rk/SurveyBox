# syntax=docker/dockerfile:1

FROM golang:1.23-alpine AS builder

ENV GOTOOLCHAIN=auto

RUN apk add --no-cache git ca-certificates

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata wget netcat-openbsd \
    && addgroup -S surveybox \
    && adduser -S surveybox -G surveybox

WORKDIR /app

COPY --from=builder /server /app/server
COPY docker-entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
    && mkdir -p /app/data/files \
    && chown -R surveybox:surveybox /app

USER surveybox

EXPOSE 8080

VOLUME ["/app/data/files"]

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
    CMD wget -qO- http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/app/server"]
