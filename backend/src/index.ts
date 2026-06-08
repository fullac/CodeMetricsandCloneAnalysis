import express from "express";
import cors from "cors";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import { config } from "./config.js";
import { processZipAndReview, removeProjectRecord, runHotspotDiagnosis, runIssueDiagnosis, runProjectDiagnosis } from "./services/scanService.js";
import type { ProjectMetrics, ReviewIssue } from "./types/index.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  dest: path.join(os.tmpdir(), "uploads"),
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/zip" || file.originalname.toLowerCase().endsWith(".zip")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only ZIP files are supported."));
  },
});

app.get("/", (_req, res) => {
  res.json({
    service: "code-review-backend",
    message: "Backend is running. Use /health or POST /api/review."
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.post("/api/review", upload.single("file"), async (req, res) => {
  try {
    const projectKey = String(req.body.projectKey || "").trim();
    if (!projectKey) {
      return res.status(400).json({ error: "projectKey is required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "ZIP file is required as form-data field 'file'" });
    }

    const result = await processZipAndReview({
      zipPath: req.file.path,
      projectKey,
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/diagnose/project", async (req, res) => {
  try {
    const metrics = (req.body?.metrics ?? {}) as ProjectMetrics;
    const diagnosisResult = await runProjectDiagnosis(metrics);
    return res.json(diagnosisResult);
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/diagnose/issues", async (req, res) => {
  try {
    const issues = (req.body?.issues ?? []) as ReviewIssue[];
    const results = await runIssueDiagnosis(issues);
    return res.json({ results });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/diagnose/hotspots", async (req, res) => {
  try {
    const hotspots = (req.body?.issues ?? []) as ReviewIssue[];
    const results = await runHotspotDiagnosis(hotspots);
    return res.json({ results });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/review/delete", async (req, res) => {
  try {
    const projectKey = String(req.body?.projectKey || "").trim();
    if (!projectKey) {
      return res.status(400).json({ error: "projectKey is required" });
    }
    await removeProjectRecord(projectKey);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "ZIP file is too large. Max size is 1GB." });
  }
  if (err instanceof Error) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: "Unexpected server error." });
});

app.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
});
