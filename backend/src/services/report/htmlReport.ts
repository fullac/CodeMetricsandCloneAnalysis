import type { StaticAnalysisFileMetrics, StaticAnalysisFunctionMetric, StaticAnalysisScanReport } from "../../types/index.js";

type FunctionRow = StaticAnalysisFunctionMetric & {
  file: string;
  language: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatPercent(value: number): string {
  return `${formatNumber(value * 100, 1)}%`;
}

function fileMaxComplexity(file: StaticAnalysisFileMetrics): number {
  return file.functions.reduce((max, item) => Math.max(max, item.complexity), 0);
}

function renderMetric(label: string, value: string, sub = ""): string {
  return `
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
      ${sub ? `<div class="metric-sub">${escapeHtml(sub)}</div>` : ""}
    </article>
  `;
}

function renderFileRows(files: StaticAnalysisFileMetrics[]): string {
  return files.map((file) => `
    <tr>
      <td class="code">${escapeHtml(file.file)}</td>
      <td>${escapeHtml(file.language)}</td>
      <td class="num">${formatNumber(file.ncloc)}</td>
      <td class="num">${formatNumber(file.totalLines)}</td>
      <td class="num">${formatNumber(file.commentLines)}</td>
      <td class="num">${formatNumber(file.functionCount)}</td>
      <td class="num">${formatNumber(file.classCount)}</td>
      <td class="num">${formatNumber(file.importCount)}</td>
      <td class="num">${formatNumber(fileMaxComplexity(file))}</td>
    </tr>
  `).join("");
}

function renderFunctionRows(functions: FunctionRow[]): string {
  if (functions.length === 0) {
    return `<tr><td colspan="7" class="empty">未识别到函数定义</td></tr>`;
  }

  return functions.map((fn) => `
    <tr>
      <td>${escapeHtml(fn.name)}</td>
      <td class="code">${escapeHtml(`${fn.file}:${fn.startLine}`)}</td>
      <td>${escapeHtml(fn.language)}</td>
      <td class="num">${formatNumber(fn.lines)}</td>
      <td class="num">${formatNumber(fn.complexity)}</td>
      <td class="num">${formatNumber(fn.nestingDepth)}</td>
      <td class="num">${formatNumber(fn.paramCount)}</td>
    </tr>
  `).join("");
}

function renderCloneRows(report: StaticAnalysisScanReport): string {
  if (report.clonePairs.length === 0) {
    return `<tr><td colspan="4" class="empty">未检测到跨文件或同文件重复代码段</td></tr>`;
  }

  return report.clonePairs.map((pair) => `
    <tr>
      <td class="code">${escapeHtml(pair.startLineA ? `${pair.fileA}:${pair.startLineA}-${pair.endLineA}` : pair.fileA)}</td>
      <td class="code">${escapeHtml(pair.startLineB ? `${pair.fileB}:${pair.startLineB}-${pair.endLineB}` : pair.fileB)}</td>
      <td class="num">${formatPercent(pair.jaccardSimilarity)}</td>
      <td class="num">${formatNumber(pair.matchingKGrams)}</td>
    </tr>
  `).join("");
}

function renderFindingRows(report: StaticAnalysisScanReport): string {
  if (report.findings.length === 0) {
    return `<tr><td colspan="5" class="empty">未发现规则问题</td></tr>`;
  }
  return report.findings.map((finding) => `
    <tr>
      <td>${escapeHtml(finding.severity)}</td>
      <td>${escapeHtml(finding.ruleId)}</td>
      <td class="code">${escapeHtml(finding.file)}</td>
      <td class="num">${formatNumber(finding.line)}:${formatNumber(finding.column)}</td>
      <td>${escapeHtml(finding.message)}</td>
    </tr>
  `).join("");
}

export function renderAnalysisReportHtml(report: StaticAnalysisScanReport): string {
  const functions = report.fileMetrics.flatMap((file) => file.functions.map((fn) => ({
    ...fn,
    file: file.file,
    language: file.language,
  })));

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.projectKey)} - 静态分析报告</title>
  <style>
    @page { size: A4; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111113;
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif;
      font-size: 12px;
      line-height: 1.45;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding-bottom: 14px;
      border-bottom: 1px solid #ded9e8;
    }
    h1, h2 { margin: 0; letter-spacing: 0; }
    h1 { font-size: 22px; line-height: 1.2; }
    h2 { font-size: 15px; margin: 24px 0 10px; }
    .meta {
      margin-top: 7px;
      color: #6d6875;
      font-size: 11px;
    }
    .badge {
      align-self: flex-start;
      border: 1px solid #bca8e8;
      border-radius: 6px;
      background: #ede9fe;
      color: #4c1d95;
      padding: 5px 8px;
      font-weight: 600;
      white-space: nowrap;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-top: 16px;
    }
    .metric-card {
      min-height: 72px;
      border: 1px solid #e4e0ea;
      border-radius: 8px;
      background: #faf9fb;
      padding: 10px;
    }
    .metric-label {
      color: #6d6875;
      font-size: 10px;
      font-weight: 650;
    }
    .metric-value {
      margin-top: 8px;
      font-size: 18px;
      line-height: 1.1;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .metric-sub {
      margin-top: 5px;
      color: #6d6875;
      font-size: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      page-break-inside: auto;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th, td {
      border-bottom: 1px solid #ebe7f0;
      padding: 7px 6px;
      vertical-align: top;
      word-break: break-word;
    }
    th {
      background: #f4f1f8;
      color: #6d6875;
      font-size: 10px;
      font-weight: 700;
      text-align: left;
    }
    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 10px;
    }
    .empty {
      color: #6d6875;
      text-align: center;
      padding: 14px;
    }
    .section { page-break-inside: avoid; }
    .gate-pass { color: #166534; }
    .gate-fail { color: #991b1b; }
    .deduction { color: #991b1b; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>静态分析报告：${escapeHtml(report.projectKey)}</h1>
      <div class="meta">扫描时间：${escapeHtml(new Date(report.scannedAt).toLocaleString("zh-CN"))} ｜ 耗时：${formatNumber(report.durationMs)} ms</div>
    </div>
    <div class="badge">Tree-sitter Report</div>
  </header>

  <section class="metric-grid">
    ${report.score ? renderMetric("质量得分", `${formatNumber(report.score.score, 1)} / ${formatNumber(report.score.maxScore)}`, `${report.score.passed ? "评分通过" : "评分未通过"}，通过线 ${formatNumber(report.score.passScore, 1)}`) : ""}
    ${renderMetric("文件数", formatNumber(report.fileMetrics.length))}
    ${renderMetric("代码行", formatNumber(report.metrics.ncloc), `总行数 ${formatNumber(report.metrics.totalLines)}`)}
    ${renderMetric("注释密度", formatPercent(report.metrics.commentDensity))}
    ${renderMetric("函数数", formatNumber(report.metrics.functionCount), `类/结构 ${formatNumber(report.metrics.classCount)}`)}
    ${renderMetric("平均复杂度", formatNumber(report.metrics.avgComplexity, 1), `最大 ${formatNumber(report.metrics.maxComplexity)}`)}
    ${renderMetric("超长函数", formatNumber(report.metrics.overLongFunctions), "按本次评分标准统计")}
    ${renderMetric("深层嵌套", formatNumber(report.metrics.deeplyNestedFunctions), "按本次评分标准统计")}
    ${renderMetric("克隆率", formatPercent(report.metrics.cloneRate), `${formatNumber(report.clonePairs.length)} clone pairs`)}
  </section>

  ${report.score ? `<section>
    <h2>评分标准</h2>
    <p class="${report.score.passed ? "gate-pass" : "gate-fail"}"><strong>${report.score.passed ? "通过" : "未通过"}</strong> ｜ 档案 ${escapeHtml(report.score.profileId)} v${escapeHtml(report.score.profileVersion)} ｜ 来源 ${escapeHtml(report.score.provenance)}</p>
    <table><thead><tr><th>扣分项</th><th class="num">次数</th><th class="num">扣分</th></tr></thead><tbody>${report.score.deductions.length === 0 ? `<tr><td colspan="3" class="empty">暂无扣分项</td></tr>` : report.score.deductions.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td class="num">${item.count === undefined ? "-" : formatNumber(item.count)}</td><td class="num deduction">-${formatNumber(item.points, 1)}</td></tr>`).join("")}</tbody></table>
  </section>` : ""}

  <section>
    <h2>规则问题</h2>
    <table>
      <thead><tr><th>Severity</th><th>Rule</th><th>File</th><th class="num">Line</th><th>Message</th></tr></thead>
      <tbody>${renderFindingRows(report)}</tbody>
    </table>
  </section>

  <section>
    <h2>文件级指标</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 27%;">File</th>
          <th style="width: 9%;">Lang</th>
          <th class="num">NCloc</th>
          <th class="num">Lines</th>
          <th class="num">Comments</th>
          <th class="num">Functions</th>
          <th class="num">Classes</th>
          <th class="num">Imports</th>
          <th class="num">Max Cx</th>
        </tr>
      </thead>
      <tbody>${renderFileRows(report.fileMetrics)}</tbody>
    </table>
  </section>

  <section>
    <h2>函数级指标</h2>
    <table>
      <thead>
        <tr>
          <th style="width: 18%;">Function</th>
          <th style="width: 31%;">File</th>
          <th style="width: 9%;">Lang</th>
          <th class="num">Lines</th>
          <th class="num">Complexity</th>
          <th class="num">Nesting</th>
          <th class="num">Params</th>
        </tr>
      </thead>
      <tbody>${renderFunctionRows(functions)}</tbody>
    </table>
  </section>

  <section>
    <h2>克隆检测</h2>
    <table>
      <thead>
        <tr>
          <th>File A</th>
          <th>File B</th>
          <th class="num" style="width: 14%;">Similarity</th>
          <th class="num" style="width: 16%;">重复代码片段数</th>
        </tr>
      </thead>
      <tbody>${renderCloneRows(report)}</tbody>
    </table>
  </section>
</body>
</html>`;
}
