-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "username" TEXT,
    "displayUsername" TEXT,
    "role" TEXT,
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" DATETIME,
    "enabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,
    CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CaseAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "operationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseAuditLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CaseRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CaseAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CaseAuditLog" ("actionType", "actorId", "actorName", "actorType", "caseId", "changes", "createdAt", "id", "metadata", "operationId", "summary") SELECT "actionType", "actorId", "actorName", "actorType", "caseId", "changes", "createdAt", "id", "metadata", "operationId", "summary" FROM "CaseAuditLog";
DROP TABLE "CaseAuditLog";
ALTER TABLE "new_CaseAuditLog" RENAME TO "CaseAuditLog";
CREATE UNIQUE INDEX "CaseAuditLog_operationId_key" ON "CaseAuditLog"("operationId");
CREATE INDEX "CaseAuditLog_caseId_createdAt_idx" ON "CaseAuditLog"("caseId", "createdAt");
CREATE INDEX "CaseAuditLog_actionType_idx" ON "CaseAuditLog"("actionType");
CREATE INDEX "CaseAuditLog_actorId_idx" ON "CaseAuditLog"("actorId");
CREATE TABLE "new_CaseRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "suggestedRiskLevel" TEXT,
    "humanRiskLevel" TEXT,
    "humanConclusion" TEXT,
    "username" TEXT,
    "sourceIp" TEXT,
    "systemsSearchText" TEXT,
    "pendingChecklistCount" INTEGER NOT NULL DEFAULT 0,
    "hasReport" BOOLEAN NOT NULL DEFAULT false,
    "reportUpdatedAt" DATETIME,
    "caseState" JSONB NOT NULL,
    "reportDraft" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_CaseRecord" ("caseNumber", "caseState", "closedAt", "createdAt", "hasReport", "humanConclusion", "humanRiskLevel", "id", "lastActivityAt", "pendingChecklistCount", "reportDraft", "reportUpdatedAt", "sourceIp", "status", "suggestedRiskLevel", "systemsSearchText", "title", "updatedAt", "username") SELECT "caseNumber", "caseState", "closedAt", "createdAt", "hasReport", "humanConclusion", "humanRiskLevel", "id", "lastActivityAt", "pendingChecklistCount", "reportDraft", "reportUpdatedAt", "sourceIp", "status", "suggestedRiskLevel", "systemsSearchText", "title", "updatedAt", "username" FROM "CaseRecord";
DROP TABLE "CaseRecord";
ALTER TABLE "new_CaseRecord" RENAME TO "CaseRecord";
CREATE UNIQUE INDEX "CaseRecord_caseNumber_key" ON "CaseRecord"("caseNumber");
CREATE INDEX "CaseRecord_status_idx" ON "CaseRecord"("status");
CREATE INDEX "CaseRecord_updatedAt_idx" ON "CaseRecord"("updatedAt");
CREATE INDEX "CaseRecord_lastActivityAt_idx" ON "CaseRecord"("lastActivityAt");
CREATE INDEX "CaseRecord_username_idx" ON "CaseRecord"("username");
CREATE INDEX "CaseRecord_sourceIp_idx" ON "CaseRecord"("sourceIp");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
