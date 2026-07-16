import type { StaticAnalysisScanReport } from "../../types/index.js";

export type ScoreModelInput = {
  report: StaticAnalysisScanReport;
};

export type ScoreModelResult = {
  score: number;
};
