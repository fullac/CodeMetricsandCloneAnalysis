import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { config } from "../config.js";
import { deleteProjectRecord, fetchMajorIssues, fetchProjectMetrics, fetchSecurityHotspots } from "./sonarClient.js";
import { diagnoseIssuesWithLlm, getProjectDiagnosis } from "./llmClient.js";
import { getCodeContext } from "../utils/fileContext.js";
import type { IssueDiagnosisResult, ProjectDiagnosisResult, ProjectMetrics, ReviewIssue, ReviewResult } from "../types/index.js";

const ISSUE_DIAGNOSE_BATCH_SIZE = 8;

function errText(err: unknown): string {
  const e = err as Error & { cause?: unknown };
  const cause = e?.cause ? ` | cause: ${String(e.cause)}` : "";
  return `${e?.message ?? String(err)}${cause}`;
}

function isHotspotPrivilegeError(err: unknown): boolean {
  const msg = errText(err);
  return msg.includes("/api/hotspots/search") && msg.includes("403");
}

function isHighSeverity(issue: ReviewIssue): boolean {
  const sev = issue.severity.toUpperCase();
  return sev === "HIGH" || sev === "CRITICAL" || sev === "BLOCKER";
}

function runSonarScanner(unzipDir: string, projectKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      `-Dsonar.projectKey=${projectKey}`,
      `-Dsonar.projectName=${projectKey}`,
      `-Dsonar.sources=${config.sonarSources}`,
      `-Dsonar.exclusions=${config.sonarExclusions}`,
      `-Dsonar.host.url=${config.sonarHostUrl}`,
      `-Dsonar.token=${config.sonarToken}`,
      "-Dsonar.sourceEncoding=UTF-8"
    ];

    if (config.sonarInclusions) {
      args.push(`-Dsonar.inclusions=${config.sonarInclusions}`);
    }

    const child = spawn(config.sonarScannerBin, args, {
      cwd: unzipDir,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";

    child.stdout.on("data", (chunk) => {
      process.stdout.write(`[sonar] ${chunk}`);
    });

    child.stderr.on("data", (chunk) => {
      const s = String(chunk);
      stderr += s;
      process.stderr.write(`[sonar-err] ${s}`);
    });

    child.on("error", (err) => {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        reject(
          new Error(
            `sonar-scanner binary not found: '${config.sonarScannerBin}'. ` +
              "Install sonar-scanner and/or set SONAR_SCANNER_BIN to its absolute path."
          )
        );
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`sonar-scanner exited with code ${code}. ${stderr}`));
      }
    });
  });
}

async function enrichSnippet(unzipDir: string, issue: ReviewIssue): Promise<ReviewIssue> {
  try {
    const snippet = await getCodeContext(unzipDir, issue.component, issue.line, 10);
    return { ...issue, snippet };
  } catch {
    return { ...issue, snippet: "" };
  }
}

export async function processZipAndReview(input: {
  zipPath: string;
  projectKey: string;
}): Promise<ReviewResult> {
  const tempPrefix = path.join(os.tmpdir(), `review-${Date.now()}-`);
  const unzipDir = await fs.mkdtemp(tempPrefix);

  try {
    const zip = new AdmZip(input.zipPath);
    zip.extractAllTo(unzipDir, true);

    await runSonarScanner(unzipDir, input.projectKey);

    const highIssues = await fetchMajorIssues(input.projectKey).catch((err) => {
      throw new Error(`Fetch Sonar issues failed: ${errText(err)}`);
    });

    let securityHotspots: ReviewIssue[] = [];
    try {
      securityHotspots = await fetchSecurityHotspots(input.projectKey);
    } catch (err) {
      if (isHotspotPrivilegeError(err)) {
        // Degrade gracefully when token cannot read hotspots.
        securityHotspots = [];
      } else {
        throw new Error(`Fetch Sonar hotspots failed: ${errText(err)}`);
      }
    }

    const [issuesWithSnippet, hotspotsWithSnippet] = await Promise.all([
      Promise.all(highIssues.map((item) => enrichSnippet(unzipDir, item))),
      Promise.all(securityHotspots.map((item) => enrichSnippet(unzipDir, item))),
    ]);

    const metrics = await fetchProjectMetrics(input.projectKey).catch((err) => {
      throw new Error(`Fetch Sonar metrics failed: ${errText(err)}`);
    });

    return {
      projectKey: input.projectKey,
      scannedAt: new Date().toISOString(),
      metrics,
      issues: issuesWithSnippet,
      securityHotspots: hotspotsWithSnippet,
    };
  } catch (err) {
    throw new Error(`Review pipeline failed: ${errText(err)}`);
  } finally {
    await fs.rm(unzipDir, { recursive: true, force: true });
    await fs.rm(input.zipPath, { force: true });
  }
}

export async function runProjectDiagnosis(metrics: ProjectMetrics): Promise<ProjectDiagnosisResult> {
  return getProjectDiagnosis(metrics).catch((err) => {
    throw new Error(`Call LLM project diagnosis failed: ${errText(err)}`);
  });
}

function splitBatches<T>(items: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    res.push(items.slice(i, i + size));
  }
  return res;
}

export async function runIssueDiagnosis(selectedIssues: ReviewIssue[]): Promise<IssueDiagnosisResult[]> {
  if (!selectedIssues.length) {
    throw new Error("No issues selected for LLM diagnosis.");
  }

  const nonHigh = selectedIssues.find((issue) => !isHighSeverity(issue));
  if (nonHigh) {
    throw new Error(`Issue ${nonHigh.key} is not high severity.`);
  }

  const batches = splitBatches(selectedIssues, ISSUE_DIAGNOSE_BATCH_SIZE);
  const allResults: IssueDiagnosisResult[] = [];

  for (const batch of batches) {
    const batchResult = await diagnoseIssuesWithLlm(batch, "issue-diagnosis").catch((err) => {
      throw new Error(`Call LLM issue diagnosis failed: ${errText(err)}`);
    });
    allResults.push(...batchResult);
  }

  return allResults;
}

export async function runHotspotDiagnosis(selectedHotspots: ReviewIssue[]): Promise<IssueDiagnosisResult[]> {
  if (!selectedHotspots.length) {
    throw new Error("No hotspots selected for LLM diagnosis.");
  }

  const batches = splitBatches(selectedHotspots, ISSUE_DIAGNOSE_BATCH_SIZE);
  const allResults: IssueDiagnosisResult[] = [];

  for (const batch of batches) {
    const batchResult = await diagnoseIssuesWithLlm(batch, "hotspot-diagnosis").catch((err) => {
      throw new Error(`Call LLM hotspot diagnosis failed: ${errText(err)}`);
    });
    allResults.push(...batchResult);
  }

  return allResults;
}

export async function removeProjectRecord(projectKey: string): Promise<void> {
  await deleteProjectRecord(projectKey).catch((err) => {
    throw new Error(`Delete Sonar record failed: ${errText(err)}`);
  });
}
