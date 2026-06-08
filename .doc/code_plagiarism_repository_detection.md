# 面向代码库的检索式抄袭检测方案

这种场景本质上不是“两两文件比对”，而是做一个**代码指纹库 + 新项目检索鉴定系统**。流程可以分成两条线：

```text
历史项目入库：解析 -> 归一化 -> 提取指纹/特征 -> 建索引
新项目检测：解析 -> 提取同样特征 -> 检索候选 -> 精细比对 -> 生成证据报告
```

核心目标是：**不要让新项目和库里所有项目暴力两两比较**，而是先用索引快速召回可疑候选，再做深度鉴定。

## 一、建立历史代码库

对已经检测过或存储的项目，做一次离线入库。

每个项目可以拆成几个粒度：

```text
项目级 project
目录级 package/module
文件级 file
类级 class
函数级 function
代码块级 block
```

建议至少做到：**文件级 + 函数级 + token 片段级**。

入库时保存：

```text
project_id
file_path
language
function_name
start_line / end_line
raw_hash
normalized_hash
token_fingerprints
ast_features
string_literals
numeric_constants
api_calls
dependencies
created_at
source_info
```

其中最重要的是多层指纹。

## 二、建立多层索引

不要只建一种索引。建议至少三层。

### 1. 精确哈希索引

用于发现完全复制或轻微路径移动：

```text
raw_file_hash
normalized_file_hash
normalized_function_hash
```

归一化可以包括：

```text
去注释
去多余空白
统一换行
变量名替换成 ID
字符串替换成 STR
数字替换成 NUM
```

如果新项目某个函数的 `normalized_function_hash` 已经存在，基本就是强证据。

### 2. Token 指纹倒排索引

这是最实用的一层。

对每个函数或文件生成 token 序列，然后用 Winnowing / K-gram 生成 fingerprints：

```text
token sequence:
FOR ID IN RANGE NUM IF ID OP NUM RETURN ID

fingerprints:
h1, h2, h3, h4 ...
```

数据库里建立倒排表：

```text
fingerprint -> 出现在哪些 project/file/function
```

新代码来了以后，生成 fingerprint，然后查倒排索引，统计每个历史项目命中了多少指纹。

这样可以快速得到候选：

```text
新项目 A 的 function_x
命中历史项目 P1: 182 个 fingerprint
命中历史项目 P7: 93 个 fingerprint
命中历史项目 P9: 12 个 fingerprint
```

然后只对 P1、P7 做精细比对。

### 3. AST / 结构特征索引

Token 层可以抗格式变化、变量重命名；AST 层可以发现结构性改写。

可以为每个函数提取：

```text
AST 子树 hash
AST path 特征
语句类型序列
控制结构序列
调用表达式模式
```

例如：

```text
FunctionDef -> For -> If -> Assign -> Return
```

也可以建立倒排：

```text
ast_subtree_hash -> project/file/function
```

这层适合识别：变量名改了、注释删了、格式变了，但代码结构基本没变。

## 三、新项目检测流程

新项目上传后，执行同样的分析管线：

```text
1. 语言识别
2. 排除第三方库、构建产物、生成文件
3. 按文件/函数切分
4. 代码归一化
5. 生成 hash、token fingerprint、AST feature
6. 查询历史索引
7. 聚合候选项目
8. 对高命中候选做精细比对
9. 输出鉴定报告
```

关键是第 7 步：不要只看单个文件，要聚合到项目级。

例如：

```text
项目 P123：
- 17 个函数高度相似
- 4 个文件存在连续 token 片段重合
- 2 个核心模块 AST 结构相似
- 共同包含 6 个特殊字符串/魔法数字
综合风险：高
```

## 四、候选召回和精排

可以分两阶段。

### 召回阶段：快

目标是从几十万/几百万文件里找出少量候选。

可用方法：

```text
normalized hash
token fingerprint 倒排索引
MinHash + LSH
SimHash + Hamming distance
AST subtree hash 倒排
embedding 向量检索
```

输出 Top-K 候选项目/文件/函数。

### 精排阶段：准

只对候选做更贵的分析：

```text
LCS token 对齐
局部片段匹配
AST 编辑距离
函数调用图相似度
目录结构相似度
特殊常量/字符串重合
公共错误和无用代码检测
```

最后得到一个综合分。

## 五、建议的评分模型

不要只给“总相似度”。可以拆成多个分数：

```text
S_text       文本相似度
S_token      token 指纹相似度
S_ast        AST 结构相似度
S_flow       控制结构相似度
S_project    项目结构相似度
S_special    特殊证据相似度
```

综合分可以类似：

```text
Score =
0.35 * S_token +
0.25 * S_ast +
0.15 * S_project +
0.15 * S_special +
0.10 * S_text
```

其中 `S_special` 很重要，比如：

```text
相同拼写错误
相同魔法数字
相同无用分支
相同调试残留
相同异常信息
相同错误实现
```

这些比普通结构相似更有鉴定价值。

## 六、数据库设计建议

可以用组合存储：

```text
PostgreSQL:
项目、文件、函数、检测结果、报告元数据

Elasticsearch / OpenSearch:
文本检索、token n-gram 检索、路径检索

Redis / RocksDB:
高频 fingerprint 倒排索引

FAISS / Milvus / Qdrant:
代码 embedding 向量检索

对象存储:
原始代码包、归一化代码、分析产物
```

简单版本可以先用：

```text
PostgreSQL + 倒排表 + 本地文件存储
```

不用一开始就上很复杂的架构。

## 七、最小可落地系统

如果要先做 MVP，建议这样：

```text
历史入库：
1. 用 tree-sitter 解析多语言代码
2. 去除注释、空白、第三方目录
3. 提取函数级 token 序列
4. 标识符/字面量归一化
5. 对 token 序列做 Winnowing
6. 保存 fingerprint -> function_id 倒排索引

新项目检测：
1. 同样提取 token fingerprint
2. 查询倒排索引
3. 统计历史项目命中数量
4. 取 Top k 候选项目
5. 对候选做函数级 LCS/AST 精排
6. 输出相似片段和风险等级
```

这已经能覆盖大量真实抄袭场景。

## 八、最终报告示例

```text
检测对象：new_project.zip
历史库规模：12,438 个项目，1,923,440 个函数

最高相似候选：
1. project_2024_0817    综合风险：高
2. project_2023_1120    综合风险：中
3. project_2025_0204    综合风险：低

核心证据：
- src/parser/utils.py 与 project_2024_0817/src/common/parser.py 存在 76% token 指纹重合
- 14 个函数的归一化 AST 结构高度一致
- 两项目均包含相同非必要边界判断：index == -1 时重复 return
- 存在相同错误信息字符串："invaild config path"
- 相似代码集中在核心业务逻辑，而非框架模板
```

## 总结

要做的是**面向代码库的检索式抄袭检测系统**。历史代码先抽取多层静态指纹并建索引；新代码进来后先快速召回候选，再对候选做函数级、结构级、项目级精细鉴定，最后输出可解释证据，而不是单纯返回一个相似度。
