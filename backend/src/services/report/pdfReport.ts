import { existsSync } from "node:fs";
import { chromium } from "playwright";
import type { StaticAnalysisScanReport } from "../../types/index.js";
import { renderAnalysisReportHtml } from "./htmlReport.js";

function resolveChromiumExecutablePath(): string | undefined {
  const bundledPath = chromium.executablePath();
  if (existsSync(bundledPath)) {
    return bundledPath;
  }

  const fallbackPaths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];

  return fallbackPaths.find((candidate) => existsSync(candidate));
}

export async function renderAnalysisReportPdf(report: StaticAnalysisScanReport): Promise<Buffer> {
  const executablePath = resolveChromiumExecutablePath();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(renderAnalysisReportHtml(report), { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });
  } finally {
    await browser.close();
  }
}
