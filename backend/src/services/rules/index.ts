import { cRules } from "./c.rules.js";
import { javaRules } from "./java.rules.js";
import { pythonRules } from "./python.rules.js";
import type { StaticAnalysisLanguage, StaticAnalysisRule } from "../../types/index.js";

export const staticAnalysisRules: StaticAnalysisRule[] = [
  ...pythonRules,
  ...javaRules,
  ...cRules,
];

export function getRulesForLanguage(language: StaticAnalysisLanguage): StaticAnalysisRule[] {
  return staticAnalysisRules.filter((rule) => rule.language === language);
}
