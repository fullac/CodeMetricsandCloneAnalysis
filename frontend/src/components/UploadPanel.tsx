import { FormEvent, useState } from "react";
import axios from "axios";
import type { StaticAnalysisScanReport } from "../types";

interface Props {
  onDone: (result: StaticAnalysisScanReport) => void;
  setError: (msg: string) => void;
  canExportPdf: boolean;
  pdfLoading: boolean;
  onExportPdf: () => void;
}

const PROJECT_NAME_MAX_LENGTH = 20;

function normalizeProjectName(value: string): string {
  return value.trim().slice(0, PROJECT_NAME_MAX_LENGTH);
}

export default function UploadPanel({ onDone, setError, canExportPdf, pdfLoading, onExportPdf }: Props) {
  const [projectKey, setProjectKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scanHint, setScanHint] = useState("等待上传文件");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!file) {
      setError("请选择源码文件或ZIP包");
      return;
    }

    setLoading(true);
    setProgress(0);
    setScanHint("正在上传文件...");

    try {
      const form = new FormData();
      form.append("projectKey", projectKey.trim());
      form.append("file", file);

      const resp = await axios.post<StaticAnalysisScanReport>("/api/analyze", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (!event.total) return;
          const pct = Math.round((event.loaded / event.total) * 100);
          setProgress(pct);
          if (pct >= 100) {
            setScanHint("文件已上传，后端执行AST解析与指标计算...");
          }
        },
      });

      setScanHint("解析完成，分析结果已返回页面。");
      onDone(resp.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message ?? "上传失败");
      setScanHint("扫描失败，请查看错误信息。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="surface-panel upload-panel reveal">
      <div className="section-heading upload-heading">
        <h2>项目上传与分析</h2>
        <span className="count-badge">ZIP / source</span>
      </div>

      <div className="form-grid">
        <label className="field-block">
          <span>项目名称</span>
          <input
            className="form-input"
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value.slice(0, PROJECT_NAME_MAX_LENGTH))}
            placeholder="不超过20个字符"
            maxLength={PROJECT_NAME_MAX_LENGTH}
            required
          />
        </label>

        <label className="field-block">
          <span>源码文件 / ZIP包</span>
          <input
            type="file"
            accept=".zip,.py,.java,.c,.h,.cpp,.cc,.cxx,.hpp,.hh,.hxx"
            className="file-input"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              setFile(picked);
              if (!picked) {
                setProjectKey("");
                return;
              }
              const autoKey = normalizeProjectName(picked.name.replace(/\.[^.]+$/, ""));
              setProjectKey(autoKey);
            }}
            required
          />
        </label>
      </div>

      <p className="support-text">
        支持 `.zip`、`.py`、`.java`、`.c`、`.h`、`.cpp`、`.cc`、`.cxx`、`.hpp`
      </p>

      <div className="form-actions">
        <button type="submit" disabled={loading} className="primary-button">
          {loading ? "分析中..." : "开始分析"}
        </button>
        <button type="button" className="report-button" onClick={onExportPdf} disabled={!canExportPdf || pdfLoading}>
          {pdfLoading ? "生成中" : "导出 PDF"}
        </button>
      </div>

      {loading && (
        <div className="progress-block">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-meta">
            <span>{scanHint}</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}
    </form>
  );
}
