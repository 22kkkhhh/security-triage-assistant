import { NextResponse } from "next/server";
import { toAuthActionFailure, requirePermission } from "@/services/auth/requirePermission";
import { queryRawAlertRecords } from "@/services/persistence/rawAlertRepository";

const statuses = new Set(["RECEIVED", "CREATED", "DUPLICATE", "REJECTED"]);

export async function GET(request: Request): Promise<NextResponse> {
  try { await requirePermission("CASE_READ"); } catch (error) { return NextResponse.json(toAuthActionFailure(error), { status: error instanceof Error && error.name === "UnauthenticatedError" ? 401 : 403 }); }
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  if (status && !statuses.has(status)) return NextResponse.json({ error: "状态筛选无效" }, { status: 400 });
  try {
    const result = await queryRawAlertRecords({ sourceType: url.searchParams.get("sourceType") ?? undefined, ingestStatus: status as "RECEIVED" | "CREATED" | "DUPLICATE" | "REJECTED" | undefined, externalAlertId: url.searchParams.get("externalAlertId") ?? undefined, page: Number(url.searchParams.get("page") ?? 1), pageSize: Number(url.searchParams.get("pageSize") ?? 25) });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "原始告警查询暂不可用" }, { status: 503 }); }
}
