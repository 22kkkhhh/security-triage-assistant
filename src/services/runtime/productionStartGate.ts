/**
 * Production start gate: validate env → filesystem preflight → migrate deploy
 * → readiness → start Next. Injectable adapters keep unit tests free of a live
 * Next process.
 */

import {
  assertSqliteParentDirectoryReady,
  validateProductionEnvironment,
  type ValidateProductionEnvironmentInput,
} from "@/lib/envConfig";
import { logOperationalEvent } from "@/services/runtime/operationalLogger";
import {
  checkApplicationReadiness,
  formatReadinessFailureMessage,
  type ReadinessCheckResult,
} from "@/services/runtime/readiness";

export type ProductionStartGateDeps = {
  env?: ValidateProductionEnvironmentInput;
  validateEnv?: (env: ValidateProductionEnvironmentInput) => void;
  preflightFilesystem?: (env: ValidateProductionEnvironmentInput) => void;
  migrateDeploy?: () => Promise<void>;
  checkReadiness?: () => Promise<ReadinessCheckResult>;
  startNext?: () => Promise<number>;
  logError?: (message: string) => void;
};

export type ProductionStartGateResult = {
  exitCode: number;
  stage:
    | "env"
    | "filesystem"
    | "migrate"
    | "readiness"
    | "next"
    | "complete";
  nextStarted: boolean;
};

function defaultLogError(message: string): void {
  console.error(message);
}

/**
 * Run the full production start sequence.
 * On any failure: sanitized stderr, exitCode != 0, Next is not started.
 */
export async function runProductionStartGate(
  deps: ProductionStartGateDeps = {},
): Promise<ProductionStartGateResult> {
  const env = deps.env ?? process.env;
  const logError = deps.logError ?? defaultLogError;
  const validateEnv =
    deps.validateEnv ??
    ((input) => {
      validateProductionEnvironment(input);
    });
  const preflightFilesystem =
    deps.preflightFilesystem ??
    ((input) => {
      assertSqliteParentDirectoryReady({
        nodeEnv: "production",
        databaseUrl: input.DATABASE_URL,
      });
    });
  const migrateDeploy = deps.migrateDeploy;
  const checkReadiness =
    deps.checkReadiness ?? (() => checkApplicationReadiness());
  const startNext = deps.startNext;

  logOperationalEvent({
    level: "info",
    event: "production_start_begin",
    component: "production_start",
    status: "ok",
  });

  try {
    validateEnv(env);
    logOperationalEvent({
      level: "info",
      event: "production_env_validated",
      component: "production_start",
      status: "ok",
    });
  } catch {
    logError("production env validation failed");
    logOperationalEvent({
      level: "error",
      event: "production_start_failed",
      component: "production_start",
      status: "failed",
      stage: "env",
    });
    return { exitCode: 1, stage: "env", nextStarted: false };
  }

  try {
    preflightFilesystem(env);
  } catch {
    logError("database filesystem preflight failed");
    logOperationalEvent({
      level: "error",
      event: "production_start_failed",
      component: "production_start",
      status: "failed",
      stage: "filesystem",
    });
    return { exitCode: 1, stage: "filesystem", nextStarted: false };
  }

  if (!migrateDeploy) {
    logError("database migration failed");
    logOperationalEvent({
      level: "error",
      event: "production_start_failed",
      component: "production_start",
      status: "failed",
      stage: "migrate",
    });
    return { exitCode: 1, stage: "migrate", nextStarted: false };
  }

  try {
    logOperationalEvent({
      level: "info",
      event: "migration_begin",
      component: "production_start",
      status: "ok",
    });
    await migrateDeploy();
    logOperationalEvent({
      level: "info",
      event: "migration_success",
      component: "production_start",
      status: "ok",
    });
  } catch {
    logError("database migration failed");
    logOperationalEvent({
      level: "error",
      event: "production_start_failed",
      component: "production_start",
      status: "failed",
      stage: "migrate",
    });
    return { exitCode: 1, stage: "migrate", nextStarted: false };
  }

  let readiness: ReadinessCheckResult;
  try {
    readiness = await checkReadiness();
  } catch {
    logError("readiness failed: application is not ready");
    logOperationalEvent({
      level: "error",
      event: "readiness_failed",
      component: "readiness",
      status: "failed",
    });
    return { exitCode: 1, stage: "readiness", nextStarted: false };
  }

  if (!readiness.ready) {
    logError(formatReadinessFailureMessage(readiness.category));
    logOperationalEvent({
      level: "error",
      event: "readiness_failed",
      component: "readiness",
      status: "failed",
      reason: readiness.category,
    });
    return { exitCode: 1, stage: "readiness", nextStarted: false };
  }

  logOperationalEvent({
    level: "info",
    event: "readiness_success",
    component: "readiness",
    status: "ok",
  });

  if (!startNext) {
    logError("next start failed");
    logOperationalEvent({
      level: "error",
      event: "production_start_failed",
      component: "production_start",
      status: "failed",
      stage: "next",
    });
    return { exitCode: 1, stage: "next", nextStarted: false };
  }

  try {
    const code = await startNext();
    if (code !== 0) {
      logError("next start failed");
      logOperationalEvent({
        level: "error",
        event: "production_start_failed",
        component: "production_start",
        status: "failed",
        stage: "next",
      });
      return { exitCode: code || 1, stage: "next", nextStarted: true };
    }
    return { exitCode: 0, stage: "complete", nextStarted: true };
  } catch {
    logError("next start failed");
    logOperationalEvent({
      level: "error",
      event: "production_start_failed",
      component: "production_start",
      status: "failed",
      stage: "next",
    });
    return { exitCode: 1, stage: "next", nextStarted: false };
  }
}
