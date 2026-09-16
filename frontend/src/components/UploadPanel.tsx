import { DragEvent, FormEvent, useId, useState } from "react";
import axios from "axios";
import type { StaticAnalysisCustomScoreProfile, StaticAnalysisScanReport, StaticAnalysisScoreMetric, StaticAnalysisSeverity } from "../types";

interface Props {
  onDone: (result: StaticAnalysisScanReport) => void;
  setError: (msg: string) => void;
  canExportPdf: boolean;
  pdfLoading: boolean;
  onExportPdf: () => void;
}

const PROJECT_NAME_MAX_LENGTH = 20;
const ACCEPTED_FILE_TYPES = ".zip,.py,.java,.c,.h,.cpp,.cc,.cxx,.hpp,.hh,.hxx";
const GATE_RULES: Array<{ metric: StaticAnalysisScoreMetric; label: string; unit: string; thresholdStep: string }> = [
  { metric: "maxComplexity", label: "函数复杂度", unit: "点", thresholdStep: "1" },
  { metric: "maxFunctionLines", label: "函数行数", unit: "行", thresholdStep: "1" },
  { metric: "maxNestingDepth", label: "嵌套深度", unit: "层", thresholdStep: "1" },
  { metric: "cloneRate", label: "克隆率", unit: "%", thresholdStep: "0.1" },
];
const FINDING_RULES: Array<{ severity: StaticAnalysisSeverity; label: string }> = [
  { severity: "BLOCKER", label: "阻断" },
  { severity: "CRITICAL", label: "严重" },
  { severity: "MAJOR", label: "主要" },
  { severity: "MINOR", label: "次要" },
];

function normalizeProjectName(value: string): string {
  return value.trim().slice(0, PROJECT_NAME_MAX_LENGTH);
}

export default function UploadPanel({ onDone, setError, canExportPdf, pdfLoading, onExportPdf }: Props) {
  const fileInputId = useId();
  const [projectKey, setProjectKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [scanHint, setScanHint] = useState("等待上传文件");
  const [customGateEnabled, setCustomGateEnabled] = useState(false);
  const [passScore, setPassScore] = useState("60");
  const [metricValues, setMetricValues] = useState<Record<StaticAnalysisScoreMetric, { threshold: string; penalty: string }>>({
    maxComplexity: { threshold: "20", penalty: "1" },
    maxFunctionLines: { threshold: "150", penalty: "0.5" },
    maxNestingDepth: { threshold: "6", penalty: "0.5" },
    cloneRate: { threshold: "20", penalty: "10" },
  });
  const [findingPenaltyValues, setFindingPenaltyValues] = useState<Record<StaticAnalysisSeverity, string>>({
    BLOCKER: "5",
    CRITICAL: "3",
    MAJOR: "1",
    MINOR: "0.5",
  });

  const selectFile = (picked: File | null) => {
    setFile(picked);
    if (picked) setProjectKey(normalizeProjectName(picked.name.replace(/\.[^.]+$/, "")));
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files?.[0] ?? null);
  };

  const updateMetric = (metric: StaticAnalysisScoreMetric, field: "threshold" | "penalty", value: string) => {
    setMetricValues((current) => ({ ...current, [metric]: { ...current[metric], [field]: value } }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!file) {
      setError("请选择源码文件或 ZIP 包");
      return;
    }

    setLoading(true);
    setProgress(0);
    setScanHint("正在上传文件");
    try {
      const form = new FormData();
      form.append("projectKey", projectKey.trim());
      form.append("file", file);
      if (customGateEnabled) {
        const custom: StaticAnalysisCustomScoreProfile = {
          id: "custom-gate",
          version: "1.0.0",
          title: "自定义评分标准",
          passScore: Number(passScore),
          findingPenalties: Object.fromEntries(
            FINDING_RULES.map(({ severity }) => [severity, Number(findingPenaltyValues[severity])]),
          ),
          metrics: Object.fromEntries(Object.entries(metricValues).map(([metric, value]) => [metric, {
            threshold: metric === "cloneRate" ? Number(value.threshold) / 100 : Number(value.threshold),
            penalty: Number(value.penalty),
          }])),
        };
        form.append("scanOptions", JSON.stringify({ scoring: { enabled: true, profileId: "custom-gate", custom } }));
      }

      const response = await axios.post<StaticAnalysisScanReport>("/api/analyze", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (uploadEvent) => {
          if (!uploadEvent.total) return;
          const percentage = Math.round((uploadEvent.loaded / uploadEvent.total) * 100);
          setProgress(percentage);
          if (percentage >= 100) setScanHint("正在解析语法树并计算指标");
        },
      });
      setScanHint("分析完成");
      onDone(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message ?? "上传失败");
      setScanHint("分析失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="analysis-form">
      <div className="control-header">
        <span className="panel-kicker">新建分析</span>
        <h1>提交代码</h1>
        <p>上传单个源码文件或项目压缩包。</p>
      </div>

      <label className="field-block">
        <span>项目名称</span>
        <input className="form-input" value={projectKey} onChange={(event) => setProjectKey(event.target.value.slice(0, PROJECT_NAME_MAX_LENGTH))} placeholder="输入项目名称" maxLength={PROJECT_NAME_MAX_LENGTH} required />
      </label>

      <label
        className={`drop-zone ${dragActive ? "drag-active" : ""} ${file ? "has-file" : ""}`}
        htmlFor={fileInputId}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        <input id={fileInputId} type="file" accept={ACCEPTED_FILE_TYPES} className="file-native" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} required />
        <span className="upload-symbol" aria-hidden="true">↑</span>
        {file ? (
          <><strong>{file.name}</strong><span>{(file.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB · 点击替换</span></>
        ) : (
          <><strong>选择文件或拖放到这里</strong><span>ZIP、Python、Java、C、C++</span></>
        )}
      </label>

      <div className="gate-settings">
        <div className="switch-row">
          <div><strong>自定义评分标准</strong><span>覆盖默认阈值与扣分规则</span></div>
          <label className="switch-control">
            <input type="checkbox" checked={customGateEnabled} onChange={(event) => setCustomGateEnabled(event.target.checked)} />
            <span aria-hidden="true" />
            <em>{customGateEnabled ? "已启用" : "未启用"}</em>
          </label>
        </div>

        {customGateEnabled && (
          <div className="custom-gate-fields">
            <label className="gate-score-field"><span>通过分数</span><input className="form-input" type="number" min="0" max="100" step="0.5" value={passScore} onChange={(event) => setPassScore(event.target.value)} /></label>
            <div className="gate-rule-header"><span>指标</span><span>阈值</span><span>扣分</span></div>
            <div className="gate-rule-list">
              {GATE_RULES.map(({ metric, label, unit, thresholdStep }) => (
                <div className="gate-rule" key={metric}>
                  <span>{label}<small>{unit}</small></span>
                  <input className="form-input" type="number" min="0" step={thresholdStep} value={metricValues[metric].threshold} aria-label={`${label}阈值`} onChange={(event) => updateMetric(metric, "threshold", event.target.value)} />
                  <input className="form-input" type="number" min="0" step="0.5" value={metricValues[metric].penalty} aria-label={`${label}扣分`} onChange={(event) => updateMetric(metric, "penalty", event.target.value)} />
                </div>
              ))}
            </div>
            <div className="finding-penalty-section">
              <div className="finding-penalty-header"><span>规则级别</span><span>每条扣分</span></div>
              <div className="finding-penalty-list">
                {FINDING_RULES.map(({ severity, label }) => (
                  <label className="finding-penalty-rule" key={severity}>
                    <span>{label}<small>{severity}</small></span>
                    <input className="form-input" type="number" min="0" step="0.5" value={findingPenaltyValues[severity]} aria-label={`${severity}每条扣分`} onChange={(event) => setFindingPenaltyValues((current) => ({ ...current, [severity]: event.target.value }))} />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="progress-block">
          <div className="progress-meta"><span>{scanHint}</span><strong>{progress}%</strong></div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.max(progress, 8)}%` }} /></div>
        </div>
      )}

      <div className="form-actions">
        <button type="submit" disabled={loading} className="primary-button"><span aria-hidden="true">{loading ? "···" : "▶"}</span>{loading ? "正在分析" : "开始分析"}</button>
        <button type="button" className="secondary-button" onClick={onExportPdf} disabled={!canExportPdf || pdfLoading}><span aria-hidden="true">↓</span>{pdfLoading ? "正在生成" : "导出 PDF"}</button>
      </div>
    </form>
  );
}
