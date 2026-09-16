import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeSourceTree } from "./analyzer.js";
import type { StaticAnalysisScanOptions } from "../../types/index.js";

const OPTIONS: StaticAnalysisScanOptions = {
  engines: { rules: false, cloneDetection: true },
  languages: ["python"],
  cloneThreshold: 0.5,
  scoring: { enabled: false, profileId: "nankai-provisional-v1" },
};

test("detects current and cross-project clones without comparing a project to its own history", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "analyzer-clone-test-"));
  const sourceDir = path.join(tempDir, "source");
  const previousDbPath = process.env.FINGERPRINT_DB_PATH;
  process.env.FINGERPRINT_DB_PATH = path.join(tempDir, "fingerprints.sqlite");

  try {
    await fs.mkdir(sourceDir);
    const source = [
      "def calculate_total(values):",
      "    total = 0",
      "    for value in values:",
      "        if value > 0:",
      "            total += value",
      "        else:",
      "            total -= value",
      "    return total",
      "",
    ].join("\n");
    await fs.writeFile(path.join(sourceDir, "a.py"), source, "utf8");
    await fs.writeFile(path.join(sourceDir, "b.py"), source, "utf8");

    const first = await analyzeSourceTree({ rootDir: sourceDir, projectKey: "project-a", options: OPTIONS });
    assert.ok(first.clonePairs.some((pair) => pair.fileA === "a.py" && pair.fileB === "b.py"));

    const repeated = await analyzeSourceTree({ rootDir: sourceDir, projectKey: "project-a", options: OPTIONS });
    assert.equal(repeated.clonePairs.some((pair) => pair.fileB.startsWith("history/project-a/")), false);

    const crossProject = await analyzeSourceTree({ rootDir: sourceDir, projectKey: "project-b", options: OPTIONS });
    assert.ok(crossProject.clonePairs.some((pair) => pair.fileB.startsWith("history/project-a/")));
  } finally {
    if (previousDbPath === undefined) delete process.env.FINGERPRINT_DB_PATH;
    else process.env.FINGERPRINT_DB_PATH = previousDbPath;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("uses the active custom scoring thresholds for project metric counts", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "analyzer-scoring-test-"));
  const sourceDir = path.join(tempDir, "source");
  const previousDbPath = process.env.FINGERPRINT_DB_PATH;
  process.env.FINGERPRINT_DB_PATH = path.join(tempDir, "fingerprints.sqlite");

  try {
    await fs.mkdir(sourceDir);
    await fs.writeFile(path.join(sourceDir, "main.py"), [
      "def choose(value):",
      "    if value:",
      "        return 1",
      "    return 0",
      "",
    ].join("\n"), "utf8");

    const result = await analyzeSourceTree({
      rootDir: sourceDir,
      projectKey: "custom-thresholds",
      options: {
        engines: { rules: false, cloneDetection: false },
        languages: ["python"],
        cloneThreshold: 0.2,
        scoring: {
          enabled: true,
          profileId: "nankai-provisional-v1",
          custom: {
            metrics: {
              maxComplexity: { threshold: 1, penalty: 1 },
              maxFunctionLines: { threshold: 3, penalty: 1 },
              maxNestingDepth: { threshold: 0, penalty: 1 },
            },
          },
        },
      },
    });

    assert.equal(result.metrics.overComplexFunctions, 1);
    assert.equal(result.metrics.overLongFunctions, 1);
    assert.equal(result.metrics.deeplyNestedFunctions, 1);
    assert.deepEqual(
      result.score?.deductions.map((item) => [item.category, item.count]),
      [["maxComplexity", 1], ["maxFunctionLines", 1], ["maxNestingDepth", 1]],
    );
  } finally {
    if (previousDbPath === undefined) delete process.env.FINGERPRINT_DB_PATH;
    else process.env.FINGERPRINT_DB_PATH = previousDbPath;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
