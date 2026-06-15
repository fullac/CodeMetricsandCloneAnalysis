# 基于 tree-sitter 的多语言静态分析 + 代码克隆检测平台（MVP）

【已完成】在当前 TypeScript 项目中新增独立的、不依赖 SonarQube 的多语言静态分析 + 代码克隆检测能力。
【已完成，当前额外支持 C++】MVP 先覆盖 **Python、Java、C** 三种语言。

## 技术栈

| 层 | 选型 |
|---|---|
| 全栈语言 | 【已完成】TypeScript（复用现有前后端） |
| AST 解析 | 【已完成，当前额外使用 `tree-sitter-cpp`】`tree-sitter` + `tree-sitter-python` / `tree-sitter-java` / `tree-sitter-c` |
| 静态分析规则 | 【已完成：规则文件已建；未完成：规则匹配】tree-sitter query（S-expression）→ Findings |
| 静态指标 | 【已完成】AST walk → LOC / 圈复杂度 / 嵌套深度 / 函数数 |
| 克隆检测 | 【已完成】AST 归一化 token → k-gram → MinHash(128维) → LSH(b=16) → Jaccard |
| PDF 报告 | 【未完成】Puppeteer + ReactDOMServer → A4 PDF |

## 覆盖语言（MVP）

| 语言 | 扩展名 | tree-sitter parser |
|---|---|---|
| Python | `.py` | `tree-sitter-python` |
| Java | `.java` | `tree-sitter-java` |
| C | `.c` `.h` | `tree-sitter-c` |
| C++ | `.cpp` `.cc` `.cxx` `.hpp` `.hh` `.hxx` | 【已完成，新增支持】`tree-sitter-cpp` |

【已完成】排除目录：`node_modules` `dist` `build` `__pycache__` `.venv` `target` `.git` `vendor`。

## 核心架构

```
上传 ZIP → 解压 → 收集文件 → 按扩展名路由 parser
  → 每个文件 tree-sitter parse → AST
    【未完成】├─ 链路1: query 匹配规则 → Finding[]
    【已完成】├─ 链路2: AST walk 计算指标 → FileMetrics[]
    【已完成】└─ 链路3: token 归一化 → k-gram → MinHash → LSH → ClonePair[]
  【已完成：ScanReport + 前端返回；未完成：PDF】→ 聚合为 ScanReport → 返回前端 + 可选导出 PDF
```

## 链路1：静态分析规则引擎
【已完成：规则定义文件；未完成：规则匹配引擎】

### 规则定义

```ts
interface Rule {
  id: string;
  severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR';
  type: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL';
  language: 'python' | 'java' | 'c';
  description: string;
  query: string;   // tree-sitter S-expression
}
```
【已完成：类型；未完成：实际规则匹配】

### MVP 内置规则（每种语言约 6-8 条，共约 20 条）
【规则文件已创建，规则执行未接入】

**Python 规则**

| id | 类别 | 描述 | query 要点 |
|---|---|---|---|
| py-eval | 安全 | `eval()` / `exec()` 调用 | `(call function: (identifier) @f (#match? @f "eval\|exec"))` |
| py-shell-true | 安全 | `subprocess` 带 `shell=True` | keyword_argument name="shell" 值为 True |
| py-bare-except | Bug | 裸 `except:` 或 `except Exception` | except_clause 无具体异常类型 |
| py-hardcoded-secret | 漏洞 | 变量赋值含硬编码密钥 | assignment 右侧字符串匹配 `password` / `secret` / `token` / `key` 模式 |
| py-open-no-close | Bug | `open()` 未用 `with` | `open()` 调用不在 `with_statement` 内 |
| py-assert-on-tuple | Bug | `assert (x, y)` 永远为真 | assert 后跟 tuple（Python 特性） |
| py-long-func | 坏味道 | 函数 > 100 行 | walk 计算 definition 节点起止行差 |
| py-too-many-params | 坏味道 | 函数参数 > 6 | `parameters` 内 identifier 计数 |

**Java 规则**

| id | 类别 | 描述 | query 要点 |
|---|---|---|---|
| java-empty-catch | Bug | 空 catch 块 | `catch_clause` 内 `block` 无语句 |
| java-hardcoded-cred | 漏洞 | 硬编码密码/密钥 | 字符串字面量匹配 `password\|secret\|token\|jdbc` |
| java-switch-no-default | Bug | switch 缺 default | `switch_expression` 无 default 分支 |
| java-long-method | 坏味道 | 方法 > 100 行 | 计算 method_declaration 节点行数 |
| java-too-many-params | 坏味道 | 参数 > 6 | `formal_parameters` 计数 |
| java-deep-nesting | 坏味道 | 嵌套 > 4 层 | method 内 if/for/while 最大深度 |
| java-resource-leak | Bug | Stream/Reader 未关闭 | `new FileInputStream` / `new BufferedReader` 无 close 调用 |

**C 规则**

| id | 类别 | 描述 | query 要点 |
|---|---|---|---|
| c-gets | 安全 | `gets()` 调用 | `(call_expression function: (identifier) @f (#eq? @f "gets"))` |
| c-sprintf-overflow | Bug | `sprintf` 无长度限制 | 用 `sprintf` 而非 `snprintf` |
| c-null-check-after-deref | Bug | 解引用后再判空 | 对同一变量先 deref 后 `if (p != NULL)` 检查 |
| c-div-zero | Bug | 除零风险 | 除号右侧为常量 0 |
| c-hardcoded-secret | 漏洞 | 硬编码密钥 | 字符串字面量匹配 `password\|secret\|key` |
| c-resource-leak | Bug | `malloc` 无对应 `free` | 函数内 malloc 变量，所有 return 路径无 free |
| c-long-func | 坏味道 | 函数 > 100 行 | 计算 function_definition 行数 |
| c-too-many-params | 坏味道 | 参数 > 6 | `parameter_list` 计数 |

### Finding 输出
【已完成：类型；未完成：实际 Finding 生成】

```ts
interface Finding {
  id: string;
  ruleId: string;
  severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR';
  type: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL';
  file: string;
  line: number;
  column: number;
  message: string;
  snippet: string;    // 命中行 ±1 行上下文
}
```

## 链路2：静态指标计算
【已完成】

对每个文件 AST walk，输出文件级 + 函数级指标，最后项目级聚合。
【已完成】

### 文件级

| 指标 | 计算 |
|---|---|
| `totalLines` | 文件总行数 |
| `ncloc` | 代码行（排除空行、纯注释行） |
| `commentLines` | 注释行数 |
| `commentDensity` | commentLines / totalLines |
| `functionCount` | function/method 定义节点数 |
| `classCount` | class 定义节点数 |
| `importCount` | import/include 节点数 |

### 函数级（每个函数一条）

| 指标 | 计算 |
|---|---|
| `complexity` | 圈复杂度 = 函数内 if/for/while/switch/case/catch/&&/\|\|/? 决策点 + 1 |
| `lines` | 函数行数 |
| `nestingDepth` | 最大嵌套层数（统计 if/for/while/switch 嵌套） |
| `paramCount` | 参数个数 |

### 项目级聚合

- 代码总行数 / 函数总数 / 平均圈复杂度
- 超标函数数（复杂度 > 15 / 参数 > 6 / 嵌套 > 4 / 行数 > 100）
- 克隆代码行数 / 克隆率（来自链路3）

```ts
interface ProjectMetrics {
  totalLines: number;
  ncloc: number;
  commentDensity: number;
  functionCount: number;
  classCount: number;
  avgComplexity: number;
  maxComplexity: number;
  overComplexFunctions: number;   // > 15
  overLongFunctions: number;      // > 100 lines
  deeplyNestedFunctions: number;  // > 4
  cloneRate: number;              // clone lines / total lines
}

interface FileMetrics {
  file: string;
  language: string;
  totalLines: number;
  ncloc: number;
  commentDensity: number;
  functionCount: number;
  functions: FunctionMetric[];
}

interface FunctionMetric {
  name: string;
  startLine: number;
  endLine: number;
  complexity: number;
  lines: number;
  nestingDepth: number;
  paramCount: number;
}
```

## 链路3：代码克隆检测
【已完成，额外增加历史指纹轻量存储】

### Token 归一化

遍历 AST 叶子节点，语言无关地归一化：
【已完成】

| node type 模式 | 替换 |
|---|---|
| `/identifier/i`, `/_name$/i` | `ID` |
| `/string/i`, `/template/i` | `STR` |
| `/number\|int\|float/i` | `NUM` |
| `/comment/i` | 跳过 |
| 其他（关键字、运算符、分隔符） | 保留原值 |

### MinHash(128维) → LSH(b=16, r=8) → Jaccard(≥0.7) → Top-50
【已完成】

```ts
interface ClonePair {
  fileA: string;
  fileB: string;
  jaccardSimilarity: number;
  matchingKGrams: number;
}
```

## 扫描配置（用户可选）
【未完成，当前前端使用默认配置上传】

上传 ZIP 后弹出配置面板：

```
┌───────────────────────────────────────┐
│  扫描配置                              │
├───────────────────────────────────────┤
│  分析引擎                              │
│  [✓] 静态分析（规则 + 指标）            │
│  [✓] 代码克隆检测                      │
│                                       │
│  目标语言（至少选一个）                  │
│  [✓] Python  [✓] Java  [✓] C          │
│                                       │
│  克隆检测阈值                           │
│  [========●====] 0.7                  │
│                                       │
│         [ 开始扫描 ]                    │
└───────────────────────────────────────┘
```

```ts
interface ScanOptions {
  engines: {
    rules: boolean;
    cloneDetection: boolean;
  };
  languages: string[];       // ['python', 'java', 'c']
  cloneThreshold: number;    // default 0.7
}
```

后端 `/api/review` 接收 `multipart/form-data`（ZIP + `projectKey` + `scanOptions` JSON）。
【实现方式调整：当前后端使用 `/api/analyze`，支持 ZIP/单文件 + `projectKey` + 可选 `scanOptions` JSON】

## API 设计

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/review` | 【实现方式调整：已改为 `POST /api/analyze`】上传 ZIP + 配置 → 执行分析 → 返回 ScanReport |
| GET | `/api/health` | 【已完成】健康检查（已有） |

```ts
interface ScanReport {
  projectKey: string;
  scannedAt: string;
  durationMs: number;
  metrics: ProjectMetrics;
  fileMetrics: FileMetrics[];
  findings: Finding[];
  clonePairs: ClonePair[];
}
```
【已完成】

## PDF 报告导出
【未完成】

POST `/api/report/pdf`，body 传入 `ScanReport` → 后端渲染 HTML → Puppeteer 输出 PDF。

报告四模块：

```
一、项目概览（指标总览表）
二、静态分析 Findings（按严重度排序，标注文件/行号/规则）
三、代码克隆检测（相似度表 + 进度条）
四、文件级明细（每个文件的指标 + Finding 汇总）
```

## 文件清单

| 操作 | 文件 | 说明 |
|---|---|---|
| 新建 | `backend/src/services/analysisEngine.ts` | 【已完成，规则匹配未接入】核心：解析 + 规则 + 指标 + token 归一化 |
| 新建 | `backend/src/services/cloneService.ts` | 【已完成，路径调整为 `backend/src/services/clone/cloneService.ts`】MinHash + LSH + Jaccard |
| 新建 | `backend/src/services/rules/index.ts` | 【已完成】规则注册中心 |
| 新建 | `backend/src/services/rules/python.rules.ts` | 【已完成】Python 规则定义 |
| 新建 | `backend/src/services/rules/java.rules.ts` | 【已完成】Java 规则定义 |
| 新建 | `backend/src/services/rules/c.rules.ts` | 【已完成】C 规则定义 |
| 新建 | `backend/src/services/reportService.ts` | 【未完成】PDF 报告生成 |
| 新建 | `frontend/src/components/ScanConfigModal.tsx` | 【未完成】扫描配置面板 |
| 新建 | `frontend/src/components/FindingsViewer.tsx` | 【未完成】Finding 列表展示 |
| 新建 | `frontend/src/components/CloneDetectionViewer.tsx` | 【实现方式调整：已直接集成在 `frontend/src/App.tsx`】克隆对展示 |
| 新建 | `frontend/src/components/MetricsDashboard.tsx` | 【实现方式调整：已直接集成在 `frontend/src/App.tsx`】指标仪表盘 |
| 修改 | `backend/src/types/index.ts` | 【已完成】新增所有类型定义 |
| 修改 | `backend/src/index.ts` | 【实现方式调整：已改为 `/api/analyze`，PDF 路由未完成】`/api/review` 改造 + PDF 路由 |
| 修改 | `frontend/src/types.ts` | 【已完成】同步类型 |
| 修改 | `frontend/src/App.tsx` | 【已完成：结果展示；未完成：配置面板】集成配置面板 + 结果展示 |
| 修改 | `backend/package.json` | 【已完成，额外添加 `tree-sitter-cpp`】添加 tree-sitter 依赖 |

## 依赖

```json
"tree-sitter": "^0.22.0",
"tree-sitter-python": "^0.23.0",
"tree-sitter-java": "^0.23.0",
"tree-sitter-c": "^0.23.0",
"puppeteer": "^24.0.0",
"react-dom": "^19.0.0"
```
【已完成：tree-sitter 相关依赖，额外添加 `tree-sitter-cpp`；未完成：Puppeteer；实现方式调整：当前 ReactDOM 使用项目原有 18.x】

## 与现有 SonarQube 功能的关系

【已完成】本模块**完全独立**于 SonarQube，不依赖 `sonar-scanner`。
【实现方式调整：旧 SonarQube/LLM 代码已清理，不再并存】现有的 SonarQube 扫描功能保留不变，两个分析管线并存：

- 【已移除】SonarQube 管线：`POST /api/review`（sonar 模式，保留原有行为）
- 【已完成】tree-sitter 管线：`POST /api/analyze`（新路由，纯 tree-sitter 分析）

## 约束

- 【已完成】全部 TypeScript，MinHash/LSH 自行实现
- 【部分完成：指标与克隆复用同一次 parse，规则链路未完成】一次 tree-sitter parse 复用给三条链路
- 【已完成：语言路由；未完成：规则自动匹配】不同语言规则自动匹配，未匹配扩展名跳过
- 【已完成：规则文件组织】规则用独立文件按语言组织，新增语言只需新增规则文件 + parser 依赖
- 【已完成：单文件和 ZIP；未完成：GitHub URL】支持单个文件、ZIP 包（≤100MB）、GitHub URL 三种上传方式
