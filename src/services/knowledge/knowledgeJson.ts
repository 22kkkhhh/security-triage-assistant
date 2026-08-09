/**
 * Knowledge JSON codec：统一 parse/stringify，畸形数据 fail closed。
 */
import { KnowledgeDomainError } from "@/domain/knowledge";

export function encodeKnowledgeJson(value: unknown): string {
  return JSON.stringify(value);
}

export function decodeKnowledgeJson(raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    throw new KnowledgeDomainError("INVALID_JSON", "Knowledge JSON 为空");
  }
  if (typeof raw === "object") {
    // Prisma Json 已解析
    return raw;
  }
  if (typeof raw !== "string") {
    throw new KnowledgeDomainError("INVALID_JSON", "Knowledge JSON 类型无效");
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new KnowledgeDomainError("INVALID_JSON", "Knowledge JSON 无法解析");
  }
}
