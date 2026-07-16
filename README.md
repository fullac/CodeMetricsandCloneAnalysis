# Code Metrics Analysis & Clone Recognition

基于 `React + Vite` 和 `Node.js + Express + tree-sitter` 的多语言代码分析平台。项目支持上传 ZIP 或单个源码文件，解析 Python、Java、C、C++ 代码，生成项目级、文件级、函数级指标，检测文件级克隆关系，并导出 PDF 分析报告。

当前版本不依赖 SonarQube，也不需要 LLM API。

## 功能概览

- 上传 `.zip` 或单个源码文件
- 支持 `.py`、`.java`、`.c`、`.h`、`.cpp`、`.cc`、`.cxx`、`.hpp` 等源码
- 基于 tree-sitter 解析 AST
- 统计代码行、有效代码行、注释密度、函数数、类/结构数、导入数
- 统计函数复杂度、函数长度、嵌套深度、参数数量
- 检测文件级相似代码对，输出 Jaccard 相似度与匹配片段数量
- 前端展示分页表格与关键指标卡片
- 支持将分析结果导出为 PDF

## 技术栈

### 后端

- `express`：API 服务
- `multer`：文件上传
- `adm-zip`：ZIP 解压
- `tree-sitter`、`tree-sitter-python`、`tree-sitter-java`、`tree-sitter-c`、`tree-sitter-cpp`：多语言 AST 解析
- `playwright`：服务端渲染 PDF
- `typescript`、`tsx`：开发与构建

### 前端

- `react`
- `vite`
- `axios`
- `tailwindcss`

## 目录结构

```text
.
├── backend
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src
│       ├── config.ts
│       ├── index.ts
│       ├── services
│       │   ├── analysis
│       │   │   ├── analyzer.ts
│       │   │   ├── fileDiscovery.ts
│       │   │   ├── language.ts
│       │   │   └── parser.ts
│       │   ├── analysisEngine.ts
│       │   ├── clone
│       │   │   ├── cloneService.ts
│       │   │   ├── fingerprint.ts
│       │   │   └── fingerprintStore.ts
│       │   ├── metrics
│       │   │   ├── aggregate.ts
│       │   │   ├── ast.ts
│       │   │   ├── index.ts
│       │   │   └── types.ts
│       │   ├── report
│       │   │   ├── htmlReport.ts
│       │   │   └── pdfReport.ts
│       │   ├── rules
│       │   └── scoring
│       └── types
├── frontend
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src
│       ├── App.tsx
│       ├── components
│       │   └── UploadPanel.tsx
│       ├── index.css
│       ├── main.tsx
│       └── types.ts
└── infra
    └── docker-compose.yml
```

## Docker 部署

项目提供 `frontend + backend` 两个容器。前端 Nginx 会把 `/api/*` 代理到后端。

```bash
cd infra
docker compose up -d --build
```

访问地址：

- 前端页面：`http://localhost:5173`
- 后端接口根路由：`http://localhost:3001/`
- 健康检查：`http://localhost:3001/health`

停止服务：

```bash
cd infra
docker compose down
```

## 本地开发

分别启动后端和前端。

```bash
cd backend
npm install
npm run dev
```

默认后端端口来自 `PORT` 环境变量，未设置时为 `4000`。Docker 环境中使用 `3001`。

```bash
cd frontend
npm install
npm run dev
```

本地开发时如需让前端请求后端，请按 Vite/代理配置或运行环境调整 `/api` 转发。

## API

### `POST /api/analyze`

上传源码并返回分析结果。

请求类型：`multipart/form-data`

字段：

- `projectKey`：项目名称，必填
- `file`：ZIP 或单个源码文件，必填
- `scanOptions`：JSON 字符串，可选

`scanOptions` 示例：

```json
{
  "engines": {
    "rules": false,
    "cloneDetection": true
  },
  "languages": ["python", "java", "c", "cpp"],
  "cloneThreshold": 0
}
```

返回字段包括：

- `metrics`：项目级聚合指标
- `fileMetrics`：文件级指标
- `findings`：规则发现项
- `clonePairs`：克隆文件对

### `POST /api/report/pdf`

根据 `/api/analyze` 返回的完整分析结果生成 PDF。

请求类型：`application/json`

返回类型：`application/pdf`

## 说明

- 上传文件会被解压到系统临时目录，分析完成后自动清理。
- 克隆检测默认开启，规则引擎默认关闭。
- `backend/data/` 为运行期数据目录，已被 `.gitignore` 忽略。
