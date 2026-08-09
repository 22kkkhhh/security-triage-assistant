/**
 * v1.4 Step 2A：Curated Knowledge Pack 校验 + 幂等导入。
 */
import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KnowledgeDomainError } from "@/domain/knowledge";
import { allRules } from "@/services/analysis/runRules";
import { resetPrismaClient } from "@/lib/prisma";
import {
  countPackEntities,
  curatedKnowledgePack,
} from "@/services/knowledge/pack/curatedPack";
import {
  countKnowledgeTables,
  importCuratedKnowledgePack,
} from "@/services/knowledge/pack/importCuratedKnowledgePack";
import { validateCuratedPack } from "@/services/knowledge/pack/validateCuratedPack";
import type { CuratedKnowledgePack } from "@/services/knowledge/pack/types";

const TEST_DB = path.resolve("prisma/test-curated-pack-import.db");
const TEST_URL = `file:${TEST_DB.replace(/\\/g, "/")}`;

function cleanDb() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const p = `${TEST_DB}${suffix}`;
    if (existsSync(p)) unlinkSync(p);
  }
}

beforeAll(async () => {
  cleanDb();
  process.env.DATABASE_URL = TEST_URL;
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "pipe",
  });
  await resetPrismaClient(TEST_URL);
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
  cleanDb();
});

describe("validateCuratedPack", () => {
  it("正式 pack 通过：规则覆盖 / GB/T SUMMARY_ONLY / 无非法 relation", () => {
    expect(() => validateCuratedPack(curatedKnowledgePack)).not.toThrow();
    const counts = countPackEntities();
    expect(counts.documents).toBe(5);
    expect(counts.versions).toBe(5);
    expect(counts.clauses).toBeGreaterThanOrEqual(20);
    expect(counts.clauses).toBeLessThanOrEqual(30);
    expect(counts.controls).toBeGreaterThanOrEqual(8);
    expect(counts.ruleControlMappings).toBeGreaterThanOrEqual(allRules.length);

    const gbt = curatedKnowledgePack.documents.find(
      (d) => d.canonicalCode === "CN-GBT-22239",
    );
    expect(gbt?.version.contentMode).toBe("SUMMARY_ONLY");
    expect(gbt?.version.rightsStatus).toBe("UNKNOWN");
    for (const c of gbt?.version.clauses ?? []) {
      expect(c.originalText).toBeNull();
    }

    for (const m of curatedKnowledgePack.controlClauseMappings) {
      expect([
        "CONTROL_SUPPORT",
        "POSSIBLE_OBLIGATION",
        "ESCALATION_TRIGGER",
      ]).toContain(m.relationType);
    }

    const mappedRules = new Set(
      curatedKnowledgePack.ruleControlMappings.map((m) => m.ruleId),
    );
    for (const rule of allRules) {
      expect(mappedRules.has(rule.ruleId)).toBe(true);
    }
  });

  it("未知 ruleId → reject", () => {
    const bad: CuratedKnowledgePack = {
      ...curatedKnowledgePack,
      ruleControlMappings: [
        ...curatedKnowledgePack.ruleControlMappings,
        {
          ruleId: "RULE_NOT_IN_REGISTRY",
          controlCode: "CTRL-DATA-ACCESS-01",
          relation: "PRIMARY",
        },
      ],
    };
    expect(() => validateCuratedPack(bad)).toThrow(KnowledgeDomainError);
  });

  it("GB/T FULL_TEXT → reject", () => {
    const bad: CuratedKnowledgePack = structuredClone(curatedKnowledgePack);
    const gbt = bad.documents.find((d) => d.canonicalCode === "CN-GBT-22239");
    if (!gbt) throw new Error("missing gbt");
    gbt.version.contentMode = "FULL_TEXT";
    gbt.version.rightsStatus = "PUBLIC";
    gbt.version.clauses[0]!.originalText = "不应入库的标准全文";
    expect(() => validateCuratedPack(bad)).toThrow(/SUMMARY_ONLY/);
  });
});

describe("importCuratedKnowledgePack 幂等", () => {
  it("导入两次后计数稳定，且与 pack 期望一致", async () => {
    const expected = countPackEntities();
    const first = await importCuratedKnowledgePack();
    expect(first).toEqual(expected);

    const mid = await countKnowledgeTables();
    expect(mid.documents).toBe(expected.documents);
    expect(mid.clauses).toBe(expected.clauses);
    expect(mid.controls).toBe(expected.controls);
    expect(mid.ruleControlMappings).toBe(expected.ruleControlMappings);
    expect(mid.controlClauseMappings).toBe(expected.controlClauseMappings);

    const second = await importCuratedKnowledgePack();
    expect(second).toEqual(expected);
    const after = await countKnowledgeTables();
    expect(after).toEqual(mid);

    const { prisma } = await import("@/lib/prisma");
    const gbtDoc = await prisma.complianceDocument.findUniqueOrThrow({
      where: { canonicalCode: "CN-GBT-22239" },
      include: { versions: { include: { clauses: true } } },
    });
    expect(gbtDoc.versions[0]?.contentMode).toBe("SUMMARY_ONLY");
    expect(
      gbtDoc.versions[0]?.clauses.every(
        (c) => c.originalText == null || c.originalText === "",
      ),
    ).toBe(true);
  });
});
