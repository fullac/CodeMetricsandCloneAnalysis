import { promises as fs } from "node:fs";
import { calculateCloneRate, detectClonePairs, detectClonePairsBetween, detectInternalClonePairs } from "../clone/cloneService.js";
import { createFingerprint, normalizeAstTokenLocations, type CloneFingerprint } from "../clone/fingerprint.js";
import { loadStoredFingerprints, saveProjectFingerprints } from "../clone/fingerprintStore.js";
import { aggregateProjectMetrics } from "../metrics/aggregate.js";
import { analyzeFileMetrics } from "../metrics/index.js";
import { calculateScore, DEFAULT_SCORE_PROFILE, resolveScoreProfile } from "../scoring/index.js";
import { runRules } from "../rules/engine.js";
import { discoverSourceFiles } from "./fileDiscovery.js";
import { parseSource } from "./parser.js";
import type {
  StaticAnalysisFileMetrics,
  StaticAnalysisScanOptions,
  StaticAnalysisScanReport,
} from "../../types/index.js";

type AnalyzedFile = {
  metrics: StaticAnalysisFileMetrics;
  fingerprint: CloneFingerprint;
  findings: ReturnType<typeof runRules>;
  internalClonePairs: ReturnType<typeof detectInternalClonePairs>;
};

async function analyzeSourceFile(
  sourceFile: Awaited<ReturnType<typeof discoverSourceFiles>>["files"][number],
  rulesEnabled: boolean,
  cloneDetectionEnabled: boolean,
): Promise<AnalyzedFile> {
  const content = await fs.readFile(sourceFile.absolutePath, "utf8");
  const tree = parseSource(content, sourceFile.language);
  const root = tree.rootNode;
  const metrics = analyzeFileMetrics({
    sourceFile,
    content,
    root,
  });

  return {
    metrics,
    fingerprint: createFingerprint({
      file: sourceFile.relativePath,
      language: sourceFile.language,
      root,
      ncloc: metrics.ncloc,
    }),
    findings: rulesEnabled ? runRules({
      file: sourceFile.relativePath,
      language: sourceFile.language,
      content,
      root,
      metrics,
    }) : [],
    internalClonePairs: cloneDetectionEnabled ? detectInternalClonePairs({
      file: sourceFile.relativePath,
      tokens: normalizeAstTokenLocations(root),
    }) : [],
  };
}

export async function analyzeSourceTree(input: {
  rootDir: string;
  projectKey: string;
  options: StaticAnalysisScanOptions;
  startedAt?: number;
}): Promise<StaticAnalysisScanReport> {
  const startedAt = input.startedAt ?? Date.now();
  const discovery = await discoverSourceFiles(input.rootDir, new Set(input.options.languages));
  const analyzedFiles = await Promise.all(discovery.files.map((sourceFile) => analyzeSourceFile(
    sourceFile,
    input.options.engines.rules,
    input.options.engines.cloneDetection,
  )));
  const fileMetrics = analyzedFiles.map((file) => file.metrics);
  const fingerprints = analyzedFiles.map((file) => file.fingerprint);
  const findings = analyzedFiles.flatMap((file) => file.findings);
  const historicalFingerprints = input.options.engines.cloneDetection
    ? await loadStoredFingerprints().catch((err) => {
      console.warn(`Load clone fingerprints failed: ${(err as Error).message}`);
      return [];
    })
    : [];
  const labeledHistoricalFingerprints = historicalFingerprints
    .filter((fingerprint) => fingerprint.projectKey !== input.projectKey)
    .map((fingerprint) => ({
      ...fingerprint,
      file: `history/${fingerprint.projectKey}/${fingerprint.file}`,
    }));
  const clonePairs = input.options.engines.cloneDetection
    ? [
      ...analyzedFiles.flatMap((file) => file.internalClonePairs),
      ...detectClonePairs({
        fingerprints,
        threshold: input.options.cloneThreshold,
      }),
      ...detectClonePairsBetween({
        currentFingerprints: fingerprints,
        historicalFingerprints: labeledHistoricalFingerprints,
        threshold: input.options.cloneThreshold,
      }),
    ]
      .sort((a, b) => {
        const kindOrder = (a.kind === "file" ? 0 : 1) - (b.kind === "file" ? 0 : 1);
        return kindOrder || b.jaccardSimilarity - a.jaccardSimilarity || b.matchingKGrams - a.matchingKGrams;
      })
      .slice(0, 50)
    : [];
  const cloneRate = calculateCloneRate({ clonePairs, fileMetrics });
  const scoringEnabled = input.options.scoring?.enabled !== false;
  const scoreProfile = scoringEnabled
    ? resolveScoreProfile({
      profileId: input.options.scoring?.profileId,
      custom: input.options.scoring?.custom,
    })
    : DEFAULT_SCORE_PROFILE;

  await saveProjectFingerprints({
    projectKey: input.projectKey,
    fingerprints,
  }).catch((err) => {
    console.warn(`Save clone fingerprints failed: ${(err as Error).message}`);
  });

  const report: StaticAnalysisScanReport = {
    projectKey: input.projectKey,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    metrics: aggregateProjectMetrics(fileMetrics, cloneRate, scoreProfile.metricThresholds),
    fileMetrics,
    findings,
    clonePairs,
  };

  if (scoringEnabled) {
    report.score = calculateScore({
      report,
      profile: scoreProfile,
      passScore: input.options.scoring?.passScore,
    });
  }

  return report;
}
