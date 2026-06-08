import { config } from "../config.js";
import type { ProjectMetrics, ReviewIssue } from "../types/index.js";

function basicAuthToken(token: string): string {
  return Buffer.from(`${token}:`).toString("base64");
}

async function sonarGet(pathWithQuery: string, token = config.sonarToken): Promise<any> {
  const url = `${config.sonarHostUrl}${pathWithQuery}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: {
        Authorization: `Basic ${basicAuthToken(token)}`,
      },
    });
  } catch (err) {
    const e = err as Error & { cause?: unknown };
    throw new Error(`Sonar fetch failed: ${url} | ${e.message}`);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sonar API failed: ${resp.status} ${url} ${text}`);
  }

  return resp.json();
}

async function sonarPost(pathWithQuery: string, token = config.sonarToken): Promise<any> {
  const url = `${config.sonarHostUrl}${pathWithQuery}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuthToken(token)}`,
      },
    });
  } catch (err) {
    const e = err as Error & { cause?: unknown };
    throw new Error(`Sonar post failed: ${url} | ${e.message}`);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Sonar API failed: ${resp.status} ${url} ${text}`);
  }

  try {
    return await resp.json();
  } catch {
    return null;
  }
}

async function fetchAllIssuePages(projectKey: string, extraParams: Record<string, string>, pageSize = 500): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  let total = 0;

  do {
    const q = new URLSearchParams({
      componentKeys: projectKey,
      statuses: "OPEN,CONFIRMED,REOPENED",
      ps: String(pageSize),
      p: String(page),
      additionalFields: "_all",
      ...extraParams,
    });

    const data = await sonarGet(`/api/issues/search?${q.toString()}`);
    const issues = (data.issues ?? []) as any[];
    total = Number(data.total ?? 0);
    all.push(...issues);
    page += 1;
  } while (all.length < total);

  return all;
}

export async function fetchMajorIssues(projectKey: string): Promise<ReviewIssue[]> {
  const issues = await fetchAllIssuePages(projectKey, { impactSeverities: "HIGH" });

  return issues.map((issue) => ({
    key: issue.key,
    severity: issue.severity,
    type: issue.type,
    message: issue.message,
    component: issue.component,
    line: issue.line,
    rule: issue.rule,
    sourceKind: "ISSUE" as const,
  }));
}

async function fetchHotspotsByProjectKey(projectKey: string, pageSize = 500): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  let total = 0;

  do {
    const q = new URLSearchParams({
      projectKey,
      ps: String(pageSize),
      p: String(page),
    });

    const data = await sonarGet(`/api/hotspots/search?${q.toString()}`, config.sonarUserToken);
    const hotspots = (data.hotspots ?? []) as any[];
    total = Number(data.paging?.total ?? 0);
    all.push(...hotspots);
    page += 1;
  } while (all.length < total);

  return all;
}

export async function fetchSecurityHotspots(projectKey: string): Promise<ReviewIssue[]> {
  let hotspots: any[] = [];
  hotspots = await fetchHotspotsByProjectKey(projectKey);

  return hotspots.map((hotspot) => ({
    key: hotspot.key,
    severity: String(hotspot.vulnerabilityProbability ?? "HIGH").toUpperCase(),
    type: "SECURITY_HOTSPOT",
    message: hotspot.message,
    component: hotspot.component,
    line: hotspot.line ?? hotspot?.textRange?.startLine,
    rule: hotspot.ruleKey,
    sourceKind: "HOTSPOT" as const,
  }));
}

export async function fetchProjectMetrics(projectKey: string): Promise<ProjectMetrics> {
  const q = new URLSearchParams({
    component: projectKey,
    metricKeys: [
      "duplicated_lines_density",
      "sqale_rating",
      "sqale_index",
      "reliability_rating",
      "software_quality_reliability_rating",
      "software_quality_reliability_issues",
      "security_rating",
      "coverage",
      "bugs",
      "vulnerabilities",
      "code_smells",
      "ncloc",
      "complexity",
      "security_review_rating",
    ].join(","),
  });

  const data = await sonarGet(`/api/measures/component?${q.toString()}`);
  const measures = (data?.component?.measures ?? []) as Array<{ metric: string; value?: string }>;
  const metrics: ProjectMetrics = {};

  for (const item of measures) {
    (metrics as Record<string, string | undefined>)[item.metric] = item.value;
  }

  return metrics;
}

export async function deleteProjectRecord(projectKey: string): Promise<void> {
  const q = new URLSearchParams({ project: projectKey });
  await sonarPost(`/api/projects/delete?${q.toString()}`, config.sonarUserToken);
}
