import assert from "node:assert/strict";
import test from "node:test";
import {
  isFormSubmission,
  parseWorkspaceCreateInput,
} from "./workspace-input";

test("parses the JSON request used after hydration", () => {
  assert.deepEqual(
    parseWorkspaceCreateInput(
      JSON.stringify({
        name: "Launch room",
        repoUrl: "https://github.com/acme/rocket",
        startingRef: "develop",
      }),
      "application/json",
    ),
    {
      name: "Launch room",
      repoUrl: "https://github.com/acme/rocket",
      startingRef: "develop",
    },
  );
});

test("parses a native form submission made before hydration", () => {
  assert.deepEqual(
    parseWorkspaceCreateInput(
      "repoUrl=https%3A%2F%2Fgithub.com%2Facme%2Frocket&startingRef=feature%2Fone&name=Launch+room",
      "application/x-www-form-urlencoded; charset=UTF-8",
    ),
    {
      name: "Launch room",
      repoUrl: "https://github.com/acme/rocket",
      startingRef: "feature/one",
    },
  );
});

test("recognizes form content types case-insensitively", () => {
  assert.equal(
    isFormSubmission("Application/X-WWW-Form-Urlencoded; charset=utf-8"),
    true,
  );
  assert.equal(isFormSubmission("application/json"), false);
});

test("rejects non-object JSON bodies", () => {
  assert.throws(
    () => parseWorkspaceCreateInput("[]", "application/json"),
    /must be an object/,
  );
});
