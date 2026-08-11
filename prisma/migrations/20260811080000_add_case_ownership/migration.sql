-- RedefineTables: 为 CaseRecord 增加运营负责人字段（nullable = 未分配）
-- 不 backfill 历史负责人；既有行保持 assignedToUserId / assignedAt = NULL
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedToUserId" TEXT,
    "assignedAt" DATETIME,
    CONSTRAINT "CaseRecord_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CaseRecord" (
    "id", "caseNumber", "title", "status", "suggestedRiskLevel", "humanRiskLevel", "humanConclusion",
    "username", "sourceIp", "systemsSearchText", "pendingChecklistCount", "hasReport", "reportUpdatedAt",
    "caseState", "reportDraft", "createdAt", "updatedAt", "closedAt", "lastActivityAt"
)
SELECT
    "id", "caseNumber", "title", "status", "suggestedRiskLevel", "humanRiskLevel", "humanConclusion",
    "username", "sourceIp", "systemsSearchText", "pendingChecklistCount", "hasReport", "reportUpdatedAt",
    "caseState", "reportDraft", "createdAt", "updatedAt", "closedAt", "lastActivityAt"
FROM "CaseRecord";
DROP TABLE "CaseRecord";
ALTER TABLE "new_CaseRecord" RENAME TO "CaseRecord";
CREATE UNIQUE INDEX "CaseRecord_caseNumber_key" ON "CaseRecord"("caseNumber");
CREATE INDEX "CaseRecord_status_idx" ON "CaseRecord"("status");
CREATE INDEX "CaseRecord_updatedAt_idx" ON "CaseRecord"("updatedAt");
CREATE INDEX "CaseRecord_lastActivityAt_idx" ON "CaseRecord"("lastActivityAt");
CREATE INDEX "CaseRecord_username_idx" ON "CaseRecord"("username");
CREATE INDEX "CaseRecord_sourceIp_idx" ON "CaseRecord"("sourceIp");
CREATE INDEX "CaseRecord_assignedToUserId_idx" ON "CaseRecord"("assignedToUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
