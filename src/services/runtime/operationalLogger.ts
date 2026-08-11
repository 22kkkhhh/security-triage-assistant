/**
 * Minimal structured operational logger (v1.12-M2).
 * One-line JSON to stdout/stderr. Allowlisted fields only — no open metadata bag.
 */

export type OperationalLogLevel = "info" | "warn" | "error";

export type OperationalLogEvent =
  | "production_start_begin"
  | "production_env_validated"
  | "migration_begin"
  | "migration_success"
  | "readiness_success"
  | "production_start_failed"
  | "readiness_failed"
  | "auth_rate_limited"
  | "authz_denied"
  | "backup_begin"
  | "backup_success"
  | "backup_failed"
  | "restore_begin"
  | "restore_success"
  | "restore_failed";

export type OperationalLogComponent =
  | "production_start"
  | "readiness"
  | "auth"
  | "authz"
  | "backup"
  | "restore";

export type OperationalLogStatus = "ok" | "failed" | "denied" | "limited";

export type OperationalLogRecord = {
  timestamp: string;
  level: OperationalLogLevel;
  event: OperationalLogEvent;
  component: OperationalLogComponent;
  status: OperationalLogStatus;
  permission?: string;
  actionName?: string;
  role?: string;
  stage?: string;
  reason?: string;
};

export type OperationalLoggerSink = (line: string, level: OperationalLogLevel) => void;

const defaultSink: OperationalLoggerSink = (line, level) => {
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
};

function nowIso(clock: () => Date = () => new Date()): string {
  return clock().toISOString();
}

/**
 * Emit one structured operational log line.
 * Only allowlisted keys are serialized.
 */
export function logOperationalEvent(
  input: Omit<OperationalLogRecord, "timestamp"> & { timestamp?: string },
  options?: { sink?: OperationalLoggerSink; clock?: () => Date },
): void {
  const record: OperationalLogRecord = {
    timestamp: input.timestamp ?? nowIso(options?.clock),
    level: input.level,
    event: input.event,
    component: input.component,
    status: input.status,
  };
  if (input.permission !== undefined) record.permission = input.permission;
  if (input.actionName !== undefined) record.actionName = input.actionName;
  if (input.role !== undefined) record.role = input.role;
  if (input.stage !== undefined) record.stage = input.stage;
  if (input.reason !== undefined) record.reason = input.reason;

  const line = JSON.stringify(record);
  if (line.includes("\n") || line.includes("\r")) {
    (options?.sink ?? defaultSink)(
      JSON.stringify({
        timestamp: record.timestamp,
        level: "error",
        event: "production_start_failed",
        component: "production_start",
        status: "failed",
        reason: "log_serialization_rejected",
      }),
      "error",
    );
    return;
  }
  (options?.sink ?? defaultSink)(line, record.level);
}
