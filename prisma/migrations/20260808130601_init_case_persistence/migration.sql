-- CreateTable
CREATE TABLE "CaseRecord" (
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
    "caseState" JSONB NOT NULL,
    "reportDraft" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "closedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseRecord_caseNumber_key" ON "CaseRecord"("caseNumber");

-- CreateIndex
CREATE INDEX "CaseRecord_status_idx" ON "CaseRecord"("status");

-- CreateIndex
CREATE INDEX "CaseRecord_updatedAt_idx" ON "CaseRecord"("updatedAt");

-- CreateIndex
CREATE INDEX "CaseRecord_username_idx" ON "CaseRecord"("username");

-- CreateIndex
CREATE INDEX "CaseRecord_sourceIp_idx" ON "CaseRecord"("sourceIp");
