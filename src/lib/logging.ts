type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const levels: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const sensitiveKey = /api[-_]?key|authorization|cookie|password|secret|token/i;

function configuredLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.toLowerCase();
  return value === "debug" || value === "info" || value === "warn" || value === "error"
    ? value
    : process.env.NODE_ENV === "production"
      ? "info"
      : "debug";
}

function errorDetails(error: Error, depth = 0): LogFields {
  const details: LogFields = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  const candidate = error as Error & {
    cause?: unknown;
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    helpUrl?: unknown;
  };
  for (const key of ["code", "status", "statusCode", "helpUrl"] as const) {
    if (candidate[key] !== undefined) details[key] = candidate[key];
  }
  if (candidate.cause !== undefined && depth < 3) {
    details.cause = serializeError(candidate.cause, depth + 1);
  }
  return details;
}

export function serializeError(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return errorDetails(value, depth);
  if (typeof value === "object" && value !== null) {
    return sanitize(value, depth);
  }
  return { message: String(value) };
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[max depth]";
  if (value instanceof Error) return errorDetails(value, depth);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  if (typeof value !== "object" || value === null) return value;

  const output: LogFields = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = sensitiveKey.test(key) ? "[redacted]" : sanitize(item, depth + 1);
  }
  return output;
}

function write(level: LogLevel, component: string, event: string, fields: LogFields) {
  if (levels[level] < levels[configuredLevel()]) return;
  const entry = sanitize({
    timestamp: new Date().toISOString(),
    level,
    component,
    event,
    ...fields,
  });
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(component: string) {
  return {
    debug: (event: string, fields: LogFields = {}) => write("debug", component, event, fields),
    info: (event: string, fields: LogFields = {}) => write("info", component, event, fields),
    warn: (event: string, fields: LogFields = {}) => write("warn", component, event, fields),
    error: (event: string, error: unknown, fields: LogFields = {}) =>
      write("error", component, event, { ...fields, error: serializeError(error) }),
  };
}
