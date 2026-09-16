import test from "node:test";
import assert from "node:assert/strict";
import { calculateCloneRate, detectClonePairs, detectInternalClonePairs } from "./cloneService.js";
import { createKGramHashes, type CloneFingerprint, type NormalizedAstToken } from "./fingerprint.js";

function fingerprint(file: string, kGramHashes: number[]): CloneFingerprint {
  return {
    file,
    language: "python",
    tokenCount: 20,
    kGramSize: 12,
    kGramHashes,
    signature: [],
    ncloc: 10,
  };
}

test("creates a fingerprint hash for source shorter than the configured k-gram", () => {
  assert.equal(createKGramHashes(["ID", "return"], 12).length, 1);
});

test("compares every pair in ordinary-sized projects instead of relying only on LSH", () => {
  const pairs = detectClonePairs({
    fingerprints: [fingerprint("a.py", [1, 2, 3]), fingerprint("b.py", [1, 2, 4])],
    threshold: 0.5,
  });

  assert.equal(pairs.length, 1);
  assert.equal(pairs[0]?.jaccardSimilarity, 0.5);
  assert.equal(pairs[0]?.kind, "file");
});

test("does not compare a single file with itself", () => {
  const pairs = detectClonePairs({ fingerprints: [fingerprint("only.py", [1, 2, 3])], threshold: 0.5 });
  assert.deepEqual(pairs, []);
});

test("does not report unrelated or empty fingerprints when threshold is zero", () => {
  const pairs = detectClonePairs({
    fingerprints: [fingerprint("a.py", []), fingerprint("b.py", [4, 5, 6])],
    threshold: 0,
  });
  assert.deepEqual(pairs, []);
});

test("detects non-overlapping repeated blocks inside one file", () => {
  const block = Array.from({ length: 28 }, (_, index) => `TOKEN_${index}`);
  const values = [...block, "GAP_A", "GAP_B", ...block];
  const tokens: NormalizedAstToken[] = values.map((value, index) => ({
    value,
    line: index < block.length ? Math.floor(index / 2) + 1 : Math.floor((index - block.length - 2) / 2) + 20,
  }));

  const pairs = detectInternalClonePairs({ file: "repeat.py", tokens });
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0]?.kind, "block");
  assert.equal(pairs[0]?.fileA, "repeat.py");
  assert.equal(pairs[0]?.fileB, "repeat.py");
  assert.equal(pairs[0]?.startLineA, 1);
  assert.equal(pairs[0]?.startLineB, 20);
});

test("ignores repeated structures that span only two lines", () => {
  const block = Array.from({ length: 30 }, (_, index) => `TOKEN_${index}`);
  const values = [...block, "GAP_A", "GAP_B", ...block];
  const tokens: NormalizedAstToken[] = values.map((value, index) => {
    if (index < block.length) return { value, line: index < 15 ? 1 : 2 };
    if (index < block.length + 2) return { value, line: 5 };
    return { value, line: index < block.length + 2 + 15 ? 10 : 11 };
  });

  assert.deepEqual(detectInternalClonePairs({ file: "data.py", tokens }), []);
});

test("counts only repeated line ranges for internal clone rate", () => {
  const rate = calculateCloneRate({
    clonePairs: [{
      fileA: "repeat.py",
      fileB: "repeat.py",
      kind: "block",
      startLineA: 1,
      endLineA: 10,
      startLineB: 21,
      endLineB: 30,
      jaccardSimilarity: 1,
      matchingKGrams: 20,
    }],
    fileMetrics: [{
      file: "repeat.py",
      language: "python",
      totalLines: 100,
      ncloc: 100,
      commentLines: 0,
      commentDensity: 0,
      functionCount: 0,
      classCount: 0,
      importCount: 0,
      functions: [],
    }],
  });

  assert.equal(rate, 0.2);
});
