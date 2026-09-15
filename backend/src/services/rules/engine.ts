import Parser from "tree-sitter";
import { getLanguageConfig } from "../analysis/language.js";
import { walkAst } from "../metrics/ast.js";
import type {
  StaticAnalysisFileMetrics,
  StaticAnalysisFinding,
  StaticAnalysisFunctionMetric,
  StaticAnalysisLanguage,
  StaticAnalysisRule,
} from "../../types/index.js";
import { getRulesForLanguage } from "./index.js";

export type RuleContext = {
  file: string;
  language: StaticAnalysisLanguage;
  content: string;
  root: Parser.SyntaxNode;
  metrics: StaticAnalysisFileMetrics;
};

function lineText(content: string, row: number): string {
  return content.split(/\r\n|\r|\n/)[row] ?? "";
}

function findingId(rule: StaticAnalysisRule, file: string, node: Parser.SyntaxNode): string {
  return `${rule.id}:${file}:${node.startPosition.row + 1}:${node.startPosition.column + 1}`;
}

function createFinding(rule: StaticAnalysisRule, context: RuleContext, node: Parser.SyntaxNode, message = rule.description): StaticAnalysisFinding {
  return {
    id: findingId(rule, context.file, node),
    ruleId: rule.id,
    severity: rule.severity,
    type: rule.type,
    file: context.file,
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1,
    message,
    snippet: lineText(context.content, node.startPosition.row).trim().slice(0, 240),
  };
}

function functionNodeForMetric(root: Parser.SyntaxNode, metric: StaticAnalysisFunctionMetric): Parser.SyntaxNode | null {
  let result: Parser.SyntaxNode | null = null;
  walkAst(root, (node) => {
    if (result || node.startPosition.row + 1 !== metric.startLine || node.endPosition.row + 1 !== metric.endLine) {
      return;
    }
    result = node;
  });
  return result;
}

function metricFindings(rule: StaticAnalysisRule, context: RuleContext): StaticAnalysisFinding[] {
  const metrics = context.metrics.functions;
  const matches = rule.id.endsWith("long-method") || rule.id.endsWith("long-func")
    ? metrics.filter((metric) => metric.lines > 100)
    : rule.id.endsWith("too-many-params")
      ? metrics.filter((metric) => metric.paramCount > 6)
      : rule.id.endsWith("deep-nesting")
        ? metrics.filter((metric) => metric.nestingDepth > 4)
        : [];

  return matches.flatMap((metric) => {
    const node = functionNodeForMetric(context.root, metric);
    return node ? [createFinding(rule, context, node, `${rule.description}: ${metric.name}`)] : [];
  });
}

function textFindings(rule: StaticAnalysisRule, context: RuleContext): StaticAnalysisFinding[] {
  const findings: StaticAnalysisFinding[] = [];
  walkAst(context.root, (node) => {
    const text = node.text;
    let matches = false;
    switch (rule.id) {
      case "py-shell-true":
        matches = node.type === "call" && /\bshell\s*=\s*True\b/.test(text);
        break;
      case "py-bare-except":
        matches = node.type === "except_clause" && (/^except\s*:/.test(text.trim()) || /except\s+Exception\s*:/.test(text));
        break;
      case "py-hardcoded-secret":
      case "java-hardcoded-cred":
      case "c-hardcoded-secret":
        matches = /(?:password|passwd|secret|token|api[_-]?key|credential)/i.test(text)
          && /["'][^"']+["']/.test(text);
        break;
      case "py-open-no-close":
        matches = node.type === "call" && /^open\s*\(/.test(text) && !node.parent?.type.includes("with");
        break;
      case "java-empty-catch":
        matches = node.type === "catch_clause" && /\{\s*\}/.test(text);
        break;
      case "java-switch-no-default":
        matches = (node.type === "switch_statement" || node.type === "switch_expression")
          && !/\bdefault\s*:/.test(text);
        break;
      case "java-resource-leak":
        matches = (node.type === "local_variable_declaration" || node.type === "object_creation_expression")
          && /(?:FileInputStream|FileReader|BufferedReader)\b/.test(text)
          && !/\.close\s*\(/.test(context.content);
        break;
      case "c-null-check-after-deref":
        matches = node.type === "if_statement" && /\*\s*[A-Za-z_]\w*/.test(text) && !/\bif\s*\([^)]*!\s*[A-Za-z_]\w*/.test(text);
        break;
      case "c-div-zero":
        matches = node.type === "binary_expression" && /\/\s*0(?:\b|\.)/.test(text);
        break;
      case "c-resource-leak":
        matches = node.type === "translation_unit" && /\bmalloc\s*\(/.test(text) && !/\bfree\s*\(/.test(text);
        break;
      default:
        break;
    }
    if (matches) {
      findings.push(createFinding(rule, context, node));
    }
  });
  return findings;
}

function queryFindings(rule: StaticAnalysisRule, context: RuleContext): StaticAnalysisFinding[] {
  if (!rule.query) {
    return [];
  }
  const query = new Parser.Query(getLanguageConfig(context.language).parserLanguage, rule.query);
  const matches = query.matches(context.root);
  return matches.map((match) => {
    const capture = match.captures[0];
    return createFinding(rule, context, capture?.node ?? context.root);
  });
}

export function runRules(context: RuleContext): StaticAnalysisFinding[] {
  const findings: StaticAnalysisFinding[] = [];
  for (const rule of getRulesForLanguage(context.language)) {
    if (rule.matcher === "query") {
      findings.push(...queryFindings(rule, context));
    } else if (rule.id.endsWith("long-method") || rule.id.endsWith("long-func") || rule.id.endsWith("too-many-params") || rule.id.endsWith("deep-nesting")) {
      findings.push(...metricFindings(rule, context));
    } else {
      findings.push(...textFindings(rule, context));
    }
  }
  return Array.from(new Map(findings.map((finding) => [finding.id, finding])).values())
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId));
}
