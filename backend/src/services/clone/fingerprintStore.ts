import { promises as fs } from "node:fs";
import path from "node:path";
import type { CloneFingerprint } from "./fingerprint.js";

export type StoredCloneFingerprint = CloneFingerprint & {
  projectKey: string;
  updatedAt: string;
};

type StoredProject = {
  projectKey: string;
  updatedAt: string;
  files: Array<CloneFingerprint & {
    kGramHashCount: number;
  }>;
};

type FingerprintDatabase = {
  version: 1;
  projects: Record<string, StoredProject>;
};

const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data", "fingerprints.json");

async function readDatabase(dbPath: string): Promise<FingerprintDatabase> {
  try {
    const raw = await fs.readFile(dbPath, "utf8");
    return JSON.parse(raw) as FingerprintDatabase;
  } catch {
    return {
      version: 1,
      projects: {},
    };
  }
}

async function writeDatabase(dbPath: string, database: FingerprintDatabase): Promise<void> {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
}

export async function saveProjectFingerprints(input: {
  projectKey: string;
  fingerprints: CloneFingerprint[];
  dbPath?: string;
}): Promise<void> {
  const dbPath = input.dbPath ?? process.env.FINGERPRINT_DB_PATH ?? DEFAULT_DB_PATH;
  const database = await readDatabase(dbPath);
  database.projects[input.projectKey] = {
    projectKey: input.projectKey,
    updatedAt: new Date().toISOString(),
    files: input.fingerprints.map((fingerprint) => ({
      file: fingerprint.file,
      language: fingerprint.language,
      tokenCount: fingerprint.tokenCount,
      kGramSize: fingerprint.kGramSize,
      kGramHashCount: fingerprint.kGramHashes.length,
      kGramHashes: fingerprint.kGramHashes,
      signature: fingerprint.signature,
      ncloc: fingerprint.ncloc,
    })),
  };
  await writeDatabase(dbPath, database);
}

export async function loadStoredFingerprints(input: {
  dbPath?: string;
} = {}): Promise<StoredCloneFingerprint[]> {
  const dbPath = input.dbPath ?? process.env.FINGERPRINT_DB_PATH ?? DEFAULT_DB_PATH;
  const database = await readDatabase(dbPath);
  const fingerprints: StoredCloneFingerprint[] = [];

  for (const project of Object.values(database.projects)) {
    for (const file of project.files) {
      if (!file.kGramHashes?.length || !file.signature?.length) {
        continue;
      }
      fingerprints.push({
        file: file.file,
        language: file.language,
        tokenCount: file.tokenCount,
        kGramSize: file.kGramSize,
        kGramHashes: file.kGramHashes,
        signature: file.signature,
        ncloc: file.ncloc,
        projectKey: project.projectKey,
        updatedAt: project.updatedAt,
      });
    }
  }

  return fingerprints;
}
