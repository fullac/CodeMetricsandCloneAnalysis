import type { ProjectMetrics } from "../types";

interface Props {
  metrics: ProjectMetrics;
}

type Grade = "A" | "B" | "C" | "D" | "E";

function gradeToScore(grade: Grade): number {
  const table: Record<Grade, number> = { A: 100, B: 80, C: 60, D: 40, E: 20 };
  return table[grade];
}

function numericToGrade(value?: string): Grade {
  const n = Number(value ?? "5");
  const rounded = Math.min(5, Math.max(1, Math.round(Number.isFinite(n) ? n : 5)));
  return ["A", "B", "C", "D", "E"][rounded - 1] as Grade;
}

function formatCount(value?: string): string {
  return value ?? "-";
}

export default function MetricsRadar({ metrics }: Props) {
  const axes = [
    {
      key: "reliability",
      label: "可靠性",
      grade: numericToGrade(metrics.software_quality_reliability_rating ?? metrics.reliability_rating),
      raw: `评级 ${metrics.software_quality_reliability_rating ?? metrics.reliability_rating ?? "-"} / 问题 ${formatCount(
        metrics.software_quality_reliability_issues
      )}`,
    },
    {
      key: "maintainability",
      label: "可维护性",
      grade: numericToGrade(metrics.sqale_rating),
      raw: metrics.sqale_rating ?? "-",
    },
    {
      key: "security",
      label: "安全热点",
      grade: numericToGrade(metrics.security_review_rating ?? metrics.security_rating),
      raw: metrics.security_review_rating ?? metrics.security_rating ?? "-",
    },
  ] as const;

  const cx = 150;
  const cy = 150;
  const radius = 105;

  const points = axes.map((axis, index) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const score = gradeToScore(axis.grade);
    const r = (radius * score) / 100;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    const lx = cx + (radius + 24) * Math.cos(angle);
    const ly = cy + (radius + 24) * Math.sin(angle);
    return { ...axis, angle, x, y, lx, ly, score };
  });

  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="neo-panel reveal rounded-3xl p-5 stagger-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">静态指标雷达图（A-E）</h3>
        <span className="rounded-full border border-cyan-300/65 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800">质量画像</span>
      </div>

      <svg viewBox="0 0 300 300" className="h-[320px] w-full">
        {[20, 40, 60, 80, 100].map((t) => (
          <circle key={t} cx={cx} cy={cy} r={(radius * t) / 100} fill="none" stroke="rgba(100,116,139,0.28)" strokeWidth="1" />
        ))}

        {points.map((axis, index) => {
          const x = cx + radius * Math.cos(axis.angle);
          const y = cy + radius * Math.sin(axis.angle);
          return <line key={index} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(100,116,139,0.42)" strokeWidth="1" />;
        })}

        <polygon points={polygon} fill="rgba(34,211,238,0.24)" stroke="#22d3ee" strokeWidth="2" />

        {points.map((axis, idx) => (
          <g key={idx}>
            <circle cx={axis.x} cy={axis.y} r="4" fill="#22d3ee">
              <title>{`${axis.label}: 评级 ${axis.grade}, 原始值 ${axis.raw}`}</title>
            </circle>
            <text x={axis.lx} y={axis.ly} textAnchor="middle" fontSize="12" fill="#334155">
              {`${axis.label}(${axis.grade})`}
            </text>
          </g>
        ))}
      </svg>

      <div className="grid gap-2 sm:grid-cols-3">
        {points.map((axis) => (
          <div key={axis.key} className="rounded-2xl border border-slate-300 bg-white/80 px-3 py-2 text-xs leading-5 text-slate-700 shadow-[0_8px_24px_-18px_rgba(30,64,175,0.35)]">
            <div className="font-semibold text-slate-900">{axis.label}</div>
            <div>评级 {axis.grade}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
