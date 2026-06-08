# 0506
## 1
### function：
1. 增加LLM诊断issue功能，实现将用户选择的`severity = high`的issue描述和代码片段传递给LLM，以进行issue有效性判断和提供改进意见。
功能细节：
- 用户尝试进行LLM诊断时，首先需要选择issue，选择时需要提供issue的详细信息，包括代码片段，支持全选；
- issue传给LLM时应使用xml标签封装，且一次上传的数量不应太多，保证上下文长度合适即可；
- LLM返回issue的有效性以及改进意见，最终在原有的issue列表上，每条issue单列一个LLM诊断结果展示即可。

### optimize：
1. 优化/美化前端UI。
2. 用户在上传文件进行解析后，页面将直接呈现静态解析结果，包括静态解析指标数据和issue列表。
3. LLM评估项目功能改成由用户触发而不是在上传后自动触发。
4. sonar静态解析结果不直接展示数字结果，而是使用图表的形式，例如雷达图。

## 2

### function：
1. 增加删除记录按键，用于在sonar平台和数据库中删除**此次**sonar解析结果。
2. 平台中的上传项目的`project key`自动填充为文件名称(不包含扩展名)，下方显示sonar`project key`的命名规范。未上传文件时留空而非显示为demo project。
3. 增加security hotpots list，位置在issue list下方，项目整体评估上方。该列表显示所有security hotpots，其余功能和issue list一样。

### optimize：
1. 项目整体评估移动至issue list下面。
2. 雷达图应当采用sonar的A-E评分来绘制，并且在鼠标悬浮时，或在每个维度旁边，可以显示实际的指标结果。
3. 优化issue list:
   - 仅显示`severity = high`的issue，其余暂时先不读取和展示。
   - 上传issue给llm时，用户所选数量超过阈值时不会有任何提示，而是在后端分批发送给LLM评估，所有issue评估完成后，再在前端展示。
   - 要求LLM用中文回答。
   - 适当增加issue信息的容器宽度，减少代码片段的容器宽度。

### debug：
1. 诊断issue时在静态分析与上传文件之间的缝隙出现报错框：
```json
Call LLM issue diagnosis failed: LLM issue diagnosis parse failed. Raw: ```json [ { "issueKey": "48bdcadb-1562-4dd6-860a-748e0f966a58", "valid": true, "advice": "定义一个常量来存储该字符串，减少代码重复" }, { "issueKey": "fa1ef59f-44f4-4581-b12a-6ea72415df48", "valid": true, "advice": "定义一个常量来存储该字符串，减少代码重复" } ] ```
```

# 0507
## 3
### function:
1. 增加前端展示sonar的扫描进度，暂时先直接展示后端sonar扫描的提示语。

### optmize:
1. backend：增加输出所有的LLM的返回结果和此次问答的时间（如果可以获取时间），以便进行查看和测试。
2. 列表标题和全选按键：固定在列表最上方而非能被滚动。
3. 代码片段容器和列表容器：让二者宽度相同。
4. 静态指标雷达图：维度只有三个，应该增加可读性（readability），且安全性应当使用sonar的安全热点（Security Hotspots）对应的评级。
5. 【诊断已选High Issue (0)】【诊断已选Hotspot (0)】：这两个按键需要固定在各自列表的上方，请结合优化问题3，将这些组件调整至合适的布局。
6. 请仔细评估此条需求：上传文件后存在返回了空数据结果的情况，但是sonar解析没有问题，请确保上传后后端解析完成后自动返回数据，而不需要前端一直请求。
7. 页面底部增加一点空白，以免llm评估的那一块在最底下。
8. 美化UI，让页面更有活力和科技感。

# 0511
## 4
### debug:
1. 诊断结果中，删除原始输出，保留“是否有效｜LLM诊断建议”
   
### optimize:
1. LLM诊断功能 用户故事：用户点击LLM诊断按键，网页弹出将要上传给LLM的issue代码片段，用于给用户选择，选择完成后上将代码信息嵌入prompt交由LLM诊断，最后在网页中显示每条issue“是否有效｜LLM诊断建议”，在后端打印完整的LLM返回结果。issue只向sonar api请求high issue。



## 5

### optimize:
1. 在诊断的弹窗中增加全选按键。
2. 在页面的列表中移除全选和单条issue的选择。
3. 对security hotpots也增加同issue list一样的弹窗选择，security hotpots需要显示所有的热点，在选择时也支持选择所有的热点而无需限制仅high
4. 优化本项目的UI，需要更加具有科技感和现代感的风格，现在的风格有点像十几年前的博客，感觉不太行呢，能不能修改成2026年网页该有的风格。修改范围包括前端代码和样式，不包括前端所展示的文字内容。



# 0608
## 6 
### funtion:
1. 实现多语言静态指标检测
2. 实现tree-sitter + MinHash + LSH的多语言代码克隆检测

### optimize:
1. 使用[$Redesign Existing Projects]优化当前UI