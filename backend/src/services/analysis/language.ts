import path from "node:path";
import Parser from "tree-sitter";
import Python from "tree-sitter-python";
import Java from "tree-sitter-java";
import C from "tree-sitter-c";
import Cpp from "tree-sitter-cpp";
import type { StaticAnalysisLanguage } from "../../types/index.js";

export type LanguageConfig = {
  parserLanguage: Parser.Language;
  functionTypes: Set<string>;
  classTypes: Set<string>;
  importTypes: Set<string>;
  commentTypes: Set<string>;
  decisionTypes: Set<string>;
  nestingTypes: Set<string>;
  parameterTypes: Set<string>;
};

export const LANGUAGE_CONFIG: Record<StaticAnalysisLanguage, LanguageConfig> = {
  python: {
    parserLanguage: Python,
    functionTypes: new Set(["function_definition"]),
    classTypes: new Set(["class_definition"]),
    importTypes: new Set(["import_statement", "import_from_statement"]),
    commentTypes: new Set(["comment"]),
    decisionTypes: new Set(["if_statement", "elif_clause", "for_statement", "while_statement", "except_clause", "conditional_expression", "boolean_operator"]),
    nestingTypes: new Set(["if_statement", "for_statement", "while_statement", "try_statement", "with_statement"]),
    parameterTypes: new Set(["identifier", "typed_parameter", "default_parameter", "list_splat_pattern", "dictionary_splat_pattern"]),
  },
  java: {
    parserLanguage: Java,
    functionTypes: new Set(["method_declaration", "constructor_declaration"]),
    classTypes: new Set(["class_declaration", "interface_declaration", "enum_declaration", "record_declaration"]),
    importTypes: new Set(["import_declaration"]),
    commentTypes: new Set(["line_comment", "block_comment"]),
    decisionTypes: new Set(["if_statement", "for_statement", "enhanced_for_statement", "while_statement", "do_statement", "switch_expression", "switch_statement", "switch_block_statement_group", "catch_clause", "ternary_expression"]),
    nestingTypes: new Set(["if_statement", "for_statement", "enhanced_for_statement", "while_statement", "do_statement", "switch_expression", "switch_statement", "catch_clause"]),
    parameterTypes: new Set(["formal_parameter", "spread_parameter", "receiver_parameter"]),
  },
  c: {
    parserLanguage: C,
    functionTypes: new Set(["function_definition"]),
    classTypes: new Set(["struct_specifier", "union_specifier", "enum_specifier"]),
    importTypes: new Set(["preproc_include"]),
    commentTypes: new Set(["comment"]),
    decisionTypes: new Set(["if_statement", "for_statement", "while_statement", "do_statement", "switch_statement", "case_statement", "conditional_expression"]),
    nestingTypes: new Set(["if_statement", "for_statement", "while_statement", "do_statement", "switch_statement"]),
    parameterTypes: new Set(["parameter_declaration"]),
  },
  cpp: {
    parserLanguage: Cpp,
    functionTypes: new Set(["function_definition"]),
    classTypes: new Set(["class_specifier", "struct_specifier", "union_specifier", "enum_specifier"]),
    importTypes: new Set(["preproc_include", "using_declaration", "namespace_alias_definition"]),
    commentTypes: new Set(["comment"]),
    decisionTypes: new Set(["if_statement", "for_statement", "while_statement", "do_statement", "switch_statement", "case_statement", "conditional_expression", "catch_clause"]),
    nestingTypes: new Set(["if_statement", "for_statement", "while_statement", "do_statement", "switch_statement", "try_statement", "catch_clause"]),
    parameterTypes: new Set(["parameter_declaration", "optional_parameter_declaration"]),
  },
};

export function getLanguageConfig(language: StaticAnalysisLanguage): LanguageConfig {
  return LANGUAGE_CONFIG[language];
}

export function languageFromFilePath(filePath: string): StaticAnalysisLanguage | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".py") return "python";
  if (ext === ".java") return "java";
  if (ext === ".cpp" || ext === ".cc" || ext === ".cxx" || ext === ".hpp" || ext === ".hh" || ext === ".hxx") return "cpp";
  if (ext === ".c" || ext === ".h") return "c";
  return null;
}

export function isSupportedSourceFilename(filename: string): boolean {
  return languageFromFilePath(filename) !== null;
}
