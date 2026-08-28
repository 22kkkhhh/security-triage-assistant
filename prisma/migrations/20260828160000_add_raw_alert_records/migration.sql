-- Preserve every imported alert after recursive secret redaction.
CREATE TABLE "RawAlertRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL,
    "externalAlertId" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "redactionVersion" TEXT NOT NULL DEFAULT 'v1',
    "ingestStatus" TEXT NOT NULL DEFAULT 'RECEIVED',
    "errorMessage" TEXT,
    "caseId" TEXT,
    CONSTRAINT "RawAlertRecord_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "CaseRecord" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "RawAlertRecord_externalAlertId_idx"
ON "RawAlertRecord"("externalAlertId");

CREATE INDEX "RawAlertRecord_receivedAt_idx"
ON "RawAlertRecord"("receivedAt");

CREATE INDEX "RawAlertRecord_caseId_idx"
ON "RawAlertRecord"("caseId");

CREATE INDEX "RawAlertRecord_ingestStatus_idx"
ON "RawAlertRecord"("ingestStatus");
