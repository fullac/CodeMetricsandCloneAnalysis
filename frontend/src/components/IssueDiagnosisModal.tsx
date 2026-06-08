import type { ReviewIssue } from "../types";

interface Props {
  open: boolean;
  title: string;
  subtitle: string;
  itemLabel: string;
  issues: ReviewIssue[];
  selectedIssueKeys: string[];
  loading?: boolean;
  onToggleIssue: (issueKey: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function IssueDiagnosisModal({
  open,
  title,
  subtitle,
  itemLabel,
  issues,
  selectedIssueKeys,
  loading = false,
  onToggleIssue,
  onToggleAll,
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null;

  const selectedCount = selectedIssueKeys.length;
  const allChecked = issues.length > 0 && selectedCount === issues.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-6 backdrop-blur-sm">
      <div className="neo-panel flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl">
        <div className="border-b border-slate-300 bg-gradient-to-r from-cyan-50 to-indigo-50 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            </div>
            <button onClick={onClose} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">
              关闭
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="mb-4 flex items-center justify-between text-sm text-slate-700">
            <span>可选{itemLabel}：{issues.length}</span>
            <span>已选：{selectedCount}</span>
          </div>
          <div className="mb-4">
            <button
              onClick={() => onToggleAll(!allChecked)}
              className="rounded-xl border border-cyan-300/65 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-800 transition hover:bg-cyan-100"
            >
              {allChecked ? `取消全选${itemLabel}` : `全选${itemLabel}`}
            </button>
          </div>

          <div className="grid gap-3">
            {issues.map((issue) => {
              const checked = selectedIssueKeys.includes(issue.key);
              return (
                <label
                  key={issue.key}
                  className={`cursor-pointer rounded-2xl border p-4 transition ${
                    checked ? "border-cyan-300/75 bg-cyan-50" : "border-slate-300 bg-white/70 hover:border-slate-400"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => onToggleIssue(issue.key, e.target.checked)}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-cyan-700">{issue.severity}</span>
                        <span>{issue.component}:{issue.line ?? "-"}</span>
                        {issue.rule ? <span>{issue.rule}</span> : null}
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-900">{issue.message}</div>
                      <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs leading-6 text-slate-700">
                        {issue.snippet?.trim() ? issue.snippet : "该 issue 暂无可用代码片段"}
                      </pre>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-300 bg-slate-50/75 px-6 py-4">
          <button onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-slate-400 hover:bg-slate-50">
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || selectedCount === 0}
            className="neon-btn rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "诊断中..." : `确认并诊断 (${selectedCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
