import { readFileSync } from "fs";
import path from "path";

export const loadEnvFile = (envFilePath = ".env") => {
  const envPath = path.join(__dirname, "..", envFilePath);
  const envFile = readFileSync(envPath, "utf-8");
  envFile.split("\n").forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return;
    }
    const [key, ...valueParts] = trimmedLine.split("=");
    const value = valueParts.join("=").trim();
    if (key && !(key in process.env)) {
      // Remove possible surrounding quotes
      const unquotedValue = value.replace(/^(['"])(.*)\1$/, "$2");
      process.env[key.trim()] = unquotedValue;
    }
  });
};
