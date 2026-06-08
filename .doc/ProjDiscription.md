# 角色设定
你是一名资深全栈软件工程架构师。请帮我编写一个“基于 SonarQube 与 LLM 的代码审查网页平台”的完整前后端代码与架构文档。

# 技术栈
- 前端：React + TailwindCSS + Monaco Editor
- 后端：Node.js/Bun
- 引擎与数据库：macOS 本地环境, SonarQube CE (Docker部署), PostgreSQL, sonar-scanner CLI
- LLM：兼容 OpenAI 格式的大模型 API

# 核心业务流
请按以下规范实现核心模块：

1. **项目上传与解析**：提供接收 ZIP 源码包的 API，解压到后端的 `/tmp` 临时目录。
2. **无状态扫描与增量分析**：接收前端传入的固定项目标识作为 `sonar.projectKey`。使用异步子进程在解压目录执行 `sonar-scanner`。必须全部通过 `-D` 命令行参数传递配置（包含全局分析令牌）。严禁在磁盘写入 `sonar-project.properties`。
3. **缺陷提取与 LLM 诊断**：扫描完成后，调用 Sonar Web API 获取主要缺陷。截取缺陷行上下 10 行源码作为上下文，调用 LLM 获取修复建议。
4. **源码清理与状态保留**：在 `finally` 块中，仅删除 `/tmp` 下的本地临时源码目录。**绝对不要**删除 SonarQube 平台上的项目记录，以保留数据库中的代码扫描历史趋势。

# 交付要求
1. 提供前后端目录结构划分与核心 `package.json` 依赖。
2. 提供后端执行“参数化扫描”、“增量数据提取”和“本地源码清理”的核心异步逻辑代码（含 Try-Catch）。
3. 提供前端包含文件上传进度、Monaco Editor 源码高亮展示区的核心组件代码。
4. 提供一份结构严谨的系统架构说明文档（Markdown 格式），重点突出“大模型上下文精简”与“Sonar 历史数据留存”机制，需要适合直接用于学术组会汇报。