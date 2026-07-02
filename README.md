# SurveyBox

企业级智能问卷系统：React 管理端 + Go 后端 + PostgreSQL。

## Docker 一键部署（推荐）

```bash
# 1. 复制环境变量并修改 JWT_SECRET
cp .env.example .env
# 生成密钥: openssl rand -base64 32

# 2. 部署
chmod +x scripts/*.sh
./scripts/deploy.sh

# 首次若 JWT 仍为默认值，可临时: ALLOW_INSECURE_JWT=1 ./scripts/deploy.sh
```

访问 **http://localhost**（默认端口 80，可通过 `.env` 中 `WEB_PORT` 修改）

默认管理员：`admin` / `admin123`

| 脚本 | 说明 |
|------|------|
| `./scripts/deploy.sh` | 构建并启动 postgres + api + web |
| `./scripts/stop.sh` | 停止服务（保留数据卷） |
| `./scripts/logs.sh` | 查看日志 `logs.sh api` |

### Docker 架构

```
浏览器 → web (nginx:80，唯一对外端口)
              ├── 静态前端
              └── /api/* → 127.0.0.1:8080（api 共享 web 网络栈，不暴露宿主机）
                        ↓
                    postgres:5432（Docker 内网）
```

PostgreSQL 与 api、web 一同由 `docker compose` 启动；数据库文件持久化到宿主机 `POSTGRES_DATA_DIR`（默认 `/data/workspace/db/pg/SurveyBox`），可在 `.env` 中修改。

生产环境请将 `WEB_ORIGIN` 设为实际域名（用于生成问卷分享链接）。

---

## 本地开发

### 仅数据库（Docker）

```bash
docker compose -f docker-compose.dev.yml up -d
```

### API

```bash
cd api
go run ./cmd/server
```

### 前端

```bash
cd web
npm install
npm run dev
```

访问 http://localhost:5173

---

## 功能

### Phase 1
- 用户名密码登录（JWT + httpOnly Cookie）
- 现代企业风 UI（Ant Design Pro）
- 问卷 CRUD、字段结构编辑、HTML sandbox 预览
- 问卷发布、HTML 消毒（bluemonday）

### Phase 2
- OpenAI 兼容 LLM 问卷生成
- 联系人 CRUD
- 批量分享（独立 Token 链接）
- 公开填写页 + 答卷提交
- 本地 AES-256-GCM 加密文件上传/下载

### Phase 3（部分）
- 答卷 ZIP 导出：`答卷.csv` + `attachments/` 附件目录打包

### 暂未实现
- COS 对象存储切换
- 邮件通知分享

---

## 项目结构

```
SurveyBox/
├── api/              # Go Gin 后端 + Dockerfile
├── web/              # React + Vite 前端 + Dockerfile
├── scripts/          # deploy.sh / stop.sh / logs.sh
├── docker-compose.yml
└── docker-compose.dev.yml
```

## 环境变量

见 [.env.example](.env.example)
