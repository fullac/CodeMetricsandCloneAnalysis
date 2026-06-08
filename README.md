# SonarQube + LLM Code Review Platform

基于 `React + Tailwind + Monaco Editor` 与 `Node.js` 的代码审查平台，实现 ZIP 上传、Sonar 参数化扫描、主要缺陷提取、LLM 修复建议与本地临时源码清理。

## 目录结构

```text
.
├── backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src
│       ├── config.ts
│       ├── index.ts
│       ├── types/index.ts
│       ├── services
│       │   ├── scanService.ts
│       │   ├── sonarClient.ts
│       │   └── llmClient.ts
│       └── utils/fileContext.ts
├── frontend
│   ├── package.json
│   ├── index.html
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── vite.config.ts
│   └── src
│       ├── App.tsx
│       ├── main.tsx
│       ├── index.css
│       ├── types.ts
│       └── components
│           ├── UploadPanel.tsx
│           └── IssueViewer.tsx
├── docs
│   └── system-architecture.md
└── content.md
```

## 核心依赖（package.json）

### 后端
- `express` `multer` `adm-zip` `dotenv` `cors`
- 开发：`typescript` `tsx` `@types/*`

### 前端
- `react` `vite` `tailwindcss`
- `@monaco-editor/react`（源码高亮）
- `axios`（上传进度）

## 后端关键实现说明
- 参数化扫描：`backend/src/services/scanService.ts`
  - 使用 `spawn(sonar-scanner, ["-D..."])`
  - `sonar.projectKey` 来自前端固定输入
  - 全部 Sonar 参数通过 `-D` 传入，未写入 `sonar-project.properties`
- 增量数据提取：`backend/src/services/sonarClient.ts`
  - 调用 `/api/issues/search` 拉取主要缺陷
- 本地源码清理：`backend/src/services/scanService.ts`
  - 在 `finally` 中删除 `/tmp` 解压目录和上传 ZIP
  - 不删除 SonarQube 项目记录，保留历史趋势

## Docker 一键部署（推荐）

现在项目已改为可完整容器化部署：`frontend + backend + sonarqube + postgres`。

### 1) 准备环境变量

```bash
cd infra
cp .env.example .env
```

编辑 `infra/.env`，至少填入：
- `SONAR_TOKEN`
- `OPENAI_API_KEY`

### 2) 启动全部服务

```bash
cd infra
docker compose up -d --build
```

### 3) 访问地址
- 前端页面：`http://localhost:5173`
- 后端接口根路由：`http://localhost:3001/`
- 后端健康检查：`http://localhost:3001/health`
- SonarQube：`http://localhost:9000`

说明：此前你看到的 `Cannot GET /` 是因为后端只提供 API 路由，现在已补充根路由返回服务信息。

## 本地开发模式（非 Docker）

如果需要本地调试，也可以分别启动前后端：

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

## API

### `POST /api/review`
- `Content-Type: multipart/form-data`
- 字段：
  - `projectKey`：固定项目标识
  - `file`：ZIP 源码包

返回：项目扫描时间、主要缺陷列表、代码片段与 LLM 建议。

## 汇报文档
- 详见 `docs/system-architecture.md`
- 重点：
  - 大模型上下文精简（只传 line ±10）
  - Sonar 历史数据留存（不删除 Sonar 项目）

## Docker 文件
- `infra/docker-compose.yml`：统一编排四个服务
- `infra/.env.example`：容器运行参数模板
- `backend/Dockerfile`：包含 Java + sonar-scanner 的后端镜像
- `frontend/Dockerfile` + `frontend/nginx.conf`：前端静态托管并反向代理 `/api`
