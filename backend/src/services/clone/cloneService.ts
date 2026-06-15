import type { StaticAnalysisClonePair, StaticAnalysisFileMetrics } from "../../types/index.js";
import type { CloneFingerprint } from "./fingerprint.js";
import { LSH_BANDS, LSH_ROWS, jaccardFromHashes } from "./fingerprint.js";

type CandidatePair = {
  leftIndex: number;
  rightIndex: number;
};

function pairKey(leftIndex: number, rightIndex: number): string {
  return leftIndex < rightIndex ? `${leftIndex}:${rightIndex}` : `${rightIndex}:${leftIndex}`;
}

function bandKey(fingerprint: CloneFingerprint, bandIndex: number): string | null {
  if (fingerprint.signature.length < LSH_BANDS * LSH_ROWS) {
    return null;
  }

  const start = bandIndex * LSH_ROWS;
  const values = fingerprint.signature.slice(start, start + LSH_ROWS);
  return `${bandIndex}:${values.join(",")}`;
}

function createCandidates(fingerprints: CloneFingerprint[]): CandidatePair[] {
  const buckets = new Map<string, number[]>();
  const seenPairs = new Set<string>();
  const candidates: CandidatePair[] = [];

  fingerprints.forEach((fingerprint, index) => {
    for (let band = 0; band < LSH_BANDS; band += 1) {
      const key = bandKey(fingerprint, band);
      if (!key) {
        continue;
      }
      const bucket = buckets.get(key) ?? [];
      for (const otherIndex of bucket) {
        const keyPair = pairKey(index, otherIndex);
        if (!seenPairs.has(keyPair)) {
          seenPairs.add(keyPair);
          candidates.push({
            leftIndex: Math.min(index, otherIndex),
            rightIndex: Math.max(index, otherIndex),
          });
        }
      }
      bucket.push(index);
      buckets.set(key, bucket);
    }
  });

  return candidates;
}

export function detectClonePairs(input: {
  fingerprints: CloneFingerprint[];
  threshold: number;
  maxPairs?: number;
}): StaticAnalysisClonePair[] {
  const maxPairs = input.maxPairs ?? 50;
  const candidates = createCandidates(input.fingerprints);
  const clonePairs: StaticAnalysisClonePair[] = [];

  for (const candidate of candidates) {
    const left = input.fingerprints[candidate.leftIndex];
    const right = input.fingerprints[candidate.rightIndex];
    const result = jaccardFromHashes(left.kGramHashes, right.kGramHashes);
    if (result.similarity >= input.threshold) {
      clonePairs.push({
        fileA: left.file,
        fileB: right.file,
        jaccardSimilarity: result.similarity,
        matchingKGrams: result.intersectionSize,
      });
    }
  }

  return clonePairs
    .sort((a, b) => b.jaccardSimilarity - a.jaccardSimilarity || b.matchingKGrams - a.matchingKGrams)
    .slice(0, maxPairs);
}

export function detectClonePairsBetween(input: {
  currentFingerprints: CloneFingerprint[];
  historicalFingerprints: CloneFingerprint[];
  threshold: number;
  maxPairs?: number;
}): StaticAnalysisClonePair[] {
  const maxPairs = input.maxPairs ?? 50;
  const buckets = new Map<string, number[]>();
  const seenPairs = new Set<string>();
  const clonePairs: StaticAnalysisClonePair[] = [];

  input.historicalFingerprints.forEach((fingerprint, historyIndex) => {
    for (let band = 0; band < LSH_BANDS; band += 1) {
      const key = bandKey(fingerprint, band);
      if (!key) {
        continue;
      }
      const bucket = buckets.get(key) ?? [];
      bucket.push(historyIndex);
      buckets.set(key, bucket);
    }
  });

  input.currentFingerprints.forEach((current) => {
    for (let band = 0; band < LSH_BANDS; band += 1) {
      const key = bandKey(current, band);
      if (!key) {
        continue;
      }
      const bucket = buckets.get(key) ?? [];
      for (const historyIndex of bucket) {
        const historical = input.historicalFingerprints[historyIndex];
        const keyPair = `${current.file}:${historical.file}:${historyIndex}`;
        if (seenPairs.has(keyPair)) {
          continue;
        }
        seenPairs.add(keyPair);
        const result = jaccardFromHashes(current.kGramHashes, historical.kGramHashes);
        if (result.similarity >= input.threshold) {
          clonePairs.push({
            fileA: current.file,
            fileB: historical.file,
            jaccardSimilarity: result.similarity,
            matchingKGrams: result.intersectionSize,
          });
        }
      }
    }
  });

  return clonePairs
    .sort((a, b) => b.jaccardSimilarity - a.jaccardSimilarity || b.matchingKGrams - a.matchingKGrams)
    .slice(0, maxPairs);
}

export function calculateCloneRate(input: {
  clonePairs: StaticAnalysisClonePair[];
  fileMetrics: StaticAnalysisFileMetrics[];
}): number {
  const nclocByFile = new Map(input.fileMetrics.map((file) => [file.file, file.ncloc]));
  const totalNcloc = input.fileMetrics.reduce((sum, file) => sum + file.ncloc, 0);
  if (totalNcloc === 0) {
    return 0;
  }

  const clonedFiles = new Set<string>();
  for (const pair of input.clonePairs) {
    clonedFiles.add(pair.fileA);
    clonedFiles.add(pair.fileB);
  }

  const clonedLines = Array.from(clonedFiles).reduce((sum, file) => sum + (nclocByFile.get(file) ?? 0), 0);
  return Math.min(1, clonedLines / totalNcloc);
}
