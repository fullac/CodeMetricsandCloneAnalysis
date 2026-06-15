import { useMemo, useState } from "react";
import UploadPanel from "./components/UploadPanel";
import type { StaticAnalysisFileMetrics, StaticAnalysisFunctionMetric, StaticAnalysisScanReport } from "./types";

type FunctionRow = StaticAnalysisFunctionMetric & {
  file: string;
  language: string;
};

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString(undefined, {
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

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <article className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </article>
  );
}

export default function App() {
  const [result, setResult] = useState<StaticAnalysisScanReport | null>(null);
  const [error, setError] = useState("");

  const functionRows = useMemo<FunctionRow[]>(() => {
    return (result?.fileMetrics ?? []).flatMap((file) =>
      file.functions.map((fn) => ({
        ...fn,
        file: file.file,
        language: file.language,
      }))
    );
  }, [result?.fileMetrics]);

  return (
    <main className="app-shell">
      <div className="content-frame">
        <header className="surface-panel hero-panel reveal">
          <div>
            <div className="eyebrow">Code Metrics Analysis & Clone Recognition</div>
            <h1>多语言代码分析与克隆检测平台</h1>
          </div>
          <div className="hero-stats" aria-label="analysis capabilities">
            <span>AST  </span>
            <span>Metrics</span>
            <span>Clone</span>
          </div>
        </header>

        <UploadPanel
          onDone={(data) => {
            setResult(data);
            setError("");
          }}
          setError={setError}
        />

        {error && <div className="error-panel reveal">{error}</div>}

        {result && (
          <>
            <section className="metrics-grid reveal">
              <MetricTile label="项目" value={result.projectKey} sub={new Date(result.scannedAt).toLocaleString()} />
              <MetricTile label="文件数" value={formatNumber(result.fileMetrics.length)} sub={`${formatNumber(result.durationMs)} ms`} />
              <MetricTile label="代码行" value={formatNumber(result.metrics.ncloc)} sub={`总行数 ${formatNumber(result.metrics.totalLines)}`} />
              <MetricTile label="注释密度" value={formatPercent(result.metrics.commentDensity)} sub="AST comment nodes" />
              <MetricTile label="函数数" value={formatNumber(result.metrics.functionCount)} sub={`类/结构 ${formatNumber(result.metrics.classCount)}`} />
              <MetricTile label="平均复杂度" value={formatNumber(result.metrics.avgComplexity, 1)} sub={`最大 ${formatNumber(result.metrics.maxComplexity)}`} />
              <MetricTile label="超长函数" value={formatNumber(result.metrics.overLongFunctions)} sub="> 100 lines" />
              <MetricTile label="克隆率" value={formatPercent(result.metrics.cloneRate)} sub={`${formatNumber(result.clonePairs.length)} clone pairs`} />
            </section>

            <section className="surface-panel data-section reveal">
              <div className="section-heading">
                <h2>文件级指标</h2>
                <span className="count-badge">{formatNumber(result.fileMetrics.length)} files</span>
              </div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Lang</th>
                      <th className="numeric">NCloc</th>
                      <th className="numeric">Lines</th>
                      <th className="numeric">Comments</th>
                      <th className="numeric">Functions</th>
                      <th className="numeric">Classes</th>
                      <th className="numeric">Imports</th>
                      <th className="numeric">Max Cx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.fileMetrics.map((file) => (
                      <tr key={file.file}>
                        <td className="code-cell">{file.file}</td>
                        <td>{file.language}</td>
                        <td className="numeric">{formatNumber(file.ncloc)}</td>
                        <td className="numeric">{formatNumber(file.totalLines)}</td>
                        <td className="numeric">{formatNumber(file.commentLines)}</td>
                        <td className="numeric">{formatNumber(file.functionCount)}</td>
                        <td className="numeric">{formatNumber(file.classCount)}</td>
                        <td className="numeric">{formatNumber(file.importCount)}</td>
                        <td className="numeric">{formatNumber(fileMaxComplexity(file))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="surface-panel data-section reveal">
              <div className="section-heading">
                <h2>函数级指标</h2>
                <span className="count-badge">{formatNumber(functionRows.length)} functions</span>
              </div>

              {functionRows.length === 0 ? (
                <div className="empty-panel">未识别到函数定义</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Function</th>
                        <th>File</th>
                        <th>Lang</th>
                        <th className="numeric">Lines</th>
                        <th className="numeric">Complexity</th>
                        <th className="numeric">Nesting</th>
                        <th className="numeric">Params</th>
                      </tr>
                    </thead>
                    <tbody>
                      {functionRows.map((fn) => (
                        <tr key={`${fn.file}:${fn.startLine}:${fn.name}`}>
                          <td className="strong-cell">{fn.name}</td>
                          <td className="code-cell">{fn.file}:{fn.startLine}</td>
                          <td>{fn.language}</td>
                          <td className="numeric">{formatNumber(fn.lines)}</td>
                          <td className="numeric">{formatNumber(fn.complexity)}</td>
                          <td className="numeric">{formatNumber(fn.nestingDepth)}</td>
                          <td className="numeric">{formatNumber(fn.paramCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="surface-panel data-section reveal">
              <div className="section-heading">
                <h2>克隆检测</h2>
                <span className="count-badge">{formatNumber(result.clonePairs.length)} pairs</span>
              </div>

              {result.clonePairs.length === 0 ? (
                <div className="empty-panel">未检测到超过阈值的克隆文件对</div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>File A</th>
                        <th>File B</th>
                        <th className="numeric">Similarity</th>
                        <th className="numeric">Matching K-Grams</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.clonePairs.map((pair) => (
                        <tr key={`${pair.fileA}:${pair.fileB}`}>
                          <td className="code-cell">{pair.fileA}</td>
                          <td className="code-cell">{pair.fileB}</td>
                          <td className="numeric">{formatPercent(pair.jaccardSimilarity)}</td>
                          <td className="numeric">{formatNumber(pair.matchingKGrams)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
