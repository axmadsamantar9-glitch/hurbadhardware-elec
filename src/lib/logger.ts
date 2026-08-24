// Structured JSON logger. Every line carries a correlation ID so a single
// request can be traced end to end (PRD §9.6). Redaction runs two passes:
// keys shaped like secrets are masked outright, and any string that contains
// the *value* of a currently-configured secret env var is scrubbed too, so a
// value pasted into a message can't leak even when its key looks innocuous.
// Additionally, PII (email, phone, name) is redacted from all log output to
// protect customer privacy (AC17).

import { redactPII } from "@/lib/redact";

type LogLevel = "info" | "warn" | "error";

interface LogContext {
  correlationId?: string;
  [key: string]: unknown;
}

const SECRET_KEY_PATTERN = /(key|secret|token|password|credential|authorization)/i;

// Name-pattern matching alone misses real secrets whose env var name doesn't
// happen to contain one of those words — DATABASE_URL/DIRECT_URL embed a DB
// password, and several gateway vars are account identifiers PRD §9 treats as
// sensitive. Listed explicitly so they're redacted regardless of naming.
const EXPLICIT_SECRET_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "WAAFIPAY_MERCHANT_UID",
  "WAAFIPAY_API_USER_ID",
  "EDAHAB_AGENT_CODE",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "WHATSAPP_PHONE_NUMBER_ID",
];

// Re-read on every call rather than snapshotted once at module load: `import`
// statements hoist above other code, so a one-time snapshot can run before an
// env var is actually populated and silently miss it for the process's
// lifetime. The env is small, so re-scanning per log call is cheap.
function currentSecretValues(): string[] {
  const secrets: string[] = [];
  for (const [key, value] of Object.entries(process.env)) {
    if (
      (SECRET_KEY_PATTERN.test(key) || EXPLICIT_SECRET_KEYS.includes(key)) &&
      value !== undefined &&
      value !== null &&
      value.length > 3
    ) {
      secrets.push(value);
    }
  }
  return secrets;
}

function scrubString(value: string): string {
  return currentSecretValues().reduce(
    (result, secret) => result.split(secret).join("[redacted]"),
    value
  );
}

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubString(value);
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      stack: value.stack ? scrubString(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redact(val),
      ])
    );
  }
  return value;
}

function write(level: LogLevel, message: string, context: LogContext = {}) {
  const line = {
    level,
    message: scrubString(message),
    timestamp: new Date().toISOString(),
    ...(redactPII(redact(context)) as Record<string, unknown>),
  };
  const output = JSON.stringify(line);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
