import assert from "node:assert/strict";
import test from "node:test";
import { serializeError } from "./logging";

test("serializes errors with stack, metadata, and nested causes", () => {
  const cause = Object.assign(new Error("socket closed"), { code: "ECONNRESET" });
  const error = new Error("request failed", { cause });

  const result = serializeError(error) as Record<string, unknown>;
  assert.equal(result.name, "Error");
  assert.equal(result.message, "request failed");
  assert.match(String(result.stack), /request failed/);
  assert.deepEqual(result.cause, {
    name: "Error",
    message: "socket closed",
    stack: cause.stack,
    code: "ECONNRESET",
  });
});

test("redacts sensitive fields from object-shaped failures", () => {
  assert.deepEqual(
    serializeError({ message: "bad request", apiKey: "cursor_secret", nested: { token: "secret" } }),
    { message: "bad request", apiKey: "[redacted]", nested: { token: "[redacted]" } },
  );
});

test("normalizes values that JSON cannot serialize directly", () => {
  const createdAt = new Date("2026-08-15T12:00:00.000Z");
  assert.deepEqual(serializeError({ count: 12n, createdAt }), {
    count: "12",
    createdAt: "2026-08-15T12:00:00.000Z",
  });
});
