import type Parser from "tree-sitter";
import { getLanguageConfig } from "../analysis/language.js";
import type { SourceFile } from "../analysis/fileDiscovery.js";
import { countDescendants, findFirstDescendant, walkAst } from "./ast.js";
import type { FileMetricAccumulator, MetricContext, MetricPlugin, MetricResult } from "./types.js";
import type {
  StaticAnalysisFileMetrics,
  StaticAnalysisFunctionMetric,
  StaticAnalysisLanguage,
} from "../../types/index.js";

function countLogicalOperators(node: Parser.SyntaxNode): number {
  if (node.type !== "binary_expression") {
    return 0;
  }
  return (node.text.match(/&&|\|\|/g) ?? []).length;
}

function calculateComplexity(functionNode: Parser.SyntaxNode, context: MetricContext): number {
  let complexity = 1;
  walkAst(functionNode, (node) => {
    if (node === functionNode) {
      return;
    }
    if (context.languageConfig.decisionTypes.has(node.type)) {
      complexity += 1;
    }
    complexity += countLogicalOperators(node);
  });
  return complexity;
}

function calculateNestingDepth(functionNode: Parser.SyntaxNode, context: MetricContext): number {
  let maxDepth = 0;

  function visit(node: Parser.SyntaxNode, depth: number): void {
    const nextDepth = node !== functionNode && context.languageConfig.nestingTypes.has(node.type) ? depth + 1 : depth;
    maxDepth = Math.max(maxDepth, nextDepth);
    for (const child of node.namedChildren) {
      visit(child, nextDepth);
    }
  }

  visit(functionNode, 0);
  return maxDepth;
}

function countParameters(functionNode: Parser.SyntaxNode, context: MetricContext): number {
  const parametersNode = functionNode.childForFieldName("parameters")
    ?? findFirstDescendant(functionNode, (node) => node.type.includes("parameter"));

  if (!parametersNode) {
    return 0;
  }

  if (context.languageConfig.parameterTypes.has(parametersNode.type)) {
    return 1;
  }

  return countDescendants(parametersNode, (node) => context.languageConfig.parameterTypes.has(node.type));
}

function getDeclaratorName(node: Parser.SyntaxNode | null): string | null {
  if (!node) {
    return null;
  }

  const namedNode = node.childForFieldName("name");
  if (namedNode) {
    return namedNode.text;
  }

  if (node.type === "qualified_identifier") {
    return node.text;
  }

  if (node.type === "identifier" || node.type === "field_identifier" || node.type === "operator_name" || node.type === "destructor_name") {
    return node.text;
  }

  const nestedDeclarator = node.childForFieldName("declarator");
  const nestedName = getDeclaratorName(nestedDeclarator);
  if (nestedName) {
    return nestedName;
  }

  for (const child of node.namedChildren) {
    const childName = getDeclaratorName(child);
    if (childName) {
      return childName;
    }
  }

  return null;
}

function getFunctionName(functionNode: Parser.SyntaxNode): string {
  return functionNode.childForFieldName("name")?.text
    ?? getDeclaratorName(functionNode.childForFieldName("declarator"))
    ?? "<anonymous>";
}

function isPureCommentLine(line: string, language: StaticAnalysisLanguage): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (language === "python") {
    return trimmed.startsWith("#");
  }
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.endsWith("*/");
}

function createAccumulator(): FileMetricAccumulator {
  return {
    commentRows: new Set<number>(),
    functions: [],
    classCount: 0,
    importCount: 0,
  };
}

const syntaxMetricPlugin: MetricPlugin = {
  name: "syntax-metrics",
  collect(context, accumulator) {
    walkAst(context.root, (node) => {
      if (context.languageConfig.commentTypes.has(node.type)) {
        for (let row = node.startPosition.row; row <= node.endPosition.row; row += 1) {
          accumulator.commentRows.add(row);
        }
        return;
      }

      if (context.languageConfig.importTypes.has(node.type)) {
        accumulator.importCount += 1;
        return;
      }

      if (context.languageConfig.classTypes.has(node.type)) {
        accumulator.classCount += 1;
        return;
      }

      if (context.languageConfig.functionTypes.has(node.type)) {
        const startLine = node.startPosition.row + 1;
        const endLine = node.endPosition.row + 1;
        accumulator.functions.push({
          name: getFunctionName(node),
          startLine,
          endLine,
          complexity: calculateComplexity(node, context),
          lines: endLine - startLine + 1,
          nestingDepth: calculateNestingDepth(node, context),
          paramCount: countParameters(node, context),
        });
      }
    });
  },
};

export function createMetrics(_language: StaticAnalysisLanguage): MetricPlugin[] {
  return [syntaxMetricPlugin];
}

export function splitLines(content: string): string[] {
  if (content.length === 0) {
    return [];
  }

  const lines = content.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

export function analyzeFileMetrics(input: {
  sourceFile: SourceFile;
  content: string;
  root: Parser.SyntaxNode;
}): StaticAnalysisFileMetrics {
  const lines = splitLines(input.content);
  const context: MetricContext = {
    sourceFile: input.sourceFile,
    content: input.content,
    root: input.root,
    lines,
    languageConfig: getLanguageConfig(input.sourceFile.language),
  };
  const accumulator = createAccumulator();

  for (const plugin of createMetrics(input.sourceFile.language)) {
    plugin.collect(context, accumulator);
  }

  const totalLines = lines.length;
  const commentLines = accumulator.commentRows.size;
  const ncloc = lines.filter((line, index) => {
    if (!line.trim()) {
      return false;
    }
    return !(accumulator.commentRows.has(index) && isPureCommentLine(line, input.sourceFile.language));
  }).length;

  return {
    file: input.sourceFile.relativePath,
    language: input.sourceFile.language,
    totalLines,
    ncloc,
    commentLines,
    commentDensity: totalLines === 0 ? 0 : commentLines / totalLines,
    functionCount: accumulator.functions.length,
    classCount: accumulator.classCount,
    importCount: accumulator.importCount,
    functions: accumulator.functions,
  };
}

export type { MetricPlugin, MetricContext, MetricResult, FileMetricAccumulator };
export type { StaticAnalysisFunctionMetric };
