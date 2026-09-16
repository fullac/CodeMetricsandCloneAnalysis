import type { StaticAnalysisCustomScoreProfile, StaticAnalysisFinding, StaticAnalysisScanReport, StaticAnalysisScoreMetric } from "../../types/index.js";
import type { ScoreMetricRule, ScoreModelInput, ScoreModelResult, ScoreProfile } from "./types.js";

export type { ScoreModelInput, ScoreModelResult, ScoreProfile } from "./types.js";

export const DEFAULT_SCORE_PROFILE: ScoreProfile = {
  id: "nankai-provisional-v1",
  version: "1.2.0",
  title: "南开代码质量评分（临时档案）",
  provenance: "provisional",
  findingPenalties: {
    BLOCKER: 5,
    CRITICAL: 3,
    MAJOR: 1,
    MINOR: 0.5,
  },
  metricPenalties: {
    overComplexFunction: 1,
    overLongFunction: 0.5,
    deeplyNestedFunction: 0.5,
    cloneRateWeight: 10,
  },
  metricThresholds: {
    maxComplexity: { threshold: 20, penalty: 1 },
    maxFunctionLines: { threshold: 150, penalty: 0.5 },
    maxNestingDepth: { threshold: 6, penalty: 0.5 },
    cloneRate: { threshold: 0.2, penalty: 10 },
  },
  passScore: 60,
};

const SCORE_PROFILES: Record<string, ScoreProfile> = {
  [DEFAULT_SCORE_PROFILE.id]: DEFAULT_SCORE_PROFILE,
};

export function getScoreProfile(profileId = DEFAULT_SCORE_PROFILE.id): ScoreProfile {
  const profile = SCORE_PROFILES[profileId];
  if (!profile) {
    throw new Error(`Unknown score profile: ${profileId}`);
  }
  return profile;
}

export function calculateScore(input: ScoreModelInput): ScoreModelResult {
  const passScore = Math.min(100, Math.max(0, input.passScore ?? input.profile.passScore));
  const deductions: ScoreModelResult["deductions"] = [];
  const findingsBySeverity = new Map<string, StaticAnalysisFinding[]>();

  for (const finding of input.report.findings) {
    const list = findingsBySeverity.get(finding.severity) ?? [];
    list.push(finding);
    findingsBySeverity.set(finding.severity, list);
  }

  for (const [severity, findings] of findingsBySeverity) {
    const points = findings.length * input.profile.findingPenalties[severity as keyof typeof input.profile.findingPenalties];
    if (points > 0) {
      deductions.push({
        category: "finding",
        label: `${severity} 规则问题`,
        count: findings.length,
        points,
      });
    }
  }

  const functions = input.report.fileMetrics.flatMap((file) => file.functions);
  const metricRules = input.profile.metricThresholds;
  const metricItems: Array<{ metric: StaticAnalysisScoreMetric; category: string; label: string; values: number[]; aggregateCount: number }> = [
    { metric: "maxComplexity", category: "maxComplexity", label: "函数复杂度超阈值", values: functions.map((item) => item.complexity), aggregateCount: input.report.metrics.overComplexFunctions },
    { metric: "maxFunctionLines", category: "maxFunctionLines", label: "函数行数超阈值", values: functions.map((item) => item.lines), aggregateCount: input.report.metrics.overLongFunctions },
    { metric: "maxNestingDepth", category: "maxNestingDepth", label: "函数嵌套深度超阈值", values: functions.map((item) => item.nestingDepth), aggregateCount: input.report.metrics.deeplyNestedFunctions },
    { metric: "cloneRate", category: "cloneRate", label: "项目克隆率超阈值", values: [input.report.metrics.cloneRate], aggregateCount: 0 },
  ];
  for (const item of metricItems) {
    const rule = metricRules?.[item.metric];
    if (!rule || rule.penalty <= 0) continue;
    const violations = item.values.length > 0
      ? item.values.filter((value) => value > rule.threshold).length
      : item.aggregateCount;
    if (!violations) continue;
    const points = item.metric === "cloneRate"
      ? Math.max(0, item.values[0] - rule.threshold) * rule.penalty
      : violations * rule.penalty;
    if (points > 0) {
      deductions.push({ category: item.category, label: `${item.label}（>${rule.threshold}）`, count: item.metric === "cloneRate" ? undefined : violations, points });
    }
  }

  const totalDeduction = deductions.reduce((sum, item) => sum + item.points, 0);
  const score = Math.max(0, Math.min(100, 100 - totalDeduction));
  const passed = score >= passScore;
  return {
    profileId: input.profile.id,
    profileVersion: input.profile.version,
    provenance: input.profile.provenance,
    score,
    maxScore: 100,
    passScore,
    passed,
    deductions,
    failureReasons: passed ? [] : [
      `得分 ${score.toFixed(1)} 低于通过线 ${passScore.toFixed(1)}`,
      ...deductions
        .filter((item) => item.category !== "finding" || item.points > 0)
        .map((item) => `${item.label}扣 ${item.points.toFixed(1)} 分`),
    ],
  };
}

function toMetricRule(value: unknown, fallback: ScoreMetricRule): ScoreMetricRule {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<ScoreMetricRule>;
  const threshold = typeof raw.threshold === "number" && Number.isFinite(raw.threshold) ? Math.max(0, raw.threshold) : fallback.threshold;
  const penalty = typeof raw.penalty === "number" && Number.isFinite(raw.penalty) ? Math.max(0, raw.penalty) : fallback.penalty;
  return { threshold, penalty };
}

export function createCustomScoreProfile(custom: StaticAnalysisCustomScoreProfile): ScoreProfile {
  const defaults = DEFAULT_SCORE_PROFILE;
  const metrics = custom.metrics ?? {};
  const metricThresholds: ScoreProfile["metricThresholds"] = {};
  for (const key of ["maxComplexity", "maxFunctionLines", "maxNestingDepth", "cloneRate"] as const) {
    if (metrics[key] !== undefined) {
      metricThresholds[key] = toMetricRule(metrics[key], defaults.metricThresholds?.[key] ?? { threshold: 0, penalty: 0 });
    }
  }
  return {
    id: custom.id?.trim() || "custom-gate",
    version: custom.version?.trim() || "1.0.0",
    title: custom.title?.trim() || "自定义评分标准",
    provenance: "custom",
    findingPenalties: {
      ...defaults.findingPenalties,
      ...(custom.findingPenalties ?? {}),
    },
    metricPenalties: defaults.metricPenalties,
    metricThresholds,
    passScore: typeof custom.passScore === "number" && Number.isFinite(custom.passScore)
      ? Math.min(100, Math.max(0, custom.passScore))
      : defaults.passScore,
  };
}

export function resolveScoreProfile(input: { profileId?: string; custom?: StaticAnalysisCustomScoreProfile } = {}): ScoreProfile {
  return input.custom ? createCustomScoreProfile(input.custom) : getScoreProfile(input.profileId);
}

export function scoreReport(report: StaticAnalysisScanReport, input: { profileId?: string; passScore?: number; custom?: StaticAnalysisCustomScoreProfile } = {}): ScoreModelResult {
  const profile = resolveScoreProfile(input);
  return calculateScore({
    report,
    profile,
    passScore: input.passScore,
  });
}
