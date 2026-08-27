-- Add a first-class idempotency key for external alert ingestion.
ALTER TABLE "CaseRecord" ADD COLUMN "externalAlertId" TEXT;

CREATE UNIQUE INDEX "CaseRecord_externalAlertId_key"
ON "CaseRecord"("externalAlertId");
