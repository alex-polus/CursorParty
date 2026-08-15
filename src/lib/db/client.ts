import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { databaseUrl } from "../env";
import * as schema from "./schema";

function ensureDataDir(url: string) {
  if (!url.startsWith("file:")) return;
  const filePath = url.slice("file:".length);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

const url = databaseUrl();
ensureDataDir(url);

export const sqlite = createClient({ url });
export const db = drizzle(sqlite, { schema });
