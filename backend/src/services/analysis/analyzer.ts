import { promises as fs } from "node:fs";
import { calculateCloneRate, detectClonePairs, detectClonePairsBetween } from "../clone/cloneService.js";
import { createFingerprint, type CloneFingerprint } from "../clone/fingerprint.js";
import { loadStoredFingerprints, saveProjectFingerprints } from "../clone/fingerprintStore.js";
import { aggregateProjectMetrics } from "../metrics/aggregate.js";
import { analyzeFileMetrics } from "../metrics/index.js";
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
};

async function analyzeSourceFile(sourceFile: Awaited<ReturnType<typeof discoverSourceFiles>>["files"][number]): Promise<AnalyzedFile> {
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
  const analyzedFiles = await Promise.all(discovery.files.map((sourceFile) => analyzeSourceFile(sourceFile)));
  const fileMetrics = analyzedFiles.map((file) => file.metrics);
  const fingerprints = analyzedFiles.map((file) => file.fingerprint);
  const historicalFingerprints = input.options.engines.cloneDetection
    ? await loadStoredFingerprints().catch((err) => {
      console.warn(`Load clone fingerprints failed: ${(err as Error).message}`);
      return [];
    })
    : [];
  const labeledHistoricalFingerprints = historicalFingerprints.map((fingerprint) => ({
    ...fingerprint,
    file: `history/${fingerprint.projectKey}/${fingerprint.file}`,
  }));
  const clonePairs = input.options.engines.cloneDetection
    ? [
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
      .sort((a, b) => b.jaccardSimilarity - a.jaccardSimilarity || b.matchingKGrams - a.matchingKGrams)
      .slice(0, 50)
    : [];
  const cloneRate = calculateCloneRate({ clonePairs, fileMetrics });

  await saveProjectFingerprints({
    projectKey: input.projectKey,
    fingerprints,
  }).catch((err) => {
    console.warn(`Save clone fingerprints failed: ${(err as Error).message}`);
  });

  return {
    projectKey: input.projectKey,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    metrics: aggregateProjectMetrics(fileMetrics, cloneRate),
    fileMetrics,
    findings: [],
    clonePairs,
  };
}
