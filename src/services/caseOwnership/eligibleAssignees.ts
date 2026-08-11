/**
 * 可被指派为案件负责人的用户列表（Server-owned）。
 * 禁止返回 password / account / session / email。
 */

import { prisma } from "@/lib/prisma";
import type { CaseAssigneeSummary } from "@/domain/caseOwnership";
import type { UserRole } from "@/domain/auth";

function sortKey(user: CaseAssigneeSummary): string {
  return `${user.displayName.trim().toLowerCase()}\0${user.username.trim().toLowerCase()}\0${user.id}`;
}

export async function listEligibleAssignees(): Promise<CaseAssigneeSummary[]> {
  const rows = await prisma.user.findMany({
    where: {
      enabled: true,
      role: { in: ["ADMIN", "ANALYST"] },
    },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      enabled: true,
    },
  });

  const items: CaseAssigneeSummary[] = [];
  for (const row of rows) {
    if (row.role !== "ADMIN" && row.role !== "ANALYST") continue;
    items.push({
      id: row.id,
      displayName: row.name,
      username: row.username ?? "",
      role: row.role as UserRole,
      enabled: row.enabled,
    });
  }

  items.sort((a, b) => sortKey(a).localeCompare(sortKey(b), "zh-CN"));
  return items;
}

export async function getAssignableUserById(
  userId: string,
): Promise<{
  id: string;
  role: string | null;
  enabled: boolean;
  displayName: string;
  username: string;
} | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      enabled: true,
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    enabled: row.enabled,
    displayName: row.name,
    username: row.username ?? "",
  };
}
