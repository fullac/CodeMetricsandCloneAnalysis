import type { StaticAnalysisCustomScoreProfile, StaticAnalysisScanReport, StaticAnalysisScore, StaticAnalysisScoreMetric, StaticAnalysisSeverity } from "../../types/index.js";

export type ScoreModelInput = {
  report: StaticAnalysisScanReport;
  profile: ScoreProfile;
  passScore?: number;
};

export type ScoreMetricRule = {
  threshold: number;
  penalty: number;
};

export type ScoreProfile = {
  id: string;
  version: string;
  title: string;
  provenance: "official" | "provisional" | "custom";
  findingPenalties: Record<StaticAnalysisSeverity, number>;
  metricPenalties: {
    overComplexFunction: number;
    overLongFunction: number;
    deeplyNestedFunction: number;
    cloneRateWeight: number;
  };
  metricThresholds?: Partial<Record<StaticAnalysisScoreMetric, ScoreMetricRule>>;
  passScore: number;
};

export type ScoreModelResult = StaticAnalysisScore;

export type { StaticAnalysisCustomScoreProfile };
