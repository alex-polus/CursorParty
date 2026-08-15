import assert from "node:assert/strict";
import test from "node:test";
import {
  composerParameters,
  defaultModelParams,
  selectModelParam,
} from "./model-options";
import type { ModelDTO } from "../types";

const model: ModelDTO = {
  id: "example",
  displayName: "Example",
  parameters: [
    {
      id: "reasoning",
      displayName: "Reasoning",
      values: [
        { value: "low", displayName: "Low" },
        { value: "high", displayName: "High" },
      ],
    },
    {
      id: "fast",
      displayName: "Fast",
      values: [
        { value: "false", displayName: "Off" },
        { value: "true", displayName: "On" },
      ],
    },
    {
      id: "context",
      displayName: "Context",
      values: [{ value: "1m", displayName: "1M" }],
    },
  ],
  defaultParams: [
    { id: "reasoning", value: "high" },
    { id: "fast", value: "false" },
    { id: "context", value: "1m" },
  ],
  variants: [
    [
      { id: "reasoning", value: "high" },
      { id: "fast", value: "false" },
      { id: "context", value: "1m" },
    ],
    [
      { id: "reasoning", value: "high" },
      { id: "fast", value: "true" },
      { id: "context", value: "272k" },
    ],
  ],
};

test("shows only thinking and fast model parameters", () => {
  assert.deepEqual(
    composerParameters(model).map((parameter) => parameter.id),
    ["reasoning", "fast"],
  );
});

test("copies the catalog's default model parameters", () => {
  const params = defaultModelParams(model);
  assert.deepEqual(params, model.defaultParams);
  assert.notEqual(params, model.defaultParams);
});

test("selects a valid catalog variant when fast mode changes hidden defaults", () => {
  assert.deepEqual(
    selectModelParam(model, model.defaultParams, "fast", "true"),
    model.variants[1],
  );
});
