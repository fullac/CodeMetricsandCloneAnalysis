import { useMemo, useState } from "react";
import axios from "axios";
import UploadPanel from "./components/UploadPanel";
import type { StaticAnalysisFileMetrics, StaticAnalysisFunctionMetric, StaticAnalysisScanReport, StaticAnalysisSeverity } from "./types";

type FunctionRow = StaticAnalysisFunctionMetric & {
  file: string;
  language: string;
};

const PAGE_SIZE = 10;

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

function getPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

function getPageItems<T>(items: T[], page: number): T[] {
  const start = (page - 1) * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

async function extractErrorMessage(err: any, fallback: string): Promise<string> {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    const text = await data.text();
    try {
      return JSON.parse(text).error ?? fallback;
    } catch {
      return text || fallback;
    }
  }
  return data?.error ?? err.message ?? fallback;
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

function scoreTone(score: StaticAnalysisScanReport["score"]): string {
  if (!score) return "neutral";
  return score.passed ? "passed" : "failed";
}

function Pagination({
  page,
  total,
  onPageChange,
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = getPageCount(total);
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  if (total <= PAGE_SIZE) {
    return null;
  }

  return (
    <div className="pagination">
      <span>{formatNumber(start)}-{formatNumber(end)} / {formatNumber(total)}</span>
      <div className="pagination-actions">
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}>
          上一页
        </button>
        <span>{formatNumber(page)} / {formatNumber(pageCount)}</span>
        <button type="button" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page === pageCount}>
          下一页
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [result, setResult] = useState<StaticAnalysisScanReport | null>(null);
  const [error, setError] = useState("");
  const [filePage, setFilePage] = useState(1);
  const [functionPage, setFunctionPage] = useState(1);
  const [clonePage, setClonePage] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [findingSeverity, setFindingSeverity] = useState<StaticAnalysisSeverity | "ALL">("ALL");
  const [findingSearch, setFindingSearch] = useState("");

  const functionRows = useMemo<FunctionRow[]>(() => {
    return (result?.fileMetrics ?? []).flatMap((file) =>
      file.functions.map((fn) => ({
        ...fn,
        file: file.file,
        language: file.language,
      }))
    );
  }, [result?.fileMetrics]);
  const fileRows = result?.fileMetrics ?? [];
  const cloneRows = result?.clonePairs ?? [];
  const findingRows = useMemo(() => {
    const search = findingSearch.trim().toLowerCase();
    return (result?.findings ?? []).filter((finding) => {
      const severityMatches = findingSeverity === "ALL" || finding.severity === findingSeverity;
      const searchMatches = !search || `${finding.ruleId} ${finding.file} ${finding.message}`.toLowerCase().includes(search);
      return severityMatches && searchMatches;
    });
  }, [findingSearch, findingSeverity, result?.findings]);
  const visibleFileRows = getPageItems(fileRows, filePage);
  const visibleFunctionRows = getPageItems(functionRows, functionPage);
  const visibleCloneRows = getPageItems(cloneRows, clonePage);

  const downloadPdf = async () => {
    if (!result || pdfLoading) {
      return;
    }

    setPdfLoading(true);
    setError("");

    try {
      const response = await axios.post<Blob>("/api/report/pdf", result, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      const filename = `${result.projectKey.trim().replace(/[^\w.-]+/g, "-") || "analysis-report"}.pdf`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      setError(await extractErrorMessage(err, "PDF 导出失败"));
    } finally {
      setPdfLoading(false);
    }
  };

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
            setFilePage(1);
            setFunctionPage(1);
            setClonePage(1);
          }}
          setError={setError}
          canExportPdf={!!result}
          pdfLoading={pdfLoading}
          onExportPdf={downloadPdf}
        />

        {error && <div className="error-panel reveal">{error}</div>}

        {result && (
          <>
            <section className="metrics-grid reveal">
              <MetricTile label="项目" value={result.projectKey} sub={new Date(result.scannedAt).toLocaleString()} />
              <MetricTile label="质量得分" value={result.score ? `${formatNumber(result.score.score, 1)} / ${result.score.maxScore}` : "未启用"} sub={result.score ? `通过线 ${formatNumber(result.score.passScore, 1)}` : "评分引擎关闭"} />
              <MetricTile label="文件数" value={formatNumber(result.fileMetrics.length)} sub={`${formatNumber(result.durationMs)} ms`} />
              <MetricTile label="代码行" value={formatNumber(result.metrics.ncloc)} sub={`总行数 ${formatNumber(result.metrics.totalLines)}`} />
              <MetricTile label="注释密度" value={formatPercent(result.metrics.commentDensity)} sub="AST comment nodes" />
              <MetricTile label="函数数" value={formatNumber(result.metrics.functionCount)} sub={`类/结构 ${formatNumber(result.metrics.classCount)}`} />
              <MetricTile label="平均复杂度" value={formatNumber(result.metrics.avgComplexity, 1)} sub={`最大 ${formatNumber(result.metrics.maxComplexity)}`} />
              <MetricTile label="超长函数" value={formatNumber(result.metrics.overLongFunctions)} sub="> 100 lines" />
              <MetricTile label="克隆率" value={formatPercent(result.metrics.cloneRate)} sub={`${formatNumber(result.clonePairs.length)} clone pairs`} />
            </section>

            {result.score && (
              <section className={`score-layout reveal ${scoreTone(result.score)}`}>
                <article className="score-summary">
                  <div className="score-summary-top">
                    <div>
                      <div className="metric-label">质量门禁</div>
                      <div className="score-value">{formatNumber(result.score.score, 1)}<span>/{result.score.maxScore}</span></div>
                    </div>
                    <span className="gate-badge">{result.score.passed ? "通过" : "未通过"}</span>
                  </div>
                  <div className="score-meta">{result.score.profileId} · v{result.score.profileVersion} · {result.score.provenance === "provisional" ? "临时档案" : result.score.provenance}</div>
                  {!result.score.passed && result.score.failureReasons.map((reason) => <div className="gate-reason" key={reason}>{reason}</div>)}
                </article>
                <article className="score-deductions">
                  <div className="section-heading compact-heading"><h2>扣分明细</h2><span className="count-badge">{formatNumber(result.score.deductions.length)} 项</span></div>
                  {result.score.deductions.length === 0 ? <div className="empty-panel">暂无扣分项</div> : (
                    <div className="deduction-list">
                      {result.score.deductions.map((item) => (
                        <div className="deduction-row" key={`${item.category}:${item.label}`}><span>{item.label}{item.count ? ` × ${item.count}` : ""}</span><strong>-{formatNumber(item.points, 1)}</strong></div>
                      ))}
                    </div>
                  )}
                </article>
              </section>
            )}

            <section className="surface-panel data-section reveal">
              <div className="section-heading">
                <div><h2>规则问题</h2><div className="section-subtitle">按严重级别和文件快速定位需要处理的代码</div></div>
                <span className="count-badge">{formatNumber(findingRows.length)} / {formatNumber(result.findings.length)}</span>
              </div>
              <div className="finding-filters">
                <input className="form-input finding-search" value={findingSearch} onChange={(event) => setFindingSearch(event.target.value)} placeholder="搜索规则、文件或问题" />
                <select className="form-input severity-select" value={findingSeverity} onChange={(event) => setFindingSeverity(event.target.value as StaticAnalysisSeverity | "ALL")}>
                  <option value="ALL">全部级别</option><option value="BLOCKER">BLOCKER</option><option value="CRITICAL">CRITICAL</option><option value="MAJOR">MAJOR</option><option value="MINOR">MINOR</option>
                </select>
              </div>
              {findingRows.length === 0 ? <div className="empty-panel">未发现符合筛选条件的规则问题</div> : (
                <div className="table-wrap">
                  <table className="data-table findings-table"><thead><tr><th>Severity</th><th>Rule</th><th>File</th><th>Line</th><th>Message</th></tr></thead><tbody>
                    {findingRows.map((finding) => <tr key={finding.id}><td><span className={`severity-pill severity-${finding.severity.toLowerCase()}`}>{finding.severity}</span></td><td className="strong-cell">{finding.ruleId}</td><td className="code-cell">{finding.file}</td><td className="numeric">{finding.line}:{finding.column}</td><td>{finding.message}</td></tr>)}
                  </tbody></table>
                </div>
              )}
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
                    {visibleFileRows.map((file) => (
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
              <Pagination page={filePage} total={fileRows.length} onPageChange={setFilePage} />
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
                      {visibleFunctionRows.map((fn) => (
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
              <Pagination page={functionPage} total={functionRows.length} onPageChange={setFunctionPage} />
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
                      {visibleCloneRows.map((pair) => (
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
              <Pagination page={clonePage} total={cloneRows.length} onPageChange={setClonePage} />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
