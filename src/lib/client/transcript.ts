import type { MessageDTO } from "../types";

export type StructuredTranscript = {
  messages: MessageDTO[];
  remainingLiveText: string;
  remainingLiveThinking: string;
};

export type TranscriptRow =
  | { kind: "message"; key: string; message: MessageDTO }
  | { kind: "tools"; key: string; messages: MessageDTO[] };

export function structureTranscript(
  messages: MessageDTO[],
  liveText: string,
  liveThinking: string,
): StructuredTranscript {
  const structured: MessageDTO[] = [];
  const toolCallIndexes = new Map<string, number>();

  for (const message of messages) {
    const toolCallKey = keyForToolCall(message);
    if (toolCallKey) {
      const existingIndex = toolCallIndexes.get(toolCallKey);
      if (existingIndex !== undefined) {
        const firstEvent = structured[existingIndex];
        structured[existingIndex] = {
          ...message,
          id: firstEvent.id,
          createdAt: firstEvent.createdAt,
        };
        continue;
      }
      toolCallIndexes.set(toolCallKey, structured.length);
    }

    const previous = structured.at(-1);
    const sameStreamedBlock =
      (message.type === "assistant" || message.type === "thinking") &&
      message.type === previous?.type &&
      message.runId !== null &&
      message.runId === previous.runId;

    if (!sameStreamedBlock) {
      structured.push(message);
      continue;
    }

    structured[structured.length - 1] = appendText(previous, textOf(message));
  }

  const last = structured.at(-1);
  if (liveText && last?.type === "assistant") {
    structured[structured.length - 1] = appendText(last, liveText);
    return {
      messages: structured,
      remainingLiveText: "",
      remainingLiveThinking: liveThinking,
    };
  }

  if (liveThinking && last?.type === "thinking") {
    structured[structured.length - 1] = appendText(last, liveThinking);
    return {
      messages: structured,
      remainingLiveText: liveText,
      remainingLiveThinking: "",
    };
  }

  return {
    messages: structured,
    remainingLiveText: liveText,
    remainingLiveThinking: liveThinking,
  };
}

export function groupTranscriptRows(messages: MessageDTO[]): TranscriptRow[] {
  const rows: TranscriptRow[] = [];

  for (const message of messages) {
    const previous = rows.at(-1);
    if (message.type === "tool_call" && previous?.kind === "tools") {
      previous.messages.push(message);
      continue;
    }

    if (message.type === "tool_call") {
      rows.push({ kind: "tools", key: `tools-${message.id}`, messages: [message] });
    } else {
      rows.push({ kind: "message", key: message.id, message });
    }
  }

  return rows;
}

function appendText(message: MessageDTO, text: string): MessageDTO {
  return {
    ...message,
    payload: {
      ...message.payload,
      text: `${textOf(message)}${text}`,
    },
  };
}

function textOf(message: MessageDTO): string {
  return String(message.payload.text ?? "");
}

function keyForToolCall(message: MessageDTO): string | null {
  if (message.type !== "tool_call" || message.runId === null) return null;
  const callId = message.payload.callId;
  if (typeof callId !== "string" || !callId) return null;
  return `${message.runId}:${callId}`;
}
