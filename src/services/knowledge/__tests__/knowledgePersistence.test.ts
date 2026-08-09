/**
 * v1.4 Step 1：Knowledge persistence smoke + fresh / v1.3.0 forward migration。
 * 仅使用虚构 TEST-* fixture；隔离 DB，不污染 demo。
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KnowledgeDomainError } from "@/domain/knowledge";
import { resetPrismaClient } from "@/lib/prisma";
import {
  getComplianceControlByCode,
  getComplianceDocumentByCanonicalCode,
  listClausesForVersion,
  listControlClauseMappingsByControl,
  listDocumentVersions,
  listRuleControlMappingsByRule,
  upsertComplianceClause,
  upsertComplianceControl,
  upsertComplianceDocument,
  upsertComplianceDocumentVersion,
  upsertControlClauseMapping,
  upsertRuleControlMapping,
} from "@/services/knowledge/knowledgeRepository";

const SMOKE_DB = path.resolve("prisma/test-knowledge-persistence.db");
const FRESH_DB = path.resolve("prisma/test-knowledge-fresh-migrate.db");
const FORWARD_DB = path.resolve("prisma/test-knowledge-forward-from-v130.db");
const KNOWLEDGE_MIGRATION = "20260809150332_add_security_compliance_knowledge";

function cleanDbFiles(file: string) {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = `${file}${suffix}`;
    if (existsSync(p)) unlinkSync(p);
  }
}

function migrateDeploy(url: string) {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

function runSeed(url: string) {
  execSync("npx tsx prisma/seed.ts", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

beforeAll(async () => {
  cleanDbFiles(SMOKE_DB);
  const url = `file:${SMOKE_DB.replace(/\\/g, "/")}`;
  process.env.DATABASE_URL = url;
  migrateDeploy(url);
  await resetPrismaClient(url);
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDbFiles(SMOKE_DB);
  cleanDbFiles(FRESH_DB);
  cleanDbFiles(FORWARD_DB);
});

describe("Knowledge persistence smoke", () => {
  it("upsert document/version/clause/control/mappings 并 reload 映射正确", async () => {
    const doc = await upsertComplianceDocument({
      canonicalCode: "TEST-DOC-001",
      title: "测试数据安全管理规范",
      documentType: "INTERNAL_POLICY",
      jurisdiction: "CN-TEST",
      issuingAuthority: "测试签发机关",
      description: "虚构测试法规A",
    });

    const v1 = await upsertComplianceDocumentVersion({
      documentId: doc.id,
      versionKey: "2021-original",
      versionLabel: "2021 原始版",
      effectiveDate: "2021-09-01",
      expiryDate: "2025-01-01",
      publicationStatus: "PUBLISHED",
      legalStatus: "SUPERSEDED",
      sourceType: "OTHER",
      rightsStatus: "PUBLIC",
      contentMode: "FULL_TEXT",
    });

    const v2 = await upsertComplianceDocumentVersion({
      documentId: doc.id,
      versionKey: "2025-revision",
      versionLabel: "2025 修订版",
      effectiveDate: "2025-01-01",
      expiryDate: null,
      publicationStatus: "PUBLISHED",
      legalStatus: "EFFECTIVE",
      sourceType: "OTHER",
      rightsStatus: "PUBLIC",
      contentMode: "FULL_TEXT",
    });

    const parent = await upsertComplianceClause({
      documentVersionId: v1.id,
      clauseKey: "article-27",
      articleNumber: "第27条",
      heading: "访问控制",
      originalText: "第1条 示例文本",
      topics: ["access-control"],
      sortOrder: 10,
      versionContentMode: "FULL_TEXT",
    });

    const child = await upsertComplianceClause({
      documentVersionId: v1.id,
      clauseKey: "article-27-p1",
      articleNumber: "第27条第一款",
      parentClauseId: parent.id,
      originalText: "第1款 示例文本",
      topics: ["access-control", "incident-response"],
      sortOrder: 11,
      versionContentMode: "FULL_TEXT",
    });

    await expect(
      upsertComplianceClause({
        documentVersionId: v2.id,
        clauseKey: "bad-child",
        parentClauseId: parent.id,
        sortOrder: 1,
        versionContentMode: "FULL_TEXT",
      }),
    ).rejects.toBeInstanceOf(KnowledgeDomainError);

    const control = await upsertComplianceControl({
      controlCode: "TEST-CTRL-001",
      title: "测试访问控制",
      domain: "DATA",
      description: "虚构控制项",
      requiredContext: [{ key: "dataCategory", label: "数据类型" }],
      suggestedEvidence: [{ key: "access-log", label: "访问日志" }],
      suggestedChecklistItems: [{ key: "verify-owner", label: "核实业务负责人" }],
      status: "ACTIVE",
    });

    const rcm = await upsertRuleControlMapping({
      ruleId: "DATA-001",
      controlId: control.id,
      relation: "PRIMARY",
      rationale: "测试映射",
      knownRuleIds: ["DATA-001", "RULE_TEST_001"],
    });

    await expect(
      upsertRuleControlMapping({
        ruleId: "RULE_TEST_001",
        controlId: control.id,
        relation: "SUPPORTING",
        knownRuleIds: ["DATA-001"],
      }),
    ).rejects.toBeInstanceOf(KnowledgeDomainError);

    await expect(
      upsertControlClauseMapping({
        controlId: control.id,
        clauseId: child.id,
        relationType: "INSUFFICIENT_CONTEXT",
        rationale: "不应允许",
        reviewStatus: "APPROVED",
      }),
    ).rejects.toBeInstanceOf(KnowledgeDomainError);

    const ccm = await upsertControlClauseMapping({
      controlId: control.id,
      clauseId: child.id,
      relationType: "CONTROL_SUPPORT",
      rationale: "控制支撑条款",
      reviewStatus: "APPROVED",
    });

    const reloadedDoc = await getComplianceDocumentByCanonicalCode("TEST-DOC-001");
    expect(reloadedDoc?.title).toBe("测试数据安全管理规范");
    const versions = await listDocumentVersions(doc.id);
    expect(versions.map((v) => v.versionKey).sort()).toEqual([
      "2021-original",
      "2025-revision",
    ]);
    const clauses = await listClausesForVersion(v1.id);
    expect(clauses).toHaveLength(2);
    expect(clauses.find((c) => c.clauseKey === "article-27-p1")?.parentClauseId).toBe(
      parent.id,
    );
    expect(await getComplianceControlByCode("TEST-CTRL-001")).toMatchObject({
      controlCode: "TEST-CTRL-001",
      domain: "DATA",
    });
    expect(await listRuleControlMappingsByRule("DATA-001")).toHaveLength(1);
    expect(rcm.relation).toBe("PRIMARY");
    expect(await listControlClauseMappingsByControl(control.id)).toHaveLength(1);
    expect(ccm.relationType).toBe("CONTROL_SUPPORT");

    // unique：重复 upsert 同一键成功；非法 relation 已拒
    await upsertRuleControlMapping({
      ruleId: "DATA-001",
      controlId: control.id,
      relation: "SUPPORTING",
      rationale: "更新为 SUPPORTING",
      knownRuleIds: ["DATA-001"],
    });
    const mappings = await listRuleControlMappingsByRule("DATA-001");
    expect(mappings).toHaveLength(1);
    expect(mappings[0]?.relation).toBe("SUPPORTING");
  });

  it("UNKNOWN rights + FULL_TEXT 在 version upsert 边界拒绝", async () => {
    const doc = await upsertComplianceDocument({
      canonicalCode: "TEST-DOC-RIGHTS",
      title: "测试权利边界",
      documentType: "GUIDELINE",
      jurisdiction: "CN-TEST",
      issuingAuthority: "测试",
    });
    await expect(
      upsertComplianceDocumentVersion({
        documentId: doc.id,
        versionKey: "bad-rights",
        versionLabel: "非法全文",
        effectiveDate: "2024-01-01",
        publicationStatus: "DRAFT",
        legalStatus: "NOT_EFFECTIVE",
        sourceType: "OFFICIAL_PUBLIC",
        rightsStatus: "UNKNOWN",
        contentMode: "FULL_TEXT",
      }),
    ).rejects.toBeInstanceOf(KnowledgeDomainError);
  });
});

describe("Knowledge migration gates", () => {
  it("fresh DB → all migrations", () => {
    cleanDbFiles(FRESH_DB);
    const url = `file:${FRESH_DB.replace(/\\/g, "/")}`;
    migrateDeploy(url);
    expect(existsSync(FRESH_DB)).toBe(true);
    cleanDbFiles(FRESH_DB);
  });

  it("v1.3.0 forward：auth 基线 seed 后应用 knowledge migration，Case/Auth 保留", async () => {
    cleanDbFiles(FORWARD_DB);
    const Database = (await import("better-sqlite3")).default;
    const migrationsRoot = path.resolve("prisma/migrations");
    const all = readdirSync(migrationsRoot)
      .filter((name) =>
        existsSync(path.join(migrationsRoot, name, "migration.sql")),
      )
      .sort();
    expect(all).toContain(KNOWLEDGE_MIGRATION);
    const preKnowledge = all.filter((name) => name !== KNOWLEDGE_MIGRATION);
    expect(preKnowledge.length).toBe(4);

    const db = new Database(FORWARD_DB);
    db.exec(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        id TEXT PRIMARY KEY NOT NULL,
        checksum TEXT NOT NULL,
        finished_at DATETIME,
        migration_name TEXT NOT NULL,
        logs TEXT,
        rolled_back_at DATETIME,
        started_at DATETIME NOT NULL DEFAULT current_timestamp,
        applied_steps_count INTEGER NOT NULL DEFAULT 0
      );
    `);

    const applySqlMigration = (
      client: InstanceType<typeof Database>,
      name: string,
    ) => {
      const sql = readFileSync(
        path.join(migrationsRoot, name, "migration.sql"),
        "utf8",
      );
      client.exec(sql);
      client
        .prepare(
          `INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1)`,
        )
        .run(name, "test-forward-checksum", name);
    };

    for (const name of preKnowledge) {
      applySqlMigration(db, name);
    }
    db.close();

    const url = `file:${FORWARD_DB.replace(/\\/g, "/")}`;
    runSeed(url);

    await resetPrismaClient(url);
    let prisma = (await import("@/lib/prisma")).prisma;
    const aBefore = await prisma.caseAuditLog.count({
      where: { caseId: "demo-case-a" },
    });
    const bBefore = await prisma.caseAuditLog.count({
      where: { caseId: "demo-case-b" },
    });
    expect(aBefore).toBe(6);
    expect(bBefore).toBe(4);
    const userCountBefore = await prisma.user.count();
    const caseABefore = await prisma.caseRecord.findUniqueOrThrow({
      where: { id: "demo-case-a" },
    });
    const reportBefore = caseABefore.hasReport;
    const reportDraftBefore = JSON.stringify(caseABefore.reportDraft);
    await prisma.$disconnect();

    // 以 SQL 方式应用 knowledge migration（模拟 v1.3.0 → v1.4 Step 1 前向）
    const forwardDb = new Database(FORWARD_DB);
    applySqlMigration(forwardDb, KNOWLEDGE_MIGRATION);
    forwardDb.close();

    await resetPrismaClient(url);
    prisma = (await import("@/lib/prisma")).prisma;

    const aAfter = await prisma.caseAuditLog.count({
      where: { caseId: "demo-case-a" },
    });
    const bAfter = await prisma.caseAuditLog.count({
      where: { caseId: "demo-case-b" },
    });
    expect(aAfter).toBe(6);
    expect(bAfter).toBe(4);
    expect(await prisma.user.count()).toBe(userCountBefore);
    const caseAAfter = await prisma.caseRecord.findUniqueOrThrow({
      where: { id: "demo-case-a" },
    });
    expect(caseAAfter.hasReport).toBe(reportBefore);
    expect(JSON.stringify(caseAAfter.reportDraft)).toBe(reportDraftBefore);

    expect(await prisma.complianceDocument.count()).toBe(0);
    expect(await prisma.complianceControl.count()).toBe(0);

    const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='ComplianceDocument'`,
    );
    expect(tables.length).toBe(1);
  });
});
