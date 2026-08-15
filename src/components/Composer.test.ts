import assert from "node:assert/strict";
import test from "node:test";
import { shouldSubmitComposerKey } from "./Composer";

test("plain Enter submits the composer", () => {
  assert.equal(shouldSubmitComposerKey("Enter", false, false), true);
});

test("Shift+Enter keeps the newline behavior", () => {
  assert.equal(shouldSubmitComposerKey("Enter", true, false), false);
});

test("IME composition does not accidentally submit", () => {
  assert.equal(shouldSubmitComposerKey("Enter", false, true), false);
});

test("other keys do not submit", () => {
  assert.equal(shouldSubmitComposerKey(" ", false, false), false);
});
