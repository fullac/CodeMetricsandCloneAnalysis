import express from "express";
import cors from "cors";
import multer from "multer";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "./config.js";
import { analyzeProject, isSupportedAnalysisUpload, parseScanOptionsJson } from "./services/analysisEngine.js";
import { renderAnalysisReportPdf } from "./services/report/pdfReport.js";
import type { StaticAnalysisScanReport } from "./types/index.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

const analysisUpload = multer({
  dest: path.join(os.tmpdir(), "uploads"),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (_req, file, cb) => {
    if (isSupportedAnalysisUpload(file.originalname, file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only ZIP, Python, Java, C, and header files are supported."));
  },
});

app.get("/", (_req, res) => {
  res.json({
    service: "code-review-backend",
    message: "Backend is running. Use /health or POST /api/analyze."
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.post("/api/analyze", analysisUpload.single("file"), async (req, res) => {
  try {
    const projectKey = String(req.body.projectKey || "").trim();
    if (!projectKey) {
      if (req.file) await fs.rm(req.file.path, { force: true });
      return res.status(400).json({ error: "projectKey is required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Source file or ZIP is required as form-data field 'file'" });
    }

    const options = parseScanOptionsJson(req.body.scanOptions);
    const result = await analyzeProject({
      filePath: req.file.path,
      originalName: req.file.originalname,
      projectKey,
      options,
    });

    return res.json(result);
  } catch (err) {
    if (req.file) await fs.rm(req.file.path, { force: true });
    return res.status(500).json({ error: (err as Error).message });
  }
});

function isScanReport(value: unknown): value is StaticAnalysisScanReport {
  if (!value || typeof value !== "object") {
    return false;
  }
  const report = value as Partial<StaticAnalysisScanReport>;
  return typeof report.projectKey === "string"
    && !!report.metrics
    && Array.isArray(report.fileMetrics)
    && Array.isArray(report.clonePairs)
    && Array.isArray(report.findings);
}

function safeReportFilename(projectKey: string): string {
  const normalized = projectKey.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${normalized || "analysis-report"}.pdf`;
}

app.post("/api/report/pdf", async (req, res) => {
  try {
    if (!isScanReport(req.body)) {
      return res.status(400).json({ error: "Valid analysis report is required." });
    }

    const pdf = await renderAnalysisReportPdf(req.body);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeReportFilename(req.body.projectKey)}"`);
    return res.send(pdf);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Upload file is too large." });
  }
  if (err instanceof Error) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: "Unexpected server error." });
});

app.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
});
