import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadDotEnv() {
  const file = path.join(process.cwd(), ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

export function databaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./data/cursorparty.db";
  if (raw.startsWith("file:./") || raw.startsWith("file:../")) {
    const rel = raw.slice("file:".length);
    return `file:${path.resolve(process.cwd(), rel)}`;
  }
  return raw;
}

export function cursorApiKey(): string | undefined {
  const key = process.env.CURSOR_API_KEY?.trim();
  return key || undefined;
}

export function listenHost(): string {
  return process.env.HOST ?? "0.0.0.0";
}

export function listenPort(): number {
  return Number(process.env.PORT ?? 3000);
}
