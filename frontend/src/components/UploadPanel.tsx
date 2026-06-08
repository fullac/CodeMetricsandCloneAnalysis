import { FormEvent, useState } from "react";
import axios from "axios";
import type { ReviewResult } from "../types";

interface Props {
  onDone: (result: ReviewResult) => void;
  setError: (msg: string) => void;
}

export default function UploadPanel({ onDone, setError }: Props) {
  const [projectKey, setProjectKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scanHint, setScanHint] = useState("等待上传文件");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!file) {
      setError("请选择ZIP文件");
      return;
    }

    setLoading(true);
    setProgress(0);
    setScanHint("正在上传文件...");

    try {
      const form = new FormData();
      form.append("projectKey", projectKey.trim());
      form.append("file", file);

      const resp = await axios.post<ReviewResult>("/api/review", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (!event.total) return;
          const pct = Math.round((event.loaded / event.total) * 100);
          setProgress(pct);
          if (pct >= 100) {
            setScanHint("文件已上传，后端执行扫描与静态解析...");
          }
        },
      });

      setScanHint("解析完成，静态结果已返回页面。");
      onDone(resp.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err.message ?? "上传失败");
      setScanHint("扫描失败，请查看错误信息。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="neo-panel reveal rounded-3xl p-6 stagger-2">
      <h2 className="mb-4 text-xl font-semibold text-slate-900">项目上传与扫描</h2>
      <div className="mb-3">
        <label className="mb-1 block text-sm font-medium text-slate-700">Project Key</label>
        <input
          className="w-full rounded-xl border border-slate-300 bg-white/80 px-3 py-2 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-300/25"
          value={projectKey}
          onChange={(e) => setProjectKey(e.target.value)}
          placeholder="项目名称"
          required
        />
      </div>
      <div className="mb-2">
        <label className="mb-1 block text-sm font-medium text-slate-700">ZIP源码包</label>
        <input
          type="file"
          accept=".zip"
          className="block w-full rounded-xl border border-dashed border-slate-300 bg-white/70 p-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border file:border-cyan-200 file:bg-cyan-50 file:px-3 file:py-1.5 file:text-cyan-700 file:transition hover:file:bg-cyan-100"
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            setFile(picked);
            if (!picked) {
              setProjectKey("");
              return;
            }
            const autoKey = picked.name.replace(/\.[^.]+$/, "").trim();
            setProjectKey(autoKey);
          }}
          required
        />
      </div>
      <p className="mb-4 text-xs text-slate-500">
        仅使用字母、数字、`-`、`_`、`.`、`:`
      </p>
      <button
        type="submit"
        disabled={loading}
        className="neon-btn rounded-xl px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "扫描中..." : "开始审查"}
      </button>

      {loading && (
        <div className="mt-4 space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 shadow-[0_0_20px_rgba(56,189,248,0.42)] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>{scanHint}</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}
    </form>
  );
}
