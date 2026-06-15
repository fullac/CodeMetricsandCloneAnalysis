import Parser from "tree-sitter";
import { getLanguageConfig } from "./language.js";
import type { StaticAnalysisLanguage } from "../../types/index.js";

const parserCache = new Map<StaticAnalysisLanguage, Parser>();

export function getParser(language: StaticAnalysisLanguage): Parser {
  const cached = parserCache.get(language);
  if (cached) {
    return cached;
  }

  const parser = new Parser();
  parser.setLanguage(getLanguageConfig(language).parserLanguage);
  parserCache.set(language, parser);
  return parser;
}

export function parseSource(content: string, language: StaticAnalysisLanguage): Parser.Tree {
  return getParser(language).parse(content);
}
