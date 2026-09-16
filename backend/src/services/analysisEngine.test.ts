import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeProject, parseScanOptionsJson } from "./analysisEngine.js";

test("uses a 20 percent default clone threshold", () => {
  assert.equal(parseScanOptionsJson(undefined).cloneThreshold, 0.2);
});

test("returns the original upload name with its extension", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "analysis-engine-test-"));
  const uploadPath = path.join(tempDir, "multer-upload");
  const previousDbPath = process.env.FINGERPRINT_DB_PATH;
  process.env.FINGERPRINT_DB_PATH = path.join(tempDir, "fingerprints.sqlite");

  try {
    await fs.writeFile(uploadPath, "def main():\n    return 1\n", "utf8");
    const report = await analyzeProject({
      filePath: uploadPath,
      originalName: "assignment.py",
      projectKey: "assignment",
      options: {
        engines: { rules: false, cloneDetection: false },
        languages: ["python"],
        cloneThreshold: 0.5,
        scoring: { enabled: false, profileId: "nankai-provisional-v1" },
      },
    });

    assert.equal(report.sourceName, "assignment.py");
    assert.equal(report.fileMetrics[0]?.file, "assignment.py");
  } finally {
    if (previousDbPath === undefined) delete process.env.FINGERPRINT_DB_PATH;
    else process.env.FINGERPRINT_DB_PATH = previousDbPath;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
