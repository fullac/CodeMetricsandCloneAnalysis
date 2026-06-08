export interface ReviewIssue {
  key: string;
  severity: string;
  type: string;
  message: string;
  component: string;
  line?: number;
  rule?: string;
  snippet?: string;
  suggestion?: string;
  llmDiagnosis?: string;
  sourceKind?: "ISSUE" | "HOTSPOT";
}

export interface ProjectDiagnosisResult {
  diagnosis: string;
  rawOutput: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface ProjectMetrics {
  duplicated_lines_density?: string;
  sqale_rating?: string;
  sqale_index?: string;
  reliability_rating?: string;
  software_quality_reliability_rating?: string;
  software_quality_reliability_issues?: string;
  security_rating?: string;
  coverage?: string;
  bugs?: string;
  vulnerabilities?: string;
  code_smells?: string;
  ncloc?: string;
  complexity?: string;
  security_review_rating?: string;
}

export interface ReviewResult {
  projectKey: string;
  scannedAt: string;
  metrics: ProjectMetrics;
  projectDiagnosis?: string;
  issues: ReviewIssue[];
  securityHotspots: ReviewIssue[];
}

export interface IssueDiagnosisResult {
  issueKey: string;
  valid: boolean;
  advice: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}
