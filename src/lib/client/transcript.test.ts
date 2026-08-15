import assert from "node:assert/strict";
import test from "node:test";
import { groupTranscriptRows, structureTranscript } from "./transcript";
import type { MessageDTO, MessageType } from "../types";

function message(
  id: string,
  type: MessageType,
  text: string,
  runId = "run-1",
): MessageDTO {
  return {
    id,
    threadId: "thread-1",
    runId,
    guestId: null,
    type,
    payload: { text },
    createdAt: Number(id.replace(/\D/g, "")) || 0,
    guest: null,
  };
}

function tool(
  id: string,
  callId: string,
  status: "running" | "completed" | "error",
  name = "mcp",
): MessageDTO {
  return {
    ...message(id, "tool_call", ""),
    payload: { callId, name, status },
  };
}

test("coalesces adjacent assistant fragments from the same run", () => {
  const input = [
    message("1", "assistant", "Hi"),
    message("2", "assistant", " — how"),
    message("3", "assistant", " can I help?"),
  ];

  const result = structureTranscript(input, "", "");

  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].payload.text, "Hi — how can I help?");
  assert.equal(input[0].payload.text, "Hi");
});

test("preserves response boundaries", () => {
  const result = structureTranscript(
    [
      message("1", "assistant", "First"),
      message("2", "tool_call", ""),
      message("3", "assistant", "Second"),
      message("4", "assistant", " run", "run-2"),
    ],
    "",
    "",
  );

  assert.deepEqual(
    result.messages.map((item) => item.payload.text),
    ["First", "", "Second", " run"],
  );
});

test("folds the unpersisted live tail into the current response", () => {
  const result = structureTranscript(
    [message("1", "assistant", "Streaming")],
    " now",
    "",
  );

  assert.equal(result.messages[0].payload.text, "Streaming now");
  assert.equal(result.remainingLiveText, "");
});

test("coalesces thinking fragments and their live tail", () => {
  const result = structureTranscript(
    [
      message("1", "thinking", "The user has started"),
      message("2", "thinking", " a second thread."),
      message("3", "thinking", " I need more context."),
    ],
    "",
    " Checking the workspace.",
  );

  assert.equal(result.messages.length, 1);
  assert.equal(
    result.messages[0].payload.text,
    "The user has started a second thread. I need more context. Checking the workspace.",
  );
  assert.equal(result.remainingLiveThinking, "");
});

test("keeps only the latest lifecycle event for each tool call", () => {
  const result = structureTranscript(
    [
      tool("1", "call-1", "running"),
      tool("2", "call-1", "running"),
      tool("3", "call-1", "completed"),
      tool("4", "call-2", "running", "grep_search"),
    ],
    "",
    "",
  );

  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].id, "1");
  assert.equal(result.messages[0].payload.status, "completed");
  assert.equal(result.messages[1].payload.callId, "call-2");
});

test("groups adjacent tool calls into compact activity rows", () => {
  const rows = groupTranscriptRows([
    tool("1", "call-1", "completed"),
    tool("2", "call-2", "completed"),
    message("3", "thinking", "Reviewing results"),
    tool("4", "call-3", "running"),
  ]);

  assert.deepEqual(
    rows.map((row) =>
      row.kind === "tools" ? `tools:${row.messages.length}` : row.message.type,
    ),
    ["tools:2", "thinking", "tools:1"],
  );
});
