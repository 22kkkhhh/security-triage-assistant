-- CreateTable
CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "issuingAuthority" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ComplianceDocumentVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "versionKey" TEXT NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "documentNumber" TEXT,
    "publishDate" DATETIME,
    "effectiveDate" DATETIME NOT NULL,
    "expiryDate" DATETIME,
    "publicationStatus" TEXT NOT NULL,
    "legalStatus" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "rightsStatus" TEXT NOT NULL,
    "contentMode" TEXT NOT NULL,
    "sourceFileName" TEXT,
    "sourceFileHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "reviewedAt" DATETIME,
    "publishedAt" DATETIME,
    CONSTRAINT "ComplianceDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ComplianceDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComplianceClause" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentVersionId" TEXT NOT NULL,
    "clauseKey" TEXT NOT NULL,
    "articleNumber" TEXT,
    "chapter" TEXT,
    "section" TEXT,
    "heading" TEXT,
    "parentClauseId" TEXT,
    "originalText" TEXT,
    "summary" TEXT,
    "interpretation" TEXT,
    "topics" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComplianceClause_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "ComplianceDocumentVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ComplianceClause_parentClauseId_fkey" FOREIGN KEY ("parentClauseId") REFERENCES "ComplianceClause" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComplianceControl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "controlCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objectives" TEXT,
    "requiredContext" JSONB NOT NULL,
    "suggestedEvidence" JSONB NOT NULL,
    "suggestedChecklistItems" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RuleControlMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "rationale" TEXT,
    "requiredContext" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RuleControlMapping_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ComplianceControl" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ControlClauseMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "controlId" TEXT NOT NULL,
    "clauseId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "requiredContext" JSONB NOT NULL,
    "suggestedEvidence" JSONB NOT NULL,
    "suggestedChecklistItems" JSONB NOT NULL,
    "reviewStatus" TEXT NOT NULL,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ControlClauseMapping_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ComplianceControl" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ControlClauseMapping_clauseId_fkey" FOREIGN KEY ("clauseId") REFERENCES "ComplianceClause" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceDocument_canonicalCode_key" ON "ComplianceDocument"("canonicalCode");

-- CreateIndex
CREATE INDEX "ComplianceDocument_documentType_idx" ON "ComplianceDocument"("documentType");

-- CreateIndex
CREATE INDEX "ComplianceDocument_title_idx" ON "ComplianceDocument"("title");

-- CreateIndex
CREATE INDEX "ComplianceDocumentVersion_publicationStatus_idx" ON "ComplianceDocumentVersion"("publicationStatus");

-- CreateIndex
CREATE INDEX "ComplianceDocumentVersion_legalStatus_idx" ON "ComplianceDocumentVersion"("legalStatus");

-- CreateIndex
CREATE INDEX "ComplianceDocumentVersion_effectiveDate_idx" ON "ComplianceDocumentVersion"("effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceDocumentVersion_documentId_versionKey_key" ON "ComplianceDocumentVersion"("documentId", "versionKey");

-- CreateIndex
CREATE INDEX "ComplianceClause_documentVersionId_sortOrder_idx" ON "ComplianceClause"("documentVersionId", "sortOrder");

-- CreateIndex
CREATE INDEX "ComplianceClause_articleNumber_idx" ON "ComplianceClause"("articleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceClause_documentVersionId_clauseKey_key" ON "ComplianceClause"("documentVersionId", "clauseKey");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceControl_controlCode_key" ON "ComplianceControl"("controlCode");

-- CreateIndex
CREATE INDEX "ComplianceControl_domain_idx" ON "ComplianceControl"("domain");

-- CreateIndex
CREATE INDEX "ComplianceControl_status_idx" ON "ComplianceControl"("status");

-- CreateIndex
CREATE INDEX "RuleControlMapping_ruleId_idx" ON "RuleControlMapping"("ruleId");

-- CreateIndex
CREATE INDEX "RuleControlMapping_controlId_idx" ON "RuleControlMapping"("controlId");

-- CreateIndex
CREATE UNIQUE INDEX "RuleControlMapping_ruleId_controlId_key" ON "RuleControlMapping"("ruleId", "controlId");

-- CreateIndex
CREATE INDEX "ControlClauseMapping_controlId_idx" ON "ControlClauseMapping"("controlId");

-- CreateIndex
CREATE INDEX "ControlClauseMapping_clauseId_idx" ON "ControlClauseMapping"("clauseId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlClauseMapping_controlId_clauseId_relationType_key" ON "ControlClauseMapping"("controlId", "clauseId", "relationType");
