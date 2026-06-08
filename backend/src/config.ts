import dotenv from "dotenv";

dotenv.config();

const required = [
  "PORT",
  "SONAR_HOST_URL",
  "SONAR_TOKEN",
  "SONAR_USER_TOKEN",
  "SONAR_SCANNER_BIN",
  "OPENAI_BASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL"
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env: ${key}`);
  }
}

export const config = {
  port: Number(process.env.PORT),
  sonarHostUrl: process.env.SONAR_HOST_URL!,
  sonarToken: process.env.SONAR_TOKEN!,
  sonarUserToken: process.env.SONAR_USER_TOKEN!,
  sonarScannerBin: process.env.SONAR_SCANNER_BIN!,
  sonarSources: process.env.SONAR_SOURCES || ".",
  sonarInclusions: process.env.SONAR_INCLUSIONS || "",
  sonarExclusions:
    process.env.SONAR_EXCLUSIONS ||
    [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.next/**",
      "**/.nuxt/**",
      "**/.venv/**",
      "**/venv/**",
      "**/target/**",
      "**/vendor/**",
      "**/*.min.js",
      "**/*.map",
      "**/*.lock"
    ].join(","),
  openaiBaseUrl: process.env.OPENAI_BASE_URL!,
  openaiApiKey: process.env.OPENAI_API_KEY!,
  openaiModel: process.env.OPENAI_MODEL!
};
