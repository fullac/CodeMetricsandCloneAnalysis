import type { StaticAnalysisClonePair, StaticAnalysisFileMetrics } from "../../types/index.js";
import type { CloneFingerprint, NormalizedAstToken } from "./fingerprint.js";
import { DEFAULT_K_GRAM_SIZE, LSH_BANDS, LSH_ROWS, hashNormalizedTokens, jaccardFromHashes } from "./fingerprint.js";

const MAX_EXHAUSTIVE_COMPARISONS = 10_000;
const MIN_INTERNAL_CLONE_TOKENS = 24;
const MIN_INTERNAL_CLONE_LINES = 3;
const MAX_OCCURRENCES_PER_SEED = 20;

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
  const pairCount = fingerprints.length * (fingerprints.length - 1) / 2;
  if (pairCount <= MAX_EXHAUSTIVE_COMPARISONS) {
    const candidates: CandidatePair[] = [];
    for (let leftIndex = 0; leftIndex < fingerprints.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < fingerprints.length; rightIndex += 1) {
        candidates.push({ leftIndex, rightIndex });
      }
    }
    return candidates;
  }

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
  const maxPairs = input.maxPairs ?? 5;
  const candidates = createCandidates(input.fingerprints);
  const clonePairs: StaticAnalysisClonePair[] = [];

  for (const candidate of candidates) {
    const left = input.fingerprints[candidate.leftIndex];
    const right = input.fingerprints[candidate.rightIndex];
    const result = jaccardFromHashes(left.kGramHashes, right.kGramHashes);
    if (result.intersectionSize > 0 && result.similarity >= input.threshold) {
      clonePairs.push({
        fileA: left.file,
        fileB: right.file,
        kind: "file",
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
  const seenPairs = new Set<string>();
  const clonePairs: StaticAnalysisClonePair[] = [];

  const comparePair = (current: CloneFingerprint, historical: CloneFingerprint, historyIndex: number) => {
    const keyPair = `${current.file}:${historical.file}:${historyIndex}`;
    if (seenPairs.has(keyPair)) return;
    seenPairs.add(keyPair);
    const result = jaccardFromHashes(current.kGramHashes, historical.kGramHashes);
    if (result.intersectionSize > 0 && result.similarity >= input.threshold) {
      clonePairs.push({
        fileA: current.file,
        fileB: historical.file,
        kind: "file",
        jaccardSimilarity: result.similarity,
        matchingKGrams: result.intersectionSize,
      });
    }
  };

  if (input.currentFingerprints.length * input.historicalFingerprints.length <= MAX_EXHAUSTIVE_COMPARISONS) {
    input.currentFingerprints.forEach((current) => {
      input.historicalFingerprints.forEach((historical, historyIndex) => comparePair(current, historical, historyIndex));
    });
  } else {
    const buckets = new Map<string, number[]>();
    input.historicalFingerprints.forEach((fingerprint, historyIndex) => {
      for (let band = 0; band < LSH_BANDS; band += 1) {
        const key = bandKey(fingerprint, band);
        if (!key) continue;
        const bucket = buckets.get(key) ?? [];
        bucket.push(historyIndex);
        buckets.set(key, bucket);
      }
    });

    input.currentFingerprints.forEach((current) => {
      for (let band = 0; band < LSH_BANDS; band += 1) {
        const key = bandKey(current, band);
        if (!key) continue;
        for (const historyIndex of buckets.get(key) ?? []) {
          comparePair(current, input.historicalFingerprints[historyIndex], historyIndex);
        }
      }
    });
  }

  return clonePairs
    .sort((a, b) => b.jaccardSimilarity - a.jaccardSimilarity || b.matchingKGrams - a.matchingKGrams)
    .slice(0, maxPairs);
}

type InternalCloneCandidate = StaticAnalysisClonePair & {
  matchedTokens: number;
  tokenStartA: number;
  tokenEndA: number;
  tokenStartB: number;
  tokenEndB: number;
};

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA <= endB && startB <= endA;
}

export function detectInternalClonePairs(input: {
  file: string;
  tokens: NormalizedAstToken[];
  minTokens?: number;
  maxPairs?: number;
}): StaticAnalysisClonePair[] {
  const minTokens = Math.max(DEFAULT_K_GRAM_SIZE, input.minTokens ?? MIN_INTERNAL_CLONE_TOKENS);
  const maxPairs = input.maxPairs ?? 5;
  if (input.tokens.length < minTokens * 2) return [];

  const seedSize = DEFAULT_K_GRAM_SIZE;
  const buckets = new Map<number, number[]>();
  for (let index = 0; index <= input.tokens.length - seedSize; index += 1) {
    const hash = hashNormalizedTokens(input.tokens.slice(index, index + seedSize).map((token) => token.value));
    const bucket = buckets.get(hash) ?? [];
    if (bucket.length < MAX_OCCURRENCES_PER_SEED) bucket.push(index);
    buckets.set(hash, bucket);
  }

  const candidates: InternalCloneCandidate[] = [];
  const seen = new Set<string>();
  for (const starts of buckets.values()) {
    for (let left = 0; left < starts.length; left += 1) {
      for (let right = left + 1; right < starts.length; right += 1) {
        const startA = starts[left];
        const startB = starts[right];
        if (startB - startA < minTokens) continue;

        let matchedTokens = seedSize;
        while (
          startA + matchedTokens < startB
          && startB + matchedTokens < input.tokens.length
          && input.tokens[startA + matchedTokens].value === input.tokens[startB + matchedTokens].value
        ) {
          matchedTokens += 1;
        }
        if (matchedTokens < minTokens) continue;

        const endA = startA + matchedTokens - 1;
        const endB = startB + matchedTokens - 1;
        const startLineA = input.tokens[startA].line;
        const endLineA = input.tokens[endA].line;
        const startLineB = input.tokens[startB].line;
        const endLineB = input.tokens[endB].line;
        if (
          endLineA - startLineA + 1 < MIN_INTERNAL_CLONE_LINES
          || endLineB - startLineB + 1 < MIN_INTERNAL_CLONE_LINES
        ) continue;

        const key = `${startLineA}:${endLineA}:${startLineB}:${endLineB}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          fileA: input.file,
          fileB: input.file,
          kind: "block",
          startLineA,
          endLineA,
          startLineB,
          endLineB,
          jaccardSimilarity: 1,
          matchingKGrams: matchedTokens - seedSize + 1,
          matchedTokens,
          tokenStartA: startA,
          tokenEndA: endA,
          tokenStartB: startB,
          tokenEndB: endB,
        });
      }
    }
  }

  const selected: InternalCloneCandidate[] = [];
  for (const candidate of candidates.sort((a, b) => b.matchedTokens - a.matchedTokens)) {
    const duplicatesExisting = selected.some((item) =>
      rangesOverlap(candidate.tokenStartA, candidate.tokenEndA, item.tokenStartA, item.tokenEndA)
      && rangesOverlap(candidate.tokenStartB, candidate.tokenEndB, item.tokenStartB, item.tokenEndB));
    if (!duplicatesExisting) selected.push(candidate);
    if (selected.length >= maxPairs) break;
  }

  return selected.map(({ matchedTokens: _matchedTokens, tokenStartA: _tokenStartA, tokenEndA: _tokenEndA, tokenStartB: _tokenStartB, tokenEndB: _tokenEndB, ...pair }) => pair);
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
  const clonedLinesByFile = new Map<string, Set<number>>();
  for (const pair of input.clonePairs) {
    if (pair.kind === "block" && pair.fileA === pair.fileB && pair.startLineA && pair.endLineA && pair.startLineB && pair.endLineB) {
      const lines = clonedLinesByFile.get(pair.fileA) ?? new Set<number>();
      for (let line = pair.startLineA; line <= pair.endLineA; line += 1) lines.add(line);
      for (let line = pair.startLineB; line <= pair.endLineB; line += 1) lines.add(line);
      clonedLinesByFile.set(pair.fileA, lines);
      continue;
    }
    if (nclocByFile.has(pair.fileA)) clonedFiles.add(pair.fileA);
    if (nclocByFile.has(pair.fileB)) clonedFiles.add(pair.fileB);
  }

  const wholeFileLines = Array.from(clonedFiles).reduce((sum, file) => sum + (nclocByFile.get(file) ?? 0), 0);
  const partialLines = Array.from(clonedLinesByFile.entries()).reduce((sum, [file, lines]) => {
    if (clonedFiles.has(file)) return sum;
    return sum + Math.min(nclocByFile.get(file) ?? 0, lines.size);
  }, 0);
  const clonedLines = wholeFileLines + partialLines;
  return Math.min(1, clonedLines / totalNcloc);
}
