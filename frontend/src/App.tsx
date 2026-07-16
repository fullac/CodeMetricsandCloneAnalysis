import { useMemo, useState } from "react";
import axios from "axios";
import UploadPanel from "./components/UploadPanel";
import type { StaticAnalysisFileMetrics, StaticAnalysisFunctionMetric, StaticAnalysisScanReport } from "./types";

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
