/**
 * Minimal structured logger with levels, child scopes and pretty console
 * output. Zero external dependencies so every package can use it freely.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";

export interface LogFields {
  [key: string]: unknown;
}

function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return (Object.keys(LEVEL_ORDER) as LogLevel[]).includes(raw as LogLevel)
    ? (raw as LogLevel)
    : "info";
}

function serializeFields(fields?: LogFields): string {
  if (!fields || Object.keys(fields).length === 0) return "";
  try {
    return (
      " " +
      Object.entries(fields)
        .map(([k, v]) => {
          if (v instanceof Error) return `${k}=${JSON.stringify(v.message)}`;
          if (typeof v === "object") return `${k}=${JSON.stringify(v)}`;
          return `${k}=${String(v)}`;
        })
        .join(" ")
    );
  } catch {
    return " [unserializable fields]";
  }
}

export class Logger {
  constructor(private readonly scope: string) {}

  child(subScope: string): Logger {
    return new Logger(`${this.scope}:${subScope}`);
  }

  debug(message: string, fields?: LogFields): void {
    this.log("debug", message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.log("info", message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.log("warn", message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.log("error", message, fields);
  }

  private log(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel()]) return;
    const ts = new Date().toISOString();
    const line = `${COLORS[level]}${ts} ${level.toUpperCase().padEnd(5)} [${this.scope}]${RESET} ${message}${serializeFields(fields)}`;
    if (level === "error") process.stderr.write(line + "\n");
    else process.stdout.write(line + "\n");
  }
}

export function createLogger(scope: string): Logger {
  return new Logger(scope);
}
