# 0506 
1. 创建最小权限的sonar账号用于生成token，提供服务

# 0507
1. SonarQube CE会自动拉取最新版，但是db不会自动更新，sonar提示正在维护，日志提示如下：
```bash
code-analysis-sq  | 2026.05.07 08:46:15 INFO  web[][o.s.s.p.Platform] Database needs to be migrated. Please refer to https://docs.sonarsource.com/sonarqube-community-build/server-upgrade-and-maintenance/upgrade/roadmap/
```
此时需要在`/setup`手动更新数据库。
因此要么在`.yml`中锁定Sq版本和db版本，要么每次提示时都做一次备份和更新。
```yml
image: sonarqube:26.4.0-community
image: postgres:15.13
```
# 0512

1. 给大模型的issue等切片上下文需要调整

# 0609

1. 安装 tree-sitter 依赖时，普通沙箱里 `npm install` 可能因无法访问 npm registry 失败：
```bash
npm error network request to https://registry.npmjs.org/tree-sitter failed
npm error code ENOTFOUND
```
需要允许网络后重新执行安装。

2. `tree-sitter-java@0.23.5` 与 `tree-sitter@0.22.x` 有 peer dependency 冲突，Python/C parser 又依赖 `tree-sitter@^0.22.1`。当前可用处理方式是不使用 `--force`，改用 legacy peer resolution：
```bash
npm install tree-sitter@^0.22.0 tree-sitter-python@^0.23.0 tree-sitter-java@^0.23.0 tree-sitter-c@^0.23.0 --legacy-peer-deps
```

3. Node 侧使用 parser 时，`setLanguage` 需要传 parser 包导出的整个对象，而不是 `.language` 字段：
```ts
parser.setLanguage(Python);
```
如果写成 `parser.setLanguage(Python.language)`，运行时可能在读取 `tree.rootNode` 时报：
```bash
TypeError: Cannot read properties of undefined (reading 'xxx')
```

4. `npm audit` 的 3 个 moderate vulnerabilities 来自 `express -> body-parser -> qs` 链路，根因是 `qs` 的 DoS advisory。普通 `npm audit fix` 会被 tree-sitter peer 冲突挡住，使用：
```bash
npm audit fix --legacy-peer-deps
npm audit --audit-level=moderate
```
修复后版本为 `express@4.22.2`、`body-parser@1.20.5`、`qs@6.15.2`，audit 结果为 `found 0 vulnerabilities`。
