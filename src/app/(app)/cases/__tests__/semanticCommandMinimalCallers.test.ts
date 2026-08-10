/**
 * M4 Semantic Command Canonicalization — Minimal Caller Migration 回归。
 *
 * 证明 Browser → Server Action → Service 只传每个语义命令必需的 minimal intent，
 * 不再存在 full SaveCaseStateInput / rawNextState 路径。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type CommandInput = Record<string, unknown>;

const captured = vi.hoisted(() => ({
  status: [] as CommandInput[],
  checklist: [] as CommandInput[],
  businessContext: [] as CommandInput[],
  timeline: [] as CommandInput[],
  humanReview: [] as CommandInput[],
  permissions: [] as string[],
  denyPermission: null as string | null,
}));

vi.mock("@/services/persistence/auditRepository", () => ({
  listCaseAuditLogs: vi.fn(async () => ({
    items: [],
    nextCursor: null,
    hasMore: false,
  })),
}));

vi.mock("@/services/auth/requirePermission", async () => {
  const { ForbiddenError, UnauthenticatedError } = await import("@/domain/auth");
  return {
    requirePermission: async (permission: string) => {
      captured.permissions.push(permission);
      if (captured.denyPermission === permission) {
        throw new ForbiddenError();
      }
      return {
        id: "test-analyst",
        username: "test.analyst",
        displayName: "测试分析员",
        email: "test.analyst@example.test",
        role: "ANALYST",
        enabled: true,
      };
    },
    toAuthActionFailure: (error: unknown) => {
      if (error instanceof UnauthenticatedError) {
        return {
          ok: false,
          error: "登录状态已失效，请重新登录",
          code: "UNAUTHENTICATED",
        };
      }
      if (error instanceof ForbiddenError) {
        return {
          ok: false,
          error: "当前账号无权限执行此操作",
          code: "FORBIDDEN",
        };
      }
      throw error;
    },
  };
});

vi.mock("@/services/caseCommands", async () => {
  const { isCaseStatus, CASE_STATUSES } = await import(
    "@/services/caseCommands/types"
  );
  const okResult = () => ({
    ok: true as const,
    alreadyApplied: false,
    audit: null,
    case: {
      updatedAt: "2026-08-10T00:00:00.000Z",
      lastActivityAt: "2026-08-10T00:00:00.000Z",
      status: "INVESTIGATING",
      caseState: {
        businessContext: {},
        checklist: [],
        humanReview: null,
        timeline: [],
      },
    },
  });
  return {
    isCaseStatus,
    CASE_STATUSES,
    changeCaseStatusCommand: async (input: CommandInput) => {
      captured.status.push(input);
      return okResult();
    },
    applyChecklistCommand: async (input: CommandInput) => {
      captured.checklist.push(input);
      return okResult();
    },
    updateBusinessContextCommand: async (input: CommandInput) => {
      captured.businessContext.push(input);
      return okResult();
    },
    updateHumanReviewCommand: async (input: CommandInput) => {
      captured.humanReview.push(input);
      return okResult();
    },
    addTimelineEventCommand: async (input: CommandInput) => {
      captured.timeline.push(input);
      return okResult();
    },
    addHandoffNoteCommand: async () => okResult(),
  };
});

const {
  addTimelineEventAction,
  applyChecklistCommandAction,
  changeCaseStatusAction,
  updateBusinessContextAction,
  updateHumanReviewAction,
} = await import("@/app/(app)/cases/commandActions");

const CASE_ID = "case-1";
const BASE = "2026-08-09T00:00:00.000Z";

beforeEach(() => {
  captured.status.length = 0;
  captured.checklist.length = 0;
  captured.businessContext.length = 0;
  captured.timeline.length = 0;
  captured.humanReview.length = 0;
  captured.permissions.length = 0;
  captured.denyPermission = null;
});

describe("Status semantic command payload", () => {
  it("只发送 nextStatus，不构造 nextCaseState", async () => {
    const result = await changeCaseStatusAction(
      CASE_ID,
      "RESPONDING",
      "op-status-1",
      BASE,
    );
    expect(result.ok).toBe(true);
    expect(captured.status).toHaveLength(1);
    const input = captured.status[0]!;
    expect(Object.keys(input).sort()).toEqual([
      "actor",
      "baseUpdatedAt",
      "caseId",
      "nextStatus",
      "operationId",
    ]);
    expect(input.nextCaseState).toBeUndefined();
    expect(input.nextStatus).toBe("RESPONDING");
    expect(input.baseUpdatedAt).toBe(BASE);
  });

  it("非法状态在 mutation 前拒绝", async () => {
    const result = await changeCaseStatusAction(
      CASE_ID,
      "NOT_A_STATUS",
      "op-status-2",
      BASE,
    );
    expect(result.ok).toBe(false);
    expect(captured.status).toHaveLength(0);
  });

  it("requirePermission 在 mutation 前执行", async () => {
    captured.denyPermission = "CASE_STATUS_CHANGE";
    const result = await changeCaseStatusAction(
      CASE_ID,
      "RESPONDING",
      "op-status-3",
      BASE,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FORBIDDEN");
    expect(captured.permissions).toEqual(["CASE_STATUS_CHANGE"]);
    expect(captured.status).toHaveLength(0);
  });
});

describe("BusinessContext semantic command payload", () => {
  const forgedPatch = {
    plannedTaskStatus: "CONFIRMED",
    changeTicketStatus: "NOT_FOUND",
    ownerVerification: "NOT_CONFIRMED",
    businessLegitimacy: "AUTHORIZED",
    // 以下均为伪造字段，不得进入 service payload
    changeTicketId: "CHG-FORGED",
    businessOwner: "伪造负责人",
    businessJustification: "伪造说明",
    checklist: [{ id: "x" }],
    humanReview: { finalConclusion: "NORMAL_BUSINESS" },
    timeline: [{ id: "y" }],
    status: "CLOSED",
    suggestedRiskLevel: "CRITICAL",
  };

  it("只转发四个结构化字段", async () => {
    const result = await updateBusinessContextAction(
      CASE_ID,
      "op-bc-1",
      BASE,
      forgedPatch,
    );
    expect(result.ok).toBe(true);
    expect(captured.businessContext).toHaveLength(1);
    const input = captured.businessContext[0]!;
    expect(input.nextCaseState).toBeUndefined();
    expect(input.businessContextPatch).toEqual({
      plannedTaskStatus: "CONFIRMED",
      changeTicketStatus: "NOT_FOUND",
      ownerVerification: "NOT_CONFIRMED",
      businessLegitimacy: "AUTHORIZED",
    });
  });

  it("伪造的自由文本 / checklist / humanReview / status 不进入 service payload", async () => {
    await updateBusinessContextAction(CASE_ID, "op-bc-2", BASE, forgedPatch);
    const serialized = JSON.stringify(captured.businessContext[0]);
    expect(serialized).not.toContain("CHG-FORGED");
    expect(serialized).not.toContain("伪造负责人");
    expect(serialized).not.toContain("伪造说明");
    expect(serialized).not.toContain("CLOSED");
    expect(serialized).not.toContain("CRITICAL");
    expect(serialized).not.toContain("checklist");
    expect(serialized).not.toContain("timeline");
    expect(serialized).not.toContain("humanReview");
  });

  it("枚举非法时拒绝且不调用 service", async () => {
    const result = await updateBusinessContextAction(CASE_ID, "op-bc-3", BASE, {
      ...forgedPatch,
      businessLegitimacy: "TOTALLY_FINE",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("业务合理性结论无效");
    expect(captured.businessContext).toHaveLength(0);
  });
});

describe("Checklist semantic command payload", () => {
  it("complete / reopen / delete 不需要任何 item state", async () => {
    for (const action of ["complete", "reopen", "delete"] as const) {
      const result = await applyChecklistCommandAction(
        CASE_ID,
        action,
        "CL-1",
        `op-cl-${action}`,
        BASE,
      );
      expect(result.ok).toBe(true);
    }
    expect(captured.checklist).toHaveLength(3);
    for (const input of captured.checklist) {
      expect(Object.keys(input).sort()).toEqual([
        "action",
        "actor",
        "baseUpdatedAt",
        "caseId",
        "itemId",
        "operationId",
      ]);
      expect(input.nextCaseState).toBeUndefined();
      expect(input.itemIntent).toBeUndefined();
    }
  });

  it("add 只发送 allowlisted minimal intent", async () => {
    const result = await applyChecklistCommandAction(
      CASE_ID,
      "add",
      "CL-ADD-1",
      "op-cl-add",
      BASE,
      {
        id: "CL-ADD-1",
        category: "IDENTITY",
        label: "人工补充核查",
        note: "备注",
        // 伪造字段：Server 拥有这些语义
        completed: true,
        origin: "RULE",
        relatedRuleId: "RULE-999",
      },
    );
    expect(result.ok).toBe(true);
    const input = captured.checklist[0]!;
    expect(input.nextCaseState).toBeUndefined();
    expect(input.itemIntent).toEqual({
      id: "CL-ADD-1",
      category: "IDENTITY",
      label: "人工补充核查",
      note: "备注",
    });
  });

  it("KNOWLEDGE_SUGGESTED add 保留 sourceKind / sourceRef", async () => {
    const sourceRef = {
      suggestionKey: "CONTEXT:destinationRegion",
      kind: "CONTEXT",
      controlCodes: ["C-1"],
      clauseRefs: [{ clauseKey: "CL-A", documentCanonicalCode: "DOC-A" }],
      relevance: "跨境传输",
    };
    const result = await applyChecklistCommandAction(
      CASE_ID,
      "add",
      "CL-KS-1",
      "op-cl-ks",
      BASE,
      {
        id: "CL-KS-1",
        category: "DATA",
        label: "核查跨境传输合规性",
        note: null,
        sourceKind: "KNOWLEDGE_SUGGESTED",
        sourceRef,
        completed: true,
        origin: "RULE",
        relatedRuleId: "RULE-1",
      },
    );
    expect(result.ok).toBe(true);
    expect(captured.checklist[0]!.itemIntent).toEqual({
      id: "CL-KS-1",
      category: "DATA",
      label: "核查跨境传输合规性",
      note: null,
      sourceKind: "KNOWLEDGE_SUGGESTED",
      sourceRef,
    });
  });

  it("add 的 id 不一致 / 分类非法 / 非法来源均被拒绝", async () => {
    const mismatched = await applyChecklistCommandAction(
      CASE_ID,
      "add",
      "CL-A",
      "op-cl-bad-1",
      BASE,
      { id: "CL-B", category: "DATA", label: "x" },
    );
    expect(mismatched.ok).toBe(false);

    const badCategory = await applyChecklistCommandAction(
      CASE_ID,
      "add",
      "CL-A",
      "op-cl-bad-2",
      BASE,
      { id: "CL-A", category: "NOT_A_DOMAIN", label: "x" },
    );
    expect(badCategory.ok).toBe(false);

    const badSource = await applyChecklistCommandAction(
      CASE_ID,
      "add",
      "CL-A",
      "op-cl-bad-3",
      BASE,
      { id: "CL-A", category: "DATA", label: "x", sourceKind: "RULE_FORGED" },
    );
    expect(badSource.ok).toBe(false);

    const missingIntent = await applyChecklistCommandAction(
      CASE_ID,
      "add",
      "CL-A",
      "op-cl-bad-4",
      BASE,
    );
    expect(missingIntent.ok).toBe(false);

    expect(captured.checklist).toHaveLength(0);
  });
});

describe("Timeline semantic command payload", () => {
  it("只发送 minimal intent，且不发送 source", async () => {
    const result = await addTimelineEventAction(
      CASE_ID,
      "EV-1",
      "op-tl-1",
      BASE,
      {
        id: "EV-1",
        occurredAt: "2026-08-09T02:00:00.000Z",
        eventType: "数据访问",
        title: "人工记录",
        description: "说明",
        operator: "分析员",
        source: "SYSTEM",
      },
    );
    expect(result.ok).toBe(true);
    const input = captured.timeline[0]!;
    expect(input.nextCaseState).toBeUndefined();
    expect(input.eventIntent).toEqual({
      id: "EV-1",
      occurredAt: "2026-08-09T02:00:00.000Z",
      eventType: "数据访问",
      title: "人工记录",
      description: "说明",
      operator: "分析员",
    });
    expect(JSON.stringify(input)).not.toContain("SYSTEM");
  });

  it("eventId 不一致时拒绝", async () => {
    const result = await addTimelineEventAction(
      CASE_ID,
      "EV-1",
      "op-tl-2",
      BASE,
      {
        id: "EV-2",
        occurredAt: "2026-08-09T02:00:00.000Z",
        eventType: "数据访问",
        title: "人工记录",
        description: "说明",
        operator: null,
      },
    );
    expect(result.ok).toBe(false);
    expect(captured.timeline).toHaveLength(0);
  });
});

describe("HumanReview contract 未变更", () => {
  it("仍只接受 finalConclusion / humanRiskLevel（签名与语义不变）", async () => {
    const result = await updateHumanReviewAction(
      CASE_ID,
      "op-hr-1",
      { finalConclusion: "NORMAL_BUSINESS", humanRiskLevel: "LOW" },
      BASE,
    );
    expect(result.ok).toBe(true);
    const input = captured.humanReview[0]!;
    expect(input.finalConclusion).toBe("NORMAL_BUSINESS");
    expect(input.humanRiskLevel).toBe("LOW");
    expect(input.nextCaseState).toBeUndefined();
  });

  it("夹带 reviewer / reviewedByUserId 仍被 runtime reject", async () => {
    const result = await updateHumanReviewAction(
      CASE_ID,
      "op-hr-2",
      {
        finalConclusion: "NORMAL_BUSINESS",
        humanRiskLevel: "LOW",
        reviewer: "伪造责任人",
        reviewedByUserId: "forged-id",
      },
      BASE,
    );
    expect(result.ok).toBe(false);
    expect(captured.humanReview).toHaveLength(0);
  });
});

describe("source-level 迁移回归", () => {
  const readSrc = (relative: string) =>
    readFileSync(path.resolve("src", relative), "utf8");
  const actions = readSrc("app/(app)/cases/commandActions.ts");
  const workbench = readSrc("components/cases/PersistedCaseWorkbench.tsx");

  it("commandActions.ts 不再存在 parseNextState / SaveCaseStateInput", () => {
    expect(actions).not.toContain("parseNextState");
    expect(actions).not.toContain("SaveCaseStateInput");
    expect(actions).not.toContain("rawNextState");
    expect(actions).not.toContain("nextCaseState");
  });

  it("PersistedCaseWorkbench.tsx 不再存在 getCommandPayload / payloadRef", () => {
    expect(workbench).not.toContain("getCommandPayload");
    expect(workbench).not.toContain("payloadRef");
    expect(workbench).not.toContain("LivePayload");
    expect(workbench).not.toContain("nextCaseState");
  });

  it("Action error sanitizer 与 STALE 处理仍在", () => {
    expect(actions).toContain("sanitizeActionErrorMessage");
    expect(actions).toContain('code: "STALE"');
    expect(actions).toContain("requirePermission");
  });
});
