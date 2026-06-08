import { useMemo, useState } from "react";
import axios from "axios";
import UploadPanel from "./components/UploadPanel";
import IssueViewer from "./components/IssueViewer";
import IssueDiagnosisModal from "./components/IssueDiagnosisModal";
import MetricsRadar from "./components/MetricsRadar";
import type { IssueDiagnosisResult, ProjectDiagnosisResult, ReviewIssue, ReviewResult } from "./types";

function toDiagnosisMap(results: IssueDiagnosisResult[]): Record<string, IssueDiagnosisResult> {
  const updates: Record<string, IssueDiagnosisResult> = {};
  results.forEach((item) => {
    updates[item.issueKey] = item;
  });
  return updates;
}

function diagnosisSummary(result?: ProjectDiagnosisResult): string {
  if (!result) return "尚未触发项目LLM评估";
  return result.diagnosis;
}

export default function App() {
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState("");
  const [projectDiagnosis, setProjectDiagnosis] = useState<ProjectDiagnosisResult | null>(null);
  const [selectedIssueKeys, setSelectedIssueKeys] = useState<string[]>([]);
  const [selectedHotspotKeys, setSelectedHotspotKeys] = useState<string[]>([]);
  const [issueDiagnoses, setIssueDiagnoses] = useState<Record<string, IssueDiagnosisResult>>({});
  const [hotspotDiagnoses, setHotspotDiagnoses] = useState<Record<string, IssueDiagnosisResult>>({});
  const [issueDiagnosisModalOpen, setIssueDiagnosisModalOpen] = useState(false);
  const [hotspotDiagnosisModalOpen, setHotspotDiagnosisModalOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [issueDiagLoading, setIssueDiagLoading] = useState(false);
  const [hotspotDiagLoading, setHotspotDiagLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const issueMap = useMemo(() => {
    const map = new Map<string, ReviewIssue>();
    (result?.issues ?? []).forEach((issue) => map.set(issue.key, issue));
    return map;
  }, [result?.issues]);

  const hotspotMap = useMemo(() => {
    const map = new Map<string, ReviewIssue>();
    (result?.securityHotspots ?? []).forEach((issue) => map.set(issue.key, issue));
    return map;
  }, [result?.securityHotspots]);

  const issues = result?.issues ?? [];
  const hotspots = result?.securityHotspots ?? [];

  const selectedIssues = useMemo(
    () => selectedIssueKeys.map((k) => issueMap.get(k)).filter(Boolean) as ReviewIssue[],
    [selectedIssueKeys, issueMap]
  );

  const selectedHotspots = useMemo(
    () => selectedHotspotKeys.map((k) => hotspotMap.get(k)).filter(Boolean) as ReviewIssue[],
    [selectedHotspotKeys, hotspotMap]
  );

  const runProjectDiagnosis = async () => {
    if (!result) return;
    setDiagLoading(true);
    setError("");
    try {
      const resp = await axios.post<ProjectDiagnosisResult>("/api/diagnose/project", {
        metrics: result.metrics,
      });
      setProjectDiagnosis(resp.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message ?? "项目诊断失败");
    } finally {
      setDiagLoading(false);
    }
  };

  const runIssueDiagnosis = async () => {
    if (!selectedIssues.length) {
      setError("请先选择至少一条 High issue");
      return;
    }
    setIssueDiagLoading(true);
    setError("");
    try {
      const resp = await axios.post<{ results: IssueDiagnosisResult[] }>("/api/diagnose/issues", {
        issues: selectedIssues,
      });
      setIssueDiagnoses((prev) => ({ ...prev, ...toDiagnosisMap(resp.data.results) }));
      setIssueDiagnosisModalOpen(false);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message ?? "Issue诊断失败");
    } finally {
      setIssueDiagLoading(false);
    }
  };

  const runHotspotDiagnosis = async () => {
    if (!selectedHotspots.length) {
      setError("请先选择至少一条 Security Hotspot");
      return;
    }
    setHotspotDiagLoading(true);
    setError("");
    try {
      const resp = await axios.post<{ results: IssueDiagnosisResult[] }>("/api/diagnose/hotspots", {
        issues: selectedHotspots,
      });
      setHotspotDiagnoses((prev) => ({ ...prev, ...toDiagnosisMap(resp.data.results) }));
      setHotspotDiagnosisModalOpen(false);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message ?? "Hotspot诊断失败");
    } finally {
      setHotspotDiagLoading(false);
    }
  };

  const deleteCurrentRecord = async () => {
    if (!result) return;
    setDeleteLoading(true);
    setError("");
    try {
      await axios.post("/api/review/delete", {
        projectKey: result.projectKey,
      });
      setResult(null);
      setProjectDiagnosis(null);
      setIssueDiagnoses({});
      setHotspotDiagnoses({});
      setSelectedIssueKeys([]);
      setSelectedHotspotKeys([]);
      setIssueDiagnosisModalOpen(false);
      setHotspotDiagnosisModalOpen(false);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message ?? "删除记录失败");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <main className="app-shell min-h-screen px-4 py-8 pb-24 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="neo-panel reveal rounded-3xl p-6 stagger-1">
          <div className="inline-flex rounded-full border border-cyan-400/45 bg-cyan-100/75 px-3 py-1 text-xs font-medium tracking-[0.08em] text-cyan-800">
            SonarQube + LLM Review
          </div>
          <h1 className="mt-3 bg-gradient-to-r from-cyan-700 via-sky-700 to-indigo-700 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            SonarQube + LLM 代码审查平台
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600"></p>
        </header>

        <UploadPanel
          onDone={(data) => {
            setResult(data);
            setError("");
            setProjectDiagnosis(null);
            setIssueDiagnoses({});
            setHotspotDiagnoses({});
            setSelectedIssueKeys([]);
            setSelectedHotspotKeys([]);
            setIssueDiagnosisModalOpen(false);
            setHotspotDiagnosisModalOpen(false);
          }}
          setError={setError}
        />

        {error && <div className="reveal rounded-2xl border border-rose-300/65 bg-rose-50 p-4 text-sm text-rose-700 shadow-[0_12px_34px_-24px_rgba(244,63,94,0.45)]">{error}</div>}

        {result && (
          <section className="reveal grid gap-6 lg:grid-cols-[1.08fr_0.92fr] stagger-2">
            <div className="neo-panel space-y-4 rounded-3xl p-5">
              <h2 className="text-lg font-semibold text-slate-900">静态解析概览</h2>
              <p className="text-sm text-slate-700">项目：{result.projectKey}</p>
              <p className="text-sm text-slate-700">扫描时间：{new Date(result.scannedAt).toLocaleString()}</p>
              <p className="text-sm text-slate-700">High Issue：{issues.length}</p>
              <p className="text-sm text-slate-700">Security Hotspots：{hotspots.length}</p>
              <button
                onClick={deleteCurrentRecord}
                disabled={deleteLoading}
                className="rounded-xl border border-rose-300/60 bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2 text-sm font-medium text-white shadow-[0_10px_30px_-18px_rgba(244,63,94,0.58)] transition hover:saturate-125 disabled:opacity-60"
              >
                {deleteLoading ? "删除中..." : "删除此次解析记录"}
              </button>
            </div>

            <MetricsRadar metrics={result.metrics} />
          </section>
        )}

        <IssueViewer
          title="High Issue 列表"
          issues={issues}
          issueDiagnoses={issueDiagnoses}
          headerAction={
            <button
              onClick={() => setIssueDiagnosisModalOpen(true)}
              disabled={issueDiagLoading || issues.length === 0}
              className="neon-btn rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {issueDiagLoading ? "Issue诊断中..." : `选择并诊断 High Issue (${selectedIssueKeys.length})`}
            </button>
          }
        />

        <IssueDiagnosisModal
          open={issueDiagnosisModalOpen}
          title="选择需要诊断的Issue"
          subtitle="所选问题将使用LLM进行评估和诊断"
          itemLabel="Issue"
          issues={issues}
          selectedIssueKeys={selectedIssueKeys}
          loading={issueDiagLoading}
          onToggleIssue={(issueKey, checked) => {
            setSelectedIssueKeys((prev) => {
              if (checked) return Array.from(new Set([...prev, issueKey]));
              return prev.filter((k) => k !== issueKey);
            });
          }}
          onToggleAll={(checked) => {
            setSelectedIssueKeys(checked ? issues.map((item) => item.key) : []);
          }}
          onConfirm={runIssueDiagnosis}
          onClose={() => setIssueDiagnosisModalOpen(false)}
        />

        <IssueViewer
          title="Security Hotspots 列表"
          issues={hotspots}
          issueDiagnoses={hotspotDiagnoses}
          headerAction={
            <button
              onClick={() => setHotspotDiagnosisModalOpen(true)}
              disabled={hotspotDiagLoading || hotspots.length === 0}
              className="rounded-xl border border-indigo-300/55 bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-sm font-medium text-white shadow-[0_12px_28px_-16px_rgba(99,102,241,0.55)] transition hover:saturate-125 disabled:opacity-60"
            >
              {hotspotDiagLoading ? "Hotspot诊断中..." : `选择并诊断 Hotspot (${selectedHotspotKeys.length})`}
            </button>
          }
        />

        <IssueDiagnosisModal
          open={hotspotDiagnosisModalOpen}
          title="选择需要诊断的安全热点"
          subtitle="所选热点将使用LLM进行评估和诊断"
          itemLabel="Hotspot"
          issues={hotspots}
          selectedIssueKeys={selectedHotspotKeys}
          loading={hotspotDiagLoading}
          onToggleIssue={(issueKey, checked) => {
            setSelectedHotspotKeys((prev) => {
              if (checked) return Array.from(new Set([...prev, issueKey]));
              return prev.filter((k) => k !== issueKey);
            });
          }}
          onToggleAll={(checked) => {
            setSelectedHotspotKeys(checked ? hotspots.map((item) => item.key) : []);
          }}
          onConfirm={runHotspotDiagnosis}
          onClose={() => setHotspotDiagnosisModalOpen(false)}
        />

        {result && (
          <section className="neo-panel reveal rounded-3xl p-5 stagger-4">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">项目整体评估</h2>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={runProjectDiagnosis}
                disabled={diagLoading}
                className="neon-btn rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {diagLoading ? "LLM评估中..." : "触发项目LLM评估"}
              </button>
            </div>

            <div className="neo-subpanel mt-4 rounded-2xl p-4 text-sm whitespace-pre-wrap text-slate-800">
              {projectDiagnosis ? (
                <div className="space-y-2">
                  <div className="text-xs text-slate-500">{projectDiagnosis.startedAt} · {projectDiagnosis.durationMs}ms</div>
                  <div>{diagnosisSummary(projectDiagnosis)}</div>
                </div>
              ) : (
                "尚未触发项目LLM评估"
              )}
            </div>
          </section>
        )}

        <div className="h-16" />
      </div>
    </main>
  );
}
