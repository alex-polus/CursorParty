import { ensureSchema } from "./ensure";
import { createLogger } from "../logging";

const log = createLogger("migration");

async function main() {
  await ensureSchema();
  log.info("schema.ready");
}

main().catch((err) => {
  log.error("schema.failed", err);
  process.exit(1);
});
