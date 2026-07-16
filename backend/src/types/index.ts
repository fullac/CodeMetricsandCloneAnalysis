export type StaticAnalysisLanguage = "python" | "java" | "c" | "cpp";

export type StaticAnalysisSeverity = "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR";

export type StaticAnalysisFindingType = "BUG" | "VULNERABILITY" | "CODE_SMELL";

export interface StaticAnalysisRule {
  id: string;
  severity: StaticAnalysisSeverity;
  type: StaticAnalysisFindingType;
  language: StaticAnalysisLanguage;
  description: string;
  query?: string;
  matcher?: "query" | "ast-walk";
}

export interface StaticAnalysisFinding {
  id: string;
  ruleId: string;
  severity: StaticAnalysisSeverity;
  type: StaticAnalysisFindingType;
  file: string;
  line: number;
  column: number;
  message: string;
  snippet: string;
}

export interface StaticAnalysisFunctionMetric {
  name: string;
  startLine: number;
  endLine: number;
  complexity: number;
  lines: number;
  nestingDepth: number;
  paramCount: number;
}

export interface StaticAnalysisFileMetrics {
  file: string;
  language: StaticAnalysisLanguage;
  totalLines: number;
  ncloc: number;
  commentLines: number;
  commentDensity: number;
  functionCount: number;
  classCount: number;
  importCount: number;
  functions: StaticAnalysisFunctionMetric[];
}

export interface StaticAnalysisClonePair {
  fileA: string;
  fileB: string;
  jaccardSimilarity: number;
  matchingKGrams: number;
}

export interface StaticAnalysisProjectMetrics {
  totalLines: number;
  ncloc: number;
  commentDensity: number;
  functionCount: number;
  classCount: number;
  avgComplexity: number;
  maxComplexity: number;
  overComplexFunctions: number;
  overLongFunctions: number;
  deeplyNestedFunctions: number;
  cloneRate: number;
}

export interface StaticAnalysisScanOptions {
  engines: {
    rules: boolean;
    cloneDetection: boolean;
  };
  languages: StaticAnalysisLanguage[];
  cloneThreshold: number;
}

export interface StaticAnalysisScanReport {
  projectKey: string;
  scannedAt: string;
  durationMs: number;
  metrics: StaticAnalysisProjectMetrics;
  fileMetrics: StaticAnalysisFileMetrics[];
  findings: StaticAnalysisFinding[];
  clonePairs: StaticAnalysisClonePair[];
}
