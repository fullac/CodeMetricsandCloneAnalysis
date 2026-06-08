import { promises as fs } from "node:fs";
import path from "node:path";

export async function getCodeContext(
  unzipDir: string,
  sonarComponent: string,
  issueLine?: number,
  radius = 10
): Promise<string> {
  if (!issueLine || issueLine < 1) {
    return "";
  }

  const relPath = sonarComponent.includes(":")
    ? sonarComponent.slice(sonarComponent.indexOf(":") + 1)
    : sonarComponent;

  const absPath = path.join(unzipDir, relPath);
  const content = await fs.readFile(absPath, "utf-8");
  const lines = content.split(/\r?\n/);

  const start = Math.max(1, issueLine - radius);
  const end = Math.min(lines.length, issueLine + radius);

  const chunk = lines
    .slice(start - 1, end)
    .map((line, i) => {
      const lineNo = start + i;
      const marker = lineNo === issueLine ? ">" : " ";
      return `${marker} ${String(lineNo).padStart(4, "0")}: ${line}`;
    })
    .join("\n");

  return `File: ${relPath}\n${chunk}`;
}
