import { ensureSchema } from "./ensure";

async function main() {
  await ensureSchema();
  console.log("schema ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
