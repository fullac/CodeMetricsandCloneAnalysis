import { promises as fs } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { CloneFingerprint } from "./fingerprint.js";

export type StoredCloneFingerprint = CloneFingerprint & {
  projectKey: string;
  updatedAt: string;
};

type LegacyStoredProject = {
  projectKey: string;
  updatedAt: string;
  files: Array<CloneFingerprint & { kGramHashCount: number }>;
};

type LegacyFingerprintDatabase = {
  version: 1;
  projects: Record<string, LegacyStoredProject>;
};

const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data", "fingerprints.sqlite");

type FingerprintRow = {
  project_key: string;
  updated_at: string;
  file: string;
  language: CloneFingerprint["language"];
  token_count: number;
  k_gram_size: number;
  k_gram_hashes: string;
  signature: string;
  ncloc: number;
};

function resolveDbPath(dbPath?: string): string {
  return dbPath ?? process.env.FINGERPRINT_DB_PATH ?? DEFAULT_DB_PATH;
}

function initializeDatabase(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS fingerprint_projects (
      project_key TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fingerprints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_key TEXT NOT NULL REFERENCES fingerprint_projects(project_key) ON DELETE CASCADE,
      file TEXT NOT NULL,
      language TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      k_gram_size INTEGER NOT NULL,
      k_gram_hashes TEXT NOT NULL,
      signature TEXT NOT NULL,
      ncloc INTEGER NOT NULL,
      UNIQUE(project_key, file)
    );

    CREATE INDEX IF NOT EXISTS idx_fingerprints_project ON fingerprints(project_key);
    CREATE TABLE IF NOT EXISTS fingerprint_store_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function insertProject(
  db: Database.Database,
  projectKey: string,
  updatedAt: string,
  fingerprints: CloneFingerprint[],
): void {
  const insertProjectStatement = db.prepare(
    "INSERT INTO fingerprint_projects (project_key, updated_at) VALUES (?, ?)",
  );
  const insertFingerprintStatement = db.prepare(`
    INSERT INTO fingerprints (
      project_key, file, language, token_count, k_gram_size,
      k_gram_hashes, signature, ncloc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertProjectStatement.run(projectKey, updatedAt);
  for (const fingerprint of fingerprints) {
    insertFingerprintStatement.run(
      projectKey,
      fingerprint.file,
      fingerprint.language,
      fingerprint.tokenCount,
      fingerprint.kGramSize,
      JSON.stringify(fingerprint.kGramHashes),
      JSON.stringify(fingerprint.signature),
      fingerprint.ncloc,
    );
  }
}

async function migrateLegacyJson(db: Database.Database, dbPath: string): Promise<void> {
  const marker = db.prepare("SELECT value FROM fingerprint_store_meta WHERE key = ?").get("legacy_json_imported") as { value?: string } | undefined;
  if (marker?.value === "1") {
    return;
  }

  const legacyPath = path.join(path.dirname(dbPath), "fingerprints.json");
  try {
    const raw = await fs.readFile(legacyPath, "utf8");
    const legacy = JSON.parse(raw) as LegacyFingerprintDatabase;
    const importTransaction = db.transaction(() => {
      for (const project of Object.values(legacy.projects ?? {})) {
        const fingerprints = project.files.map(({ kGramHashCount: _kGramHashCount, ...fingerprint }) => fingerprint);
        if (!db.prepare("SELECT 1 FROM fingerprint_projects WHERE project_key = ?").get(project.projectKey)) {
          insertProject(db, project.projectKey, project.updatedAt, fingerprints);
        }
      }
      db.prepare("INSERT OR REPLACE INTO fingerprint_store_meta (key, value) VALUES (?, ?)")
        .run("legacy_json_imported", "1");
    });
    importTransaction();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    db.prepare("INSERT OR REPLACE INTO fingerprint_store_meta (key, value) VALUES (?, ?)")
      .run("legacy_json_imported", "1");
  }
}

async function openDatabase(dbPath: string): Promise<Database.Database> {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  initializeDatabase(db);
  await migrateLegacyJson(db, dbPath);
  return db;
}

export async function saveProjectFingerprints(input: {
  projectKey: string;
  fingerprints: CloneFingerprint[];
  dbPath?: string;
}): Promise<void> {
  const dbPath = resolveDbPath(input.dbPath);
  const db = await openDatabase(dbPath);
  try {
    const updatedAt = new Date().toISOString();
    const saveTransaction = db.transaction(() => {
      db.prepare("DELETE FROM fingerprint_projects WHERE project_key = ?").run(input.projectKey);
      insertProject(db, input.projectKey, updatedAt, input.fingerprints);
    });
    saveTransaction();
  } finally {
    db.close();
  }
}

export async function loadStoredFingerprints(input: { dbPath?: string } = {}): Promise<StoredCloneFingerprint[]> {
  const dbPath = resolveDbPath(input.dbPath);
  const db = await openDatabase(dbPath);
  try {
    const rows = db.prepare(`
      SELECT p.project_key, p.updated_at, f.file, f.language, f.token_count,
             f.k_gram_size, f.k_gram_hashes, f.signature, f.ncloc
      FROM fingerprints f
      JOIN fingerprint_projects p ON p.project_key = f.project_key
      ORDER BY p.project_key, f.file
    `).all() as FingerprintRow[];

    return rows.flatMap((row) => {
      try {
        const kGramHashes = JSON.parse(row.k_gram_hashes) as number[];
        const signature = JSON.parse(row.signature) as number[];
        if (!kGramHashes.length || !signature.length) {
          return [];
        }
        return [{
          file: row.file,
          language: row.language,
          tokenCount: row.token_count,
          kGramSize: row.k_gram_size,
          kGramHashes,
          signature,
          ncloc: row.ncloc,
          projectKey: row.project_key,
          updatedAt: row.updated_at,
        }];
      } catch {
        return [];
      }
    });
  } finally {
    db.close();
  }
}
