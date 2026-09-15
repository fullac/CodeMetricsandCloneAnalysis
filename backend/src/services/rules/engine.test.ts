import test from "node:test";
import assert from "node:assert/strict";
import { parseSource } from "../analysis/parser.js";
import { runRules } from "./engine.js";

test("runs query and metric rules with stable finding IDs", () => {
  const content = 'value = eval("input")\n';
  const root = parseSource(content, "python").rootNode;
  const findings = runRules({
    file: "main.py",
    language: "python",
    content,
    root,
    metrics: {
      file: "main.py",
      language: "python",
      totalLines: 1,
      ncloc: 1,
      commentLines: 0,
      commentDensity: 0,
      functionCount: 0,
      classCount: 0,
      importCount: 0,
      functions: [],
    },
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, "py-eval");
  assert.equal(findings[0]?.id, "py-eval:main.py:1:9");
});
