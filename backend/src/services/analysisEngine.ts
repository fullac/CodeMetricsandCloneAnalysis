import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { analyzeSourceTree } from "./analysis/analyzer.js";
import { isSupportedSourceFilename } from "./analysis/language.js";
import type {
  StaticAnalysisLanguage,
  StaticAnalysisCustomScoreProfile,
  StaticAnalysisScanOptions,
  StaticAnalysisScanReport,
} from "../types/index.js";

const DEFAULT_SCAN_OPTIONS: StaticAnalysisScanOptions = {
  engines: {
    rules: true,
    cloneDetection: true,
  },
  languages: ["python", "java", "c", "cpp"],
  cloneThreshold: 0.2,
  scoring: {
    enabled: true,
    profileId: "nankai-provisional-v1",
  },
};

export function normalizeScanOptions(input: unknown): StaticAnalysisScanOptions {
  const raw = input && typeof input === "object" ? input as Partial<StaticAnalysisScanOptions> : {};
  const engines = raw.engines && typeof raw.engines === "object" ? raw.engines : DEFAULT_SCAN_OPTIONS.engines;
  const languages = Array.isArray(raw.languages)
    ? raw.languages.filter((item): item is StaticAnalysisLanguage => item === "python" || item === "java" || item === "c" || item === "cpp")
    : DEFAULT_SCAN_OPTIONS.languages;
  const cloneThreshold = typeof raw.cloneThreshold === "number" && Number.isFinite(raw.cloneThreshold)
    ? Math.min(1, Math.max(0, raw.cloneThreshold))
    : DEFAULT_SCAN_OPTIONS.cloneThreshold;
  const scoring = raw.scoring && typeof raw.scoring === "object" ? raw.scoring : DEFAULT_SCAN_OPTIONS.scoring;
  const passScore = typeof scoring?.passScore === "number" && Number.isFinite(scoring.passScore)
    ? Math.min(100, Math.max(0, scoring.passScore))
    : undefined;
  const custom = normalizeCustomScoreProfile(scoring?.custom);

  return {
    engines: {
      rules: engines.rules ?? DEFAULT_SCAN_OPTIONS.engines.rules,
      cloneDetection: engines.cloneDetection ?? DEFAULT_SCAN_OPTIONS.engines.cloneDetection,
    },
    languages: languages.length ? languages : DEFAULT_SCAN_OPTIONS.languages,
    cloneThreshold,
    scoring: {
      enabled: scoring?.enabled ?? DEFAULT_SCAN_OPTIONS.scoring?.enabled ?? true,
      profileId: scoring?.profileId ?? DEFAULT_SCAN_OPTIONS.scoring?.profileId ?? "nankai-provisional-v1",
      ...(passScore === undefined ? {} : { passScore }),
      ...(custom ? { custom } : {}),
    },
  };
}

function normalizeCustomScoreProfile(value: unknown): StaticAnalysisCustomScoreProfile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as StaticAnalysisCustomScoreProfile;
  const metrics: StaticAnalysisCustomScoreProfile["metrics"] = {};
  for (const metric of ["maxComplexity", "maxFunctionLines", "maxNestingDepth", "cloneRate"] as const) {
    const candidate = raw.metrics?.[metric];
    if (!candidate || typeof candidate !== "object") continue;
    const threshold = typeof candidate.threshold === "number" && Number.isFinite(candidate.threshold)
      ? Math.max(0, candidate.threshold)
      : undefined;
    const penalty = typeof candidate.penalty === "number" && Number.isFinite(candidate.penalty)
      ? Math.max(0, candidate.penalty)
      : undefined;
    if (threshold !== undefined && penalty !== undefined) metrics[metric] = { threshold, penalty };
  }
  const findingPenalties: StaticAnalysisCustomScoreProfile["findingPenalties"] = {};
  for (const severity of ["BLOCKER", "CRITICAL", "MAJOR", "MINOR"] as const) {
    const penalty = raw.findingPenalties?.[severity];
    if (typeof penalty === "number" && Number.isFinite(penalty)) findingPenalties[severity] = Math.max(0, penalty);
  }
  const custom: StaticAnalysisCustomScoreProfile = {
    ...(typeof raw.id === "string" ? { id: raw.id } : {}),
    ...(typeof raw.version === "string" ? { version: raw.version } : {}),
    ...(typeof raw.title === "string" ? { title: raw.title } : {}),
    ...(typeof raw.passScore === "number" && Number.isFinite(raw.passScore) ? { passScore: Math.min(100, Math.max(0, raw.passScore)) } : {}),
    ...(Object.keys(findingPenalties).length ? { findingPenalties } : {}),
    ...(Object.keys(metrics).length ? { metrics } : {}),
  };
  return Object.keys(custom).length ? custom : undefined;
}

export function parseScanOptionsJson(value: unknown): StaticAnalysisScanOptions {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_SCAN_OPTIONS;
  }

  if (typeof value !== "string") {
    return normalizeScanOptions(value);
  }

  try {
    return normalizeScanOptions(JSON.parse(value));
  } catch {
    throw new Error("scanOptions must be valid JSON.");
  }
}

export function isSupportedAnalysisUpload(filename: string, mimetype: string): boolean {
  const lower = filename.toLowerCase();
  return mimetype === "application/zip"
    || lower.endsWith(".zip")
    || isSupportedSourceFilename(lower);
}

async function prepareInput(filePath: string, originalName: string): Promise<{ rootDir: string; cleanupDir: string }> {
  const cleanupDir = await fs.mkdtemp(path.join(os.tmpdir(), `analysis-${Date.now()}-`));
  const rootDir = path.join(cleanupDir, "source");
  await fs.mkdir(rootDir, { recursive: true });

  if (originalName.toLowerCase().endsWith(".zip")) {
    const zip = new AdmZip(filePath);
    zip.extractAllTo(rootDir, true);
  } else {
    await fs.copyFile(filePath, path.join(rootDir, path.basename(originalName)));
  }

  return { rootDir, cleanupDir };
}

export async function analyzeProject(input: {
  filePath: string;
  originalName: string;
  projectKey: string;
  options?: StaticAnalysisScanOptions;
}): Promise<StaticAnalysisScanReport> {
  const startedAt = Date.now();
  let cleanupDir = "";

  try {
    const prepared = await prepareInput(input.filePath, input.originalName);
    cleanupDir = prepared.cleanupDir;
    const report = await analyzeSourceTree({
      rootDir: prepared.rootDir,
      projectKey: input.projectKey,
      options: input.options ?? DEFAULT_SCAN_OPTIONS,
      startedAt,
    });
    return { ...report, sourceName: input.originalName };
  } finally {
    if (cleanupDir) {
      await fs.rm(cleanupDir, { recursive: true, force: true });
    }
    await fs.rm(input.filePath, { force: true });
  }
}
