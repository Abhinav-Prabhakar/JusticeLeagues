import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Local structured logs. One JSON line per event on stdout, or appended to
 * `LOG_FILE` when it is set. Nothing leaves the machine.
 *
 *   LOG_LEVEL=warn LOG_FILE=data/logs/app.ndjson npm start
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

type Fields = Record<string, unknown>;

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function configuredLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.toLowerCase();
  return value && value in ORDER ? (value as LogLevel) : "info";
}

const threshold = configuredLevel();
const logFile = process.env.LOG_FILE?.trim() ? path.resolve(process.env.LOG_FILE.trim()) : null;
if (logFile) mkdirSync(path.dirname(logFile), { recursive: true });

const REDACTED = new Set([
  "password",
  "password_hash",
  "passwordhash",
  "token",
  "token_hash",
  "cookie",
  "set-cookie",
  "authorization",
  "secret",
  "guardian_consent",
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (typeof value === "string") return value.length > 4_000 ? `${value.slice(0, 4_000)}…` : value;
  if (value === undefined) return undefined;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = REDACTED.has(key.toLowerCase()) ? "[redacted]" : redact(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

export function log(level: LogLevel, message: string, fields: Fields = {}): void {
  if (ORDER[level] < ORDER[threshold]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(redact(fields) as Record<string, unknown>),
  };
  const line = `${JSON.stringify(entry)}\n`;
  try {
    if (logFile) appendFileSync(logFile, line);
    else process.stdout.write(line);
  } catch {
    // A logging failure must never take the request down.
    process.stderr.write(line);
  }
}

export const logger = {
  debug: (message: string, fields?: Fields) => log("debug", message, fields),
  info: (message: string, fields?: Fields) => log("info", message, fields),
  warn: (message: string, fields?: Fields) => log("warn", message, fields),
  error: (message: string, fields?: Fields) => log("error", message, fields),
};

/** Error fields that are safe to send to a log line. */
export function errorFields(error: unknown): Fields {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 12).join("\n") ?? "",
    };
  }
  return { message: String(error) };
}

export function requestId(header: string | undefined): string {
  const supplied = header?.trim();
  if (supplied && /^[\w.:-]{1,80}$/.test(supplied)) return supplied;
  return `req_${crypto.randomUUID()}`;
}
