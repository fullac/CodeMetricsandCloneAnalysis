# tree-sitter 静态分析与克隆检测实施计划

## 工期评估

整体 MVP 预计 **8-12 个工作日**。如果只要求 ZIP 输入、三语言规则与指标、克隆检测、基础前端展示，不含 GitHub URL 输入和 PDF 美化，偏向 8-9 天；如果补齐 GitHub URL、PDF 报告细节、规则误报修正和端到端联调，偏向 11-12 天。

主要风险：

- `tree-sitter` 原生依赖安装和 Docker 构建兼容性需要验证。
- 规则 query 只能覆盖一部分简单模式，资源泄漏、空指针顺序等规则需要 AST walk 辅助，不能只靠 query。
- 现有 `ProjectMetrics` 已用于 SonarQube 字符串指标，新 tree-sitter 主流程使用独立 `Static*` 类型，避免迁移过程中混淆。
- 需求中 `/api/review` 与 `/api/analyze` 描述不一致，计划按“新功能完全不依赖 SonarQube，主流程走 `/api/analyze`；旧 Sonar 代码仅暂存为 legacy，不作为运行前提”执行。

## 阶段计划

### P1 契约与骨架（0.5-1 天）

- 新增静态分析类型：扫描选项、Finding、文件/函数指标、克隆对、扫描报告。
- 新增三语言规则注册文件，先沉淀规则元数据和 query/walk 标记。
- 保留 SonarQube 类型不动，仅作为 legacy 边界；新增类型必须能支撑无 SonarQube 的独立主流程。

验收：

- 后端和前端 TypeScript 构建通过。
- 新类型与现有 `ProjectMetrics` 无命名冲突。

### P2 输入与文件收集（1 天）

- 新增 `/api/analyze`，支持 ZIP 上传和单文件上传，作为新的默认分析入口。
- 复用现有临时目录策略，扫描完成后删除临时文件。
- 实现排除目录和 Python/Java/C 扩展名路由。

验收：

- 上传 ZIP 后可在未启动 SonarQube、未配置 sonar-scanner 的环境下返回分析结果骨架。
- `/api/analyze` 不调用 `sonar-scanner`、Sonar Web API 或 LLM 诊断。

### P3 tree-sitter 解析与规则引擎（2-3 天）

- 安装并验证 `tree-sitter`、`tree-sitter-python`、`tree-sitter-java`、`tree-sitter-c`。
- 实现一次 parse 结果复用。
- 实现 query 规则和必要 AST walk 规则，输出 Finding。

验收：

- Python/Java/C 各至少 6 条规则可命中示例代码。
- Finding 包含文件、行列、规则、严重级别和上下文片段。

### P4 指标计算（1.5-2 天）

- 实现文件级 LOC/NCloc/commentDensity/functionCount/classCount/importCount。
- 实现函数级 complexity/lines/nestingDepth/paramCount。
- 聚合项目级指标和超标函数数。

验收：

- 三语言函数和类/导入统计基本准确。
- 指标和 Finding 能在同一份 AST 上计算。

### P5 克隆检测（1.5-2 天）

- 实现 AST 叶子 token 归一化、k-gram、MinHash(128)、LSH(16x8)。
- 计算 Jaccard，相似度阈值默认 0.7，返回 Top-50。
- 计算 clone lines 和 cloneRate。

验收：

- 重复函数或复制文件可稳定生成 ClonePair。
- 阈值变化会影响返回结果。

### P6 前端集成（1-1.5 天）

- 新增扫描配置面板，选择分析引擎、语言、克隆阈值。
- 新增 Findings、CloneDetection、MetricsDashboard 展示组件。
- 在 `App.tsx` 中把 tree-sitter 分析作为默认主流程，旧 SonarQube 视图不参与新扫描链路。

验收：

- 用户可选择 tree-sitter 分析并看到指标、Finding、克隆对。
- 前端完成一次扫描不需要 SonarQube 服务、token 或 sonar-scanner。

### P7 PDF 报告与收尾（1-1.5 天）

- 新增 `/api/report/pdf`，基于 ScanReport 渲染 A4 PDF。
- 补齐 Docker 构建依赖、README/使用说明。
- 做端到端回归：tree-sitter `/api/analyze`、PDF 导出、无 SonarQube 环境启动。

验收：

- PDF 包含项目概览、Findings、克隆检测、文件级明细。
- Docker 环境可以在不启动 SonarQube 容器的情况下构建并运行。

## 当前第一次变更

本次执行 P1：

- 新增 `backend/src/services/rules/*` 规则注册骨架。
- 扩展 `backend/src/types/index.ts` 和 `frontend/src/types.ts` 的静态分析类型。
- 不新增任何 SonarQube 依赖；后续阶段会把 tree-sitter 管线接成默认主流程。

## 当前进展

已完成：

- P1 契约与骨架。
- P2 中的 `/api/analyze`、ZIP/单文件上传、临时目录清理、排除目录、语言路由。
- P4 中的文件级指标、函数级指标和项目级聚合。
- P5 中的 MinHash + LSH 克隆检测、cloneRate 聚合和指纹轻量存储。
- P6 中的前端 tree-sitter 上传与指标结果展示。

暂未实现：

- 规则匹配 Findings。
- PDF 报告导出。

## P8 架构与插件化重构（当前任务）

目标：参考 `fuck-u-code` 的 `analyzer`、`file-discovery`、`metrics`、`scoring` 分层方式，先完成当前 tree-sitter 分析链路的架构拆分、metric 插件化和文件发现优化。评分模型本阶段只保留目录和接口占位，后续单独实现。

本次范围：

- 保留 `backend/src/services/analysisEngine.ts` 作为 `/api/analyze` 兼容入口，只负责上传输入准备、scanOptions 解析、调用分析流水线和清理临时文件。
- 新增 `backend/src/services/analysis/`，拆出分析编排、语言配置、parser 缓存和文件发现。
- 新增 `backend/src/services/metrics/`，通过 `MetricPlugin`、`MetricContext`、`FileMetricAccumulator` 承载现有 LOC、注释、函数、类、导入、复杂度、函数长度、嵌套深度和参数数量指标。
- 新增 `backend/src/services/scoring/`，只放评分模型占位类型和入口，不改变 `StaticAnalysisScanReport`，不向前端暴露 score 字段。
- 文件发现支持 ZIP 解压后读取根目录和嵌套 `.gitignore`，并继续保留 `.git`、`node_modules`、`dist`、`build`、`__pycache__`、`.venv`、`target`、`vendor` 等性能排除目录。

验收：

- `/api/analyze` 请求和响应保持兼容。
- `StaticAnalysisScanOptions`、`StaticAnalysisScanReport`、`StaticAnalysisFileMetrics`、`StaticAnalysisProjectMetrics` 对前端保持不变。
- 后端 TypeScript 构建通过。
- 前端无需 UI 改造即可继续构建通过。

仍留后续：

- 规则匹配 Findings。
- 评分模型正式实现和前端展示。
- PDF 报告导出。

## P9 指标扩展路线（后续任务）

目标：在现有 metric 插件化架构上继续扩展指标，优先补齐更能反映“可读性/维护成本”的指标。参考 `fuck-u-code` 的指标分类，但不直接照搬评分模型；每个指标先作为独立插件输出文件级或函数级结果，等评分模型阶段再统一加权。

优先实现：

- 认知复杂度 cognitive complexity：基于 tree-sitter AST walk 计算 `if/else if`、循环、`switch/case`、`catch`、三元表达式、复杂布尔表达式和嵌套层级带来的阅读成本。它和当前 cyclomatic complexity 不重复，当前复杂度偏路径数量，认知复杂度偏人理解代码的难度。
- 结构复杂度 structure analysis：统计单文件函数数、类/结构体数量、顶层声明密度、函数过度集中等，用来发现“大文件/职责过多”的文件。
- 命名规范 naming convention：按语言检查函数、类、常量、变量的基础命名风格，例如 Python snake_case、Java class PascalCase、C/C++ 宏大写等。
- 错误处理 error handling：识别空 catch、过宽异常捕获、返回错误码未检查、资源打开后缺少释放等模式；这类指标可先输出风险计数，后续再和规则 Findings 打通。

可继续补充：

- 注释质量 comment quality：在已有 comment density 之外，区分纯噪声注释、TODO/FIXME、过低注释密度和过高注释密度。
- 重复度细分 duplication detail：在已有 cloneRate 之外，增加重复块位置、重复 token 数、重复函数数和历史重复来源。
- 文件长度/file length 与函数长度/function length 分级：当前已有超长函数计数，后续可输出 top offenders 和 severity。
- 参数复杂度 parameter complexity：当前已有参数数量，后续可识别过多默认参数、可变参数、指针/引用复杂参数等。
- 依赖/导入复杂度 import dependency：统计导入数量、跨目录依赖、可能的循环依赖入口，为后续架构分析做准备。

验收：

- 每个新增指标都是独立 `MetricPlugin`，不把逻辑重新塞回 `analysisEngine.ts`。
- 指标计算复用同一份 tree-sitter parse result，不重复 parse 文件。
- 新指标先进入后端结果类型或内部聚合，前端展示和评分权重可以分阶段接入。
- 后端 TypeScript 构建通过，并用小样例覆盖认知复杂度的分支、循环和嵌套场景。
