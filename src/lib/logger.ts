import {
  debug as writeDebug,
  error as writeError,
  info as writeInfo,
  warn as writeWarn,
} from "@tauri-apps/plugin-log";

type LogWriter = (message: string) => Promise<void>;

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : String(error);
}

function write(writer: LogWriter, scope: string, message: string) {
  void writer(`${scope}: ${message}`).catch(() => undefined);
}

export function logDebug(scope: string, message: string) {
  write(writeDebug, scope, message);
}

export function logInfo(scope: string, message: string) {
  write(writeInfo, scope, message);
}

export function logWarn(scope: string, message: string) {
  write(writeWarn, scope, message);
}

export function logError(scope: string, error: unknown) {
  write(writeError, scope, describeError(error));
}
