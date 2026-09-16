import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import axios from "axios";
import UploadPanel from "./components/UploadPanel";
import type {
  StaticAnalysisFileMetrics,
  StaticAnalysisFunctionMetric,
  StaticAnalysisLanguage,
  StaticAnalysisScanReport,
  StaticAnalysisSeverity,
} from "./types";

type FunctionRow = StaticAnalysisFunctionMetric & { file: string; language: string };
type ResultTab = "overview" | "findings" | "files" | "functions" | "clones";

const PAGE_SIZE = 10;
const RESULT_TABS: Array<{ id: ResultTab; label: string }> = [
  { id: "overview", label: "总览" },
  { id: "findings", label: "规则问题" },
  { id: "files", label: "文件指标" },
  { id: "functions", label: "函数指标" },
  { id: "clones", label: "克隆检测" },
];

function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatPercent(value: number): string {
  return `${formatNumber(value * 100, 1)}%`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function formatCloneLocation(file: string, startLine?: number, endLine?: number): string {
  return startLine ? `${file}:${startLine}-${endLine}` : file;
}

function fileMaxComplexity(file: StaticAnalysisFileMetrics): number {
  return file.functions.reduce((max, item) => Math.max(max, item.complexity), 0);
}

function getPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

function getPageItems<T>(items: T[], page: number): T[] {
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

async function extractErrorMessage(err: any, fallback: string): Promise<string> {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    const body = await data.text();
    try {
      return JSON.parse(body).error ?? fallback;
    } catch {
      return body || fallback;
    }
  }
  return data?.error ?? err.message ?? fallback;
}

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <article className="metric-tile">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </article>
  );
}

function Pagination({ page, total, onPageChange }: { page: number; total: number; onPageChange: (page: number) => void }) {
  const pageCount = getPageCount(total);
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  if (total <= PAGE_SIZE) return null;

  return (
    <div className="pagination">
      <span>{formatNumber(start)}-{formatNumber(end)} / {formatNumber(total)}</span>
      <div className="pagination-actions">
        <button type="button" aria-label="上一页" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}>←</button>
        <span>{formatNumber(page)} / {formatNumber(pageCount)}</span>
        <button type="button" aria-label="下一页" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page === pageCount}>→</button>
      </div>
    </div>
  );
}

function ScoreOverview({ result }: { result: StaticAnalysisScanReport }) {
  const score = result.score;
  if (!score) {
    return (
      <article className="score-hero score-disabled">
        <div><span className="panel-kicker">评分标准</span><h2>评分未启用</h2></div>
        <span className="status-badge neutral">未评分</span>
      </article>
    );
  }

  const scorePercent = Math.max(0, Math.min(100, (score.score / score.maxScore) * 100));
  return (
    <article className={`score-hero ${score.passed ? "passed" : "failed"}`}>
      <div className="score-copy">
        <span className="panel-kicker">评分标准</span>
        <div className="score-heading-row">
          <h2>{score.passed ? "本次分析通过" : "本次分析未通过"}</h2>
          <span className={`status-badge ${score.passed ? "success" : "danger"}`}>{score.passed ? "通过" : "未通过"}</span>
        </div>
        <p className="score-profile">{score.profileId} · v{score.profileVersion} · {score.provenance === "provisional" ? "临时档案" : score.provenance}</p>
        {score.failureReasons.length > 0 && (
          <div className="failure-reasons">{score.failureReasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
        )}
      </div>
      <div className="score-ring" style={{ "--score-angle": `${scorePercent * 3.6}deg` } as CSSProperties} aria-label={`质量得分 ${score.score}`}>
        <div className="score-ring-inner"><strong>{formatNumber(score.score, 1)}</strong><span>/ {formatNumber(score.maxScore)}</span></div>
      </div>
      <div className="pass-line"><span>通过线</span><strong>{formatNumber(score.passScore, 1)}</strong></div>
    </article>
  );
}

export default function App() {
  const [result, setResult] = useState<StaticAnalysisScanReport | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<ResultTab>("overview");
  const [filePage, setFilePage] = useState(1);
  const [functionPage, setFunctionPage] = useState(1);
  const [clonePage, setClonePage] = useState(1);
  const [findingPage, setFindingPage] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [findingSeverity, setFindingSeverity] = useState<StaticAnalysisSeverity | "ALL">("ALL");
  const [findingLanguage, setFindingLanguage] = useState<StaticAnalysisLanguage | "ALL">("ALL");
  const [findingFile, setFindingFile] = useState("ALL");
  const [findingSearch, setFindingSearch] = useState("");

  const functionRows = useMemo<FunctionRow[]>(() => (result?.fileMetrics ?? []).flatMap((file) =>
    file.functions.map((fn) => ({ ...fn, file: file.file, language: file.language }))), [result?.fileMetrics]);
  const fileRows = result?.fileMetrics ?? [];
  const cloneRows = result?.clonePairs ?? [];
  const languageByFile = useMemo(() => new Map(fileRows.map((file) => [file.file, file.language])), [fileRows]);
  const findingFiles = useMemo(() => [...new Set((result?.findings ?? []).map((finding) => finding.file))].sort(), [result?.findings]);
  const findingRows = useMemo(() => {
    const search = findingSearch.trim().toLowerCase();
    return (result?.findings ?? []).filter((finding) => {
      const severityMatches = findingSeverity === "ALL" || finding.severity === findingSeverity;
      const languageMatches = findingLanguage === "ALL" || languageByFile.get(finding.file) === findingLanguage;
      const fileMatches = findingFile === "ALL" || finding.file === findingFile;
      const searchMatches = !search || `${finding.ruleId} ${finding.file} ${finding.message}`.toLowerCase().includes(search);
      return severityMatches && languageMatches && fileMatches && searchMatches;
    });
  }, [findingFile, findingLanguage, findingSearch, findingSeverity, languageByFile, result?.findings]);

  const downloadPdf = async () => {
    if (!result || pdfLoading) return;
    setPdfLoading(true);
    setError("");
    try {
      const response = await axios.post<Blob>("/api/report/pdf", result, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${result.projectKey.trim().replace(/[^\w.-]+/g, "-") || "analysis-report"}.pdf`;
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

  const tabCount = (tab: ResultTab): number | undefined => {
    if (!result || tab === "overview") return undefined;
    if (tab === "findings") return result.findings.length;
    if (tab === "files") return fileRows.length;
    if (tab === "functions") return functionRows.length;
    return cloneRows.length;
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">跳到主要内容</a>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">CA</span>
          <div><strong>代码质量工作台</strong><span>Code Analysis Console</span></div>
        </div>
      </header>

      <main className="workspace" id="workspace">
        <aside className="control-column">
          <UploadPanel
            onDone={(data) => {
              setResult(data);
              setError("");
              setActiveTab("overview");
              setFilePage(1);
              setFunctionPage(1);
              setClonePage(1);
              setFindingPage(1);
            }}
            setError={setError}
            canExportPdf={!!result}
            pdfLoading={pdfLoading}
            onExportPdf={downloadPdf}
          />
        </aside>

        <section className="result-column" aria-live="polite">
          {error && (
            <div className="error-panel" role="alert">
              <div><strong>操作未完成</strong><span>{error}</span></div>
              <button type="button" onClick={() => setError("")} aria-label="关闭错误提示">×</button>
            </div>
          )}

          {!result ? (
            <section className="empty-workspace">
              <div className="empty-visual" aria-hidden="true"><span className="scan-line" /><i /><i /><i /><i /><i /></div>
              <div><span className="panel-kicker">分析结果</span><h1>等待代码扫描</h1><p>分析完成后，质量得分、规则问题与克隆检测结果将在这里集中展示。</p></div>
              <div className="empty-capabilities"><span>Python</span><span>Java</span><span>C / C++</span></div>
            </section>
          ) : (
            <div className="report-workspace">
              <header className="report-titlebar">
                <div><span className="panel-kicker">当前项目</span><h1>{result.sourceName ?? result.projectKey}</h1></div>
                <dl className="scan-meta">
                  <div><dt>扫描时间</dt><dd>{formatDate(result.scannedAt)}</dd></div>
                  <div><dt>分析耗时</dt><dd>{formatNumber(result.durationMs)} ms</dd></div>
                </dl>
              </header>

              <ScoreOverview result={result} />
              <section className="metrics-strip" aria-label="项目指标摘要">
                <MetricTile label="代码行" value={formatNumber(result.metrics.ncloc)} sub={`${formatNumber(result.metrics.totalLines)} 总行数`} />
                <MetricTile label="文件" value={formatNumber(fileRows.length)} sub={`${formatNumber(result.metrics.functionCount)} 个函数`} />
                <MetricTile label="平均复杂度" value={formatNumber(result.metrics.avgComplexity, 1)} sub={`最高 ${formatNumber(result.metrics.maxComplexity)}`} />
                <MetricTile label="注释密度" value={formatPercent(result.metrics.commentDensity)} sub={`${formatNumber(result.metrics.classCount)} 个类 / 结构`} />
                <MetricTile label="规则问题" value={formatNumber(result.findings.length)} sub={`${formatNumber(result.metrics.overComplexFunctions)} 个复杂函数`} />
                <MetricTile label="克隆率" value={formatPercent(result.metrics.cloneRate)} sub={`${formatNumber(cloneRows.length)} 组相似代码`} />
              </section>

              <nav className="result-tabs" role="tablist" aria-label="分析结果分类">
                {RESULT_TABS.map((tab) => {
                  const count = tabCount(tab.id);
                  return (
                    <button type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)} key={tab.id}>
                      {tab.label}{count !== undefined && <span>{formatNumber(count)}</span>}
                    </button>
                  );
                })}
              </nav>

              <section className="tab-panel" role="tabpanel">
                {activeTab === "overview" && (
                  <div className="overview-grid">
                    <article className="content-panel deductions-panel">
                      <div className="section-heading"><div><span className="panel-kicker">评分构成</span><h2>扣分明细</h2></div><span className="count-label">{result.score?.deductions.length ?? 0} 项</span></div>
                      {!result.score || result.score.deductions.length === 0 ? (
                        <div className="compact-empty"><strong>没有扣分项</strong><span>当前评分档案下未触发扣分规则。</span></div>
                      ) : (
                        <div className="deduction-list">{result.score.deductions.map((item) => (
                          <div className="deduction-row" key={`${item.category}:${item.label}`}><span>{item.label}<small>{item.count ? `${item.count} 次` : "按比例"}</small></span><strong>-{formatNumber(item.points, 1)}</strong></div>
                        ))}</div>
                      )}
                    </article>

                    <article className="content-panel health-panel">
                      <div className="section-heading"><div><span className="panel-kicker">结构风险</span><h2>重点指标</h2></div></div>
                      <div className="health-list">
                        <div><span>超复杂函数</span><strong>{formatNumber(result.metrics.overComplexFunctions)}</strong></div>
                        <div><span>超长函数</span><strong>{formatNumber(result.metrics.overLongFunctions)}</strong></div>
                        <div><span>深层嵌套函数</span><strong>{formatNumber(result.metrics.deeplyNestedFunctions)}</strong></div>
                        <div><span>最大复杂度</span><strong>{formatNumber(result.metrics.maxComplexity)}</strong></div>
                      </div>
                    </article>

                    <article className="content-panel recent-findings">
                      <div className="section-heading"><div><span className="panel-kicker">优先处理</span><h2>规则问题</h2></div>{result.findings.length > 0 && <button type="button" className="text-button" onClick={() => setActiveTab("findings")}>查看全部 →</button>}</div>
                      {result.findings.length === 0 ? (
                        <div className="compact-empty"><strong>没有规则问题</strong><span>本次扫描未命中已启用规则。</span></div>
                      ) : (
                        <div className="finding-preview-list">{result.findings.slice(0, 5).map((finding) => (
                          <div className="finding-preview" key={finding.id}><span className={`severity-dot severity-${finding.severity.toLowerCase()}`} aria-label={finding.severity} /><div><strong>{finding.message}</strong><span>{finding.file}:{finding.line} · {finding.ruleId}</span></div></div>
                        ))}</div>
                      )}
                    </article>
                  </div>
                )}

                {activeTab === "findings" && (
                  <article className="content-panel table-panel">
                    <div className="section-heading"><div><span className="panel-kicker">静态规则</span><h2>规则问题明细</h2></div><span className="count-label">{formatNumber(findingRows.length)} / {formatNumber(result.findings.length)}</span></div>
                    <div className="finding-filters">
                      <input className="form-input finding-search" value={findingSearch} onChange={(event) => { setFindingSearch(event.target.value); setFindingPage(1); }} placeholder="搜索规则、文件或问题" aria-label="搜索规则问题" />
                      <select className="form-input" value={findingSeverity} onChange={(event) => { setFindingSeverity(event.target.value as StaticAnalysisSeverity | "ALL"); setFindingPage(1); }} aria-label="按严重级别筛选"><option value="ALL">全部级别</option><option value="BLOCKER">BLOCKER</option><option value="CRITICAL">CRITICAL</option><option value="MAJOR">MAJOR</option><option value="MINOR">MINOR</option></select>
                      <select className="form-input" value={findingLanguage} onChange={(event) => { setFindingLanguage(event.target.value as StaticAnalysisLanguage | "ALL"); setFindingPage(1); }} aria-label="按语言筛选"><option value="ALL">全部语言</option><option value="python">Python</option><option value="java">Java</option><option value="c">C</option><option value="cpp">C++</option></select>
                      <select className="form-input file-filter" value={findingFile} onChange={(event) => { setFindingFile(event.target.value); setFindingPage(1); }} aria-label="按文件筛选"><option value="ALL">全部文件</option>{findingFiles.map((file) => <option value={file} key={file}>{file}</option>)}</select>
                    </div>
                    {findingRows.length === 0 ? <div className="compact-empty"><strong>没有匹配的问题</strong><span>调整筛选条件后再查看。</span></div> : (
                      <div className="table-wrap"><table className="data-table findings-table"><thead><tr><th>级别</th><th>规则</th><th>文件</th><th className="numeric">位置</th><th>问题</th></tr></thead><tbody>
                        {getPageItems(findingRows, findingPage).map((finding) => <tr key={finding.id}><td><span className={`severity-pill severity-${finding.severity.toLowerCase()}`}>{finding.severity}</span></td><td className="strong-cell">{finding.ruleId}</td><td className="code-cell">{finding.file}</td><td className="numeric">{finding.line}:{finding.column}</td><td>{finding.message}</td></tr>)}
                      </tbody></table></div>
                    )}
                    <Pagination page={findingPage} total={findingRows.length} onPageChange={setFindingPage} />
                  </article>
                )}

                {activeTab === "files" && (
                  <article className="content-panel table-panel">
                    <div className="section-heading"><div><span className="panel-kicker">项目结构</span><h2>文件级指标</h2></div><span className="count-label">{fileRows.length} 个文件</span></div>
                    <div className="table-wrap"><table className="data-table"><thead><tr><th>文件</th><th>语言</th><th className="numeric">代码行</th><th className="numeric">总行数</th><th className="numeric">注释</th><th className="numeric">函数</th><th className="numeric">类</th><th className="numeric">导入</th><th className="numeric">最高复杂度</th></tr></thead><tbody>
                      {getPageItems(fileRows, filePage).map((file) => <tr key={file.file}><td className="code-cell">{file.file}</td><td>{file.language}</td><td className="numeric">{formatNumber(file.ncloc)}</td><td className="numeric">{formatNumber(file.totalLines)}</td><td className="numeric">{formatNumber(file.commentLines)}</td><td className="numeric">{formatNumber(file.functionCount)}</td><td className="numeric">{formatNumber(file.classCount)}</td><td className="numeric">{formatNumber(file.importCount)}</td><td className="numeric">{formatNumber(fileMaxComplexity(file))}</td></tr>)}
                    </tbody></table></div>
                    <Pagination page={filePage} total={fileRows.length} onPageChange={setFilePage} />
                  </article>
                )}

                {activeTab === "functions" && (
                  <article className="content-panel table-panel">
                    <div className="section-heading"><div><span className="panel-kicker">函数结构</span><h2>函数级指标</h2></div><span className="count-label">{functionRows.length} 个函数</span></div>
                    {functionRows.length === 0 ? <div className="compact-empty"><strong>没有函数数据</strong><span>本次扫描未识别到函数定义。</span></div> : (
                      <div className="table-wrap"><table className="data-table"><thead><tr><th>函数</th><th>文件</th><th>语言</th><th className="numeric">行数</th><th className="numeric">复杂度</th><th className="numeric">嵌套</th><th className="numeric">参数</th></tr></thead><tbody>
                        {getPageItems(functionRows, functionPage).map((fn) => <tr key={`${fn.file}:${fn.startLine}:${fn.name}`}><td className="strong-cell">{fn.name}</td><td className="code-cell">{fn.file}:{fn.startLine}</td><td>{fn.language}</td><td className="numeric">{formatNumber(fn.lines)}</td><td className="numeric">{formatNumber(fn.complexity)}</td><td className="numeric">{formatNumber(fn.nestingDepth)}</td><td className="numeric">{formatNumber(fn.paramCount)}</td></tr>)}
                      </tbody></table></div>
                    )}
                    <Pagination page={functionPage} total={functionRows.length} onPageChange={setFunctionPage} />
                  </article>
                )}

                {activeTab === "clones" && (
                  <article className="content-panel table-panel">
                    <div className="section-heading"><div><span className="panel-kicker">相似性分析</span><h2>克隆检测结果</h2></div><span className="count-label">{cloneRows.length} 组</span></div>
                    {cloneRows.length === 0 ? <div className="compact-empty"><strong>没有相似代码</strong><span>未检测到跨文件或同文件重复代码段。</span></div> : (
                      <div className="table-wrap"><table className="data-table clone-table"><thead><tr><th>类型</th><th>文件 / 代码段 A</th><th>文件 / 代码段 B</th><th className="numeric">相似度</th><th className="numeric">重复代码片段数</th></tr></thead><tbody>
                        {getPageItems(cloneRows, clonePage).map((pair) => <tr key={`${pair.fileA}:${pair.startLineA}:${pair.fileB}:${pair.startLineB}`}><td>{pair.kind === "block" ? "文件内片段" : "文件间"}</td><td className="code-cell">{formatCloneLocation(pair.fileA, pair.startLineA, pair.endLineA)}</td><td className="code-cell">{formatCloneLocation(pair.fileB, pair.startLineB, pair.endLineB)}</td><td className="numeric similarity-cell">{formatPercent(pair.jaccardSimilarity)}</td><td className="numeric">{formatNumber(pair.matchingKGrams)}</td></tr>)}
                      </tbody></table></div>
                    )}
                    <Pagination page={clonePage} total={cloneRows.length} onPageChange={setClonePage} />
                  </article>
                )}
              </section>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
