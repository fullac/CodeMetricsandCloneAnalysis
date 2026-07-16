import { promises as fs } from "node:fs";
import path from "node:path";
import { languageFromFilePath } from "./language.js";
import type { StaticAnalysisLanguage } from "../../types/index.js";

const HARD_EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "target",
  ".git",
  "vendor",
]);

type IgnoreRule = {
  baseDir: string;
  pattern: string;
  negated: boolean;
  directoryOnly: boolean;
  anchored: boolean;
};

export type SourceFile = {
  absolutePath: string;
  relativePath: string;
  language: StaticAnalysisLanguage;
};

export type FileDiscoveryResult = {
  files: SourceFile[];
  skippedCount: number;
  totalScanned: number;
};

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join("/");
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegex(pattern: string): RegExp {
  const parts: string[] = [];
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    const next = pattern[i + 1];
    if (char === "*" && next === "*") {
      parts.push(".*");
      i += 1;
      continue;
    }
    if (char === "*") {
      parts.push("[^/]*");
      continue;
    }
    if (char === "?") {
      parts.push("[^/]");
      continue;
    }
    parts.push(escapeRegex(char));
  }
  return new RegExp(`^${parts.join("")}$`);
}

function parseGitignoreLine(baseDir: string, line: string): IgnoreRule | null {
  let pattern = line.trim();
  if (!pattern || pattern.startsWith("#")) {
    return null;
  }

  let negated = false;
  if (pattern.startsWith("!")) {
    negated = true;
    pattern = pattern.slice(1).trim();
  }
  if (!pattern) {
    return null;
  }

  const directoryOnly = pattern.endsWith("/");
  if (directoryOnly) {
    pattern = pattern.slice(0, -1);
  }

  const anchored = pattern.startsWith("/");
  if (anchored) {
    pattern = pattern.slice(1);
  }

  return {
    baseDir,
    pattern,
    negated,
    directoryOnly,
    anchored,
  };
}

async function loadGitignoreRules(currentDir: string): Promise<IgnoreRule[]> {
  const gitignorePath = path.join(currentDir, ".gitignore");
  try {
    const content = await fs.readFile(gitignorePath, "utf8");
    return content
      .split(/\r\n|\r|\n/)
      .map((line) => parseGitignoreLine(currentDir, line))
      .filter((rule): rule is IgnoreRule => rule !== null);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

function matchesUnanchoredPattern(relativePath: string, pattern: string, directoryOnly: boolean, isDirectory: boolean): boolean {
  const segments = relativePath.split("/");
  const matcher = globToRegex(pattern);

  if (!pattern.includes("/")) {
    return segments.some((segment, index) => {
      if (!matcher.test(segment)) {
        return false;
      }
      if (!directoryOnly) {
        return true;
      }
      return isDirectory || index < segments.length - 1;
    });
  }

  for (let index = 0; index < segments.length; index += 1) {
    const suffix = segments.slice(index).join("/");
    if (matcher.test(suffix)) {
      return !directoryOnly || isDirectory || suffix !== relativePath;
    }
  }
  return false;
}

function matchesRule(rule: IgnoreRule, absolutePath: string, isDirectory: boolean): boolean {
  const relativePath = normalizeRelativePath(path.relative(rule.baseDir, absolutePath));
  if (!relativePath || relativePath.startsWith("../")) {
    return false;
  }

  if (rule.anchored || rule.pattern.includes("/")) {
    const matcher = globToRegex(rule.pattern);
    if (matcher.test(relativePath)) {
      return !rule.directoryOnly || isDirectory;
    }
    return rule.directoryOnly && relativePath.startsWith(`${rule.pattern}/`);
  }

  return matchesUnanchoredPattern(relativePath, rule.pattern, rule.directoryOnly, isDirectory);
}

function isIgnored(rules: IgnoreRule[], absolutePath: string, isDirectory: boolean): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (matchesRule(rule, absolutePath, isDirectory)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

export async function discoverSourceFiles(rootDir: string, languages: Set<StaticAnalysisLanguage>): Promise<FileDiscoveryResult> {
  const files: SourceFile[] = [];
  let totalScanned = 0;
  let skippedCount = 0;

  async function walk(currentDir: string, inheritedRules: IgnoreRule[]): Promise<void> {
    const currentRules = [...inheritedRules, ...await loadGitignoreRules(currentDir)];
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === ".gitignore") {
        continue;
      }

      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (HARD_EXCLUDED_DIRS.has(entry.name) || isIgnored(currentRules, absolutePath, true)) {
          skippedCount += 1;
          continue;
        }
        await walk(absolutePath, currentRules);
        continue;
      }

      if (!entry.isFile()) {
        skippedCount += 1;
        continue;
      }

      totalScanned += 1;

      if (isIgnored(currentRules, absolutePath, false)) {
        skippedCount += 1;
        continue;
      }

      const language = languageFromFilePath(entry.name);
      if (!language || !languages.has(language)) {
        skippedCount += 1;
        continue;
      }

      files.push({
        absolutePath,
        relativePath: normalizeRelativePath(path.relative(rootDir, absolutePath)),
        language,
      });
    }
  }

  await walk(rootDir, []);
  return {
    files: files.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    skippedCount,
    totalScanned,
  };
}
