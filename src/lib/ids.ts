import { randomBytes } from "node:crypto";

export function nid(size = 10): string {
  return randomBytes(size).toString("hex").slice(0, size);
}

export function now(): number {
  return Date.now();
}
