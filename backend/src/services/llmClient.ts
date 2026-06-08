import { config } from "../config.js";
import type { IssueDiagnosisResult, ProjectDiagnosisResult, ProjectMetrics, ReviewIssue } from "../types/index.js";

interface LlmMessage {
  role: "system" | "user";
  content: string;
}

async function callChat(messages: LlmMessage[]): Promise<{ content: string; rawOutput: string; startedAt: string; completedAt: string; durationMs: number }> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();

  const payload = {
    model: config.openaiModel,
    temperature: 0.1,
    messages,
  };

  const url = `${config.openaiBaseUrl}/chat/completions`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const e = err as Error;
    throw new Error(`LLM fetch failed: ${url} | ${e.message}`);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LLM request failed: ${resp.status} ${url} ${text}`);
  }

  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const rawOutput = json.choices?.[0]?.message?.content?.trim() ?? "";
  const completed = Date.now();

  return {
    content: rawOutput,
    rawOutput,
    startedAt,
    completedAt: new Date(completed).toISOString(),
    durationMs: completed - started,
  };
}

export async function getProjectDiagnosis(metrics: ProjectMetrics): Promise<ProjectDiagnosisResult> {
  const messages: LlmMessage[] = [
    {
      role: "system",
      content: [
        "<role>你是代码质量评估助手。</role>",
        "<rules>",
        "内部推理，不输出推理过程。",
        "仅输出中文纯文本。",
        "输出包含：整体评价、主要风险、3条优先改进建议。",
        "</rules>",
      ].join(""),
    },
    {
      role: "user",
      content: [
        "<project_metrics>",
        JSON.stringify(metrics),
        "</project_metrics>",
        "<task>基于以上指标给出诊断。</task>",
      ].join(""),
    },
  ];

  const result = await callChat(messages);
  return {
    diagnosis: result.content || "暂无诊断结果。",
    rawOutput: result.rawOutput,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
  };
}

function parseIssueDiagnosis(raw: string): Array<{ issueKey: string; valid: boolean; advice: string }> {
  const candidates: string[] = [raw.trim()];

  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    candidates.push(fenceMatch[1].trim());
  }

  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start >= 0 && end > start) {
    candidates.push(raw.slice(start, end + 1));
  }

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text) as Array<{ issueKey: string; valid: boolean; advice: string }>;
      if (!Array.isArray(parsed)) {
        continue;
      }
      return parsed.map((item) => ({
        issueKey: String(item.issueKey),
        valid: Boolean(item.valid),
        advice: String(item.advice ?? ""),
      }));
    } catch {
      // continue
    }
  }

  throw new Error(`LLM issue diagnosis parse failed. Raw: ${raw.slice(0, 500)}`);
}

export async function diagnoseIssuesWithLlm(issues: ReviewIssue[], logLabel = "issue-diagnosis"): Promise<IssueDiagnosisResult[]> {
  const messages: LlmMessage[] = [
    {
      role: "system",
      content: [
        "<role>你是代码审查助手。</role>",
        "<rules>",
        "内部推理，不输出推理过程。",
        "必须仅输出JSON数组，不要附加任何解释文本。",
        "每项字段：issueKey(string), valid(boolean), advice(中文纯文本)。",
        "如果问题描述与代码片段不匹配，valid=false并说明原因。",
        "</rules>",
      ].join(""),
    },
    {
      role: "user",
      content: [
        "<issues>",
        issues
          .map((issue) =>
            [
              `<issue key=\"${issue.key}\" severity=\"${issue.severity}\" type=\"${issue.type}\">`,
              `<message>${issue.message}</message>`,
              `<rule>${issue.rule ?? ""}</rule>`,
              `<component>${issue.component}:${issue.line ?? ""}</component>`,
              `<snippet><![CDATA[${issue.snippet ?? ""}]]></snippet>`,
              "</issue>",
            ].join("")
          )
          .join(""),
        "</issues>",
        "<task>判断每条issue是否有效，并给出中文的精炼改进建议。</task>",
      ].join(""),
    },
  ];

  const result = await callChat(messages);
  console.log(`[LLM][${logLabel}] raw output:\n${result.rawOutput}`);
  const parsed = parseIssueDiagnosis(result.content);

  return parsed.map((item) => ({
    issueKey: item.issueKey,
    valid: item.valid,
    advice: item.advice,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
  }));
}
