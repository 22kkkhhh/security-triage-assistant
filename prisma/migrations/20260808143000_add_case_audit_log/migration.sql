-- AlterTable: SQLite 不允许 ADD COLUMN 使用 CURRENT_TIMESTAMP 等非常量默认值
-- 先用常量默认值占位，再 backfill 为 createdAt
ALTER TABLE "CaseRecord" ADD COLUMN "lastActivityAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00+00:00';

UPDATE "CaseRecord" SET "lastActivityAt" = "createdAt";

-- CreateIndex
CREATE INDEX "CaseRecord_lastActivityAt_idx" ON "CaseRecord"("lastActivityAt");

-- CreateTable: 操作审计（append-only；外键 Restrict，禁止级联删除）
CREATE TABLE "CaseAuditLog" (
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
    CONSTRAINT "CaseAuditLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CaseRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseAuditLog_operationId_key" ON "CaseAuditLog"("operationId");

-- CreateIndex
CREATE INDEX "CaseAuditLog_caseId_createdAt_idx" ON "CaseAuditLog"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseAuditLog_actionType_idx" ON "CaseAuditLog"("actionType");
