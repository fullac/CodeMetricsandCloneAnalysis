import { useEffect, useMemo, useState, type ReactNode } from "react";
import Editor from "@monaco-editor/react";
import type { IssueDiagnosisResult, ReviewIssue } from "../types";

interface Props {
  title: string;
  issues: ReviewIssue[];
  issueDiagnoses: Record<string, IssueDiagnosisResult>;
  headerAction?: ReactNode;
}

export default function IssueViewer({
  title,
  issues,
  issueDiagnoses,
  headerAction,
}: Props) {
  const [activeKey, setActiveKey] = useState<string>(issues[0]?.key ?? "");

  useEffect(() => {
    setActiveKey(issues[0]?.key ?? "");
  }, [issues]);

  const active = useMemo(
    () => issues.find((item) => item.key === activeKey) ?? issues[0],
    [issues, activeKey]
  );

  if (!issues.length) {
    return (
      <section className="neo-panel reveal rounded-2xl p-6 stagger-3">
        <h2 className="mb-2 text-xl font-semibold text-slate-900">{title}</h2>
        <p className="text-slate-600">暂无缺陷数据</p>
      </section>
    );
  }

  return (
    <section className="neo-panel reveal grid gap-4 rounded-2xl p-5 lg:grid-cols-2">
      <div className="max-h-[620px] overflow-auto rounded-xl border border-slate-300 bg-white/65">
        <div className="sticky top-0 z-20 border-b border-slate-300 bg-white/85 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {headerAction ? <div>{headerAction}</div> : null}
          </div>
        </div>

        <div className="space-y-2 p-4">
          {issues.map((item) => {
            const diag = issueDiagnoses[item.key];
            return (
              <button
                key={item.key}
                onClick={() => setActiveKey(item.key)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  active?.key === item.key
                    ? "border-cyan-300/70 bg-cyan-50 shadow-[0_10px_26px_-14px_rgba(45,212,191,0.32)]"
                    : "border-slate-300 bg-white/70 hover:border-slate-400"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">{item.severity} · {item.type}</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{item.message}</p>
                    <p className="mt-1 break-all text-xs text-slate-500">{item.component}:{item.line ?? "-"}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-300 bg-white/80 p-3 text-xs text-slate-700 whitespace-pre-wrap">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">LLM诊断</span>
                  </div>
                  {diag ? (
                    <div className="mb-1 text-emerald-700">{diag.valid ? "有效" : "存疑"}｜{diag.advice}</div>
                  ) : (
                    "未诊断"
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-300 bg-gradient-to-br from-white via-slate-50 to-cyan-50 p-4">
        <h3 className="mb-2 text-lg font-semibold text-slate-900">代码片段</h3>
        <div className="overflow-hidden rounded-lg border border-slate-300 shadow-[0_18px_30px_-20px_rgba(30,64,175,0.24)]">
          <Editor
            height="420px"
            defaultLanguage="plaintext"
            value={active?.snippet?.trim() ? active.snippet : "该问题暂无可用代码片段"}
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }}
          />
        </div>
      </div>
    </section>
  );
}
