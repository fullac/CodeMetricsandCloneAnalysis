import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadStoredFingerprints, saveProjectFingerprints } from "./fingerprintStore.js";
import type { CloneFingerprint } from "./fingerprint.js";

function fingerprint(file: string, seed: number): CloneFingerprint {
  return {
    file,
    language: "python",
    tokenCount: 20,
    kGramSize: 12,
    kGramHashes: [seed, seed + 1],
    signature: Array.from({ length: 128 }, (_, index) => seed + index),
    ncloc: 10,
  };
}

test("stores and replaces project fingerprints in SQLite", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-analysis-store-"));
  const dbPath = path.join(tempDir, "fingerprints.sqlite");
  try {
    await saveProjectFingerprints({ projectKey: "project-a", fingerprints: [fingerprint("a.py", 1)], dbPath });
    await saveProjectFingerprints({ projectKey: "project-a", fingerprints: [fingerprint("b.py", 2)], dbPath });
    await saveProjectFingerprints({ projectKey: "project-b", fingerprints: [fingerprint("c.py", 3)], dbPath });

    const stored = await loadStoredFingerprints({ dbPath });
    assert.deepEqual(stored.map((item) => `${item.projectKey}:${item.file}`), ["project-a:b.py", "project-b:c.py"]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("imports legacy JSON fingerprints once", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "code-analysis-migration-"));
  const dbPath = path.join(tempDir, "fingerprints.sqlite");
  try {
    const legacy = {
      version: 1,
      projects: {
        legacy: {
          projectKey: "legacy",
          updatedAt: "2026-01-01T00:00:00.000Z",
          files: [{ ...fingerprint("legacy.py", 4), kGramHashCount: 2 }],
        },
      },
    };
    await fs.writeFile(path.join(tempDir, "fingerprints.json"), JSON.stringify(legacy), "utf8");
    const stored = await loadStoredFingerprints({ dbPath });
    assert.equal(stored[0]?.projectKey, "legacy");
    assert.equal(stored[0]?.file, "legacy.py");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
