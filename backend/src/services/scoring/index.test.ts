import test from "node:test";
import assert from "node:assert/strict";
import { calculateScore, createCustomScoreProfile, DEFAULT_SCORE_PROFILE, scoreReport } from "./index.js";
import type { StaticAnalysisScanReport } from "../../types/index.js";

function report(): StaticAnalysisScanReport {
  return {
    projectKey: "fixture",
    scannedAt: "2026-01-01T00:00:00.000Z",
    durationMs: 1,
    metrics: {
      totalLines: 10,
      ncloc: 10,
      commentDensity: 0,
      functionCount: 1,
      classCount: 0,
      avgComplexity: 1,
      maxComplexity: 1,
      overComplexFunctions: 0,
      overLongFunctions: 0,
      deeplyNestedFunctions: 0,
      cloneRate: 0,
    },
    fileMetrics: [],
    findings: [],
    clonePairs: [],
  };
}

test("score passes at the configured boundary and reports deductions", () => {
  const input = report();
  input.findings = [{
    id: "finding-1",
    ruleId: "py-eval",
    severity: "CRITICAL",
    type: "VULNERABILITY",
    file: "main.py",
    line: 1,
    column: 1,
    message: "eval",
    snippet: "eval()",
  }];
  const result = calculateScore({ report: input, profile: DEFAULT_SCORE_PROFILE, passScore: 90 });
  assert.equal(result.score, 97);
  assert.equal(result.passed, true);
  assert.equal(result.deductions[0]?.points, 3);
});

test("score fails below the configured threshold", () => {
  const input = report();
  input.metrics.overComplexFunctions = 50;
  const result = calculateScore({ report: input, profile: DEFAULT_SCORE_PROFILE, passScore: 60 });
  assert.equal(result.score, 50);
  assert.equal(result.passed, false);
  assert.match(result.failureReasons[0] ?? "", /低于通过线/);
});

test("default provisional profile uses relaxed thresholds and deductions", () => {
  assert.equal(DEFAULT_SCORE_PROFILE.version, "1.2.0");
  assert.deepEqual(DEFAULT_SCORE_PROFILE.findingPenalties, {
    BLOCKER: 5,
    CRITICAL: 3,
    MAJOR: 1,
    MINOR: 0.5,
  });
  assert.deepEqual(DEFAULT_SCORE_PROFILE.metricThresholds, {
    maxComplexity: { threshold: 20, penalty: 1 },
    maxFunctionLines: { threshold: 150, penalty: 0.5 },
    maxNestingDepth: { threshold: 6, penalty: 0.5 },
    cloneRate: { threshold: 0.2, penalty: 10 },
  });
  assert.equal(DEFAULT_SCORE_PROFILE.findingPenalties.MINOR, 0.5);
});

test("custom profile applies configured finding penalties", () => {
  const input = report();
  input.findings = [{
    id: "finding-1",
    ruleId: "py-eval",
    severity: "CRITICAL",
    type: "VULNERABILITY",
    file: "main.py",
    line: 1,
    column: 1,
    message: "eval",
    snippet: "eval()",
  }];
  const result = scoreReport(input, {
    custom: { findingPenalties: { CRITICAL: 1.5 } },
  });
  assert.equal(result.score, 98.5);
  assert.equal(result.deductions[0]?.points, 1.5);
});

test("custom profile applies configured metric thresholds", () => {
  const input = report();
  input.fileMetrics = [{
    file: "main.py",
    language: "python",
    totalLines: 30,
    ncloc: 30,
    commentLines: 0,
    commentDensity: 0,
    functionCount: 2,
    classCount: 0,
    importCount: 0,
    functions: [
      { name: "complex", startLine: 1, endLine: 20, complexity: 8, lines: 20, nestingDepth: 3, paramCount: 0 },
      { name: "nested", startLine: 21, endLine: 30, complexity: 2, lines: 10, nestingDepth: 5, paramCount: 0 },
    ],
  }];
  input.metrics.maxComplexity = 8;
  input.metrics.deeplyNestedFunctions = 1;
  const result = scoreReport(input, {
    custom: {
      id: "team-gate",
      version: "2026.09",
      passScore: 95,
      metrics: {
        maxComplexity: { threshold: 5, penalty: 3 },
        maxNestingDepth: { threshold: 4, penalty: 2 },
        cloneRate: { threshold: 0.2, penalty: 20 },
      },
    },
  });
  assert.equal(result.profileId, "team-gate");
  assert.equal(result.provenance, "custom");
  assert.equal(result.score, 95);
  assert.equal(result.passed, true);
  assert.deepEqual(result.deductions.map((item) => item.category), ["maxComplexity", "maxNestingDepth"]);
});

test("custom profile clamps unsafe values", () => {
  const profile = createCustomScoreProfile({
    passScore: 999,
    metrics: { cloneRate: { threshold: -1, penalty: -4 } },
  });
  assert.equal(profile.passScore, 100);
  assert.deepEqual(profile.metricThresholds?.cloneRate, { threshold: 0, penalty: 0 });
});
