import type Parser from "tree-sitter";
import type { SourceFile } from "../analysis/fileDiscovery.js";
import type { LanguageConfig } from "../analysis/language.js";
import type { StaticAnalysisFunctionMetric } from "../../types/index.js";

export type MetricContext = {
  sourceFile: SourceFile;
  content: string;
  root: Parser.SyntaxNode;
  lines: string[];
  languageConfig: LanguageConfig;
};

export type MetricResult = {
  name: string;
  value: number;
};

export type FileMetricAccumulator = {
  commentRows: Set<number>;
  functions: StaticAnalysisFunctionMetric[];
  classCount: number;
  importCount: number;
};

export type MetricPlugin = {
  name: string;
  collect(context: MetricContext, accumulator: FileMetricAccumulator): MetricResult | void;
};
