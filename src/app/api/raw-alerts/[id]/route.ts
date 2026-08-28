import { NextResponse } from "next/server";
import { toAuthActionFailure, requirePermission } from "@/services/auth/requirePermission";
import { getRawAlertRecordDetail } from "@/services/persistence/rawAlertRepository";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    await requirePermission("CASE_READ");
  } catch (error) {
    return NextResponse.json(toAuthActionFailure(error), {
      status: error instanceof Error && error.name === "UnauthenticatedError" ? 401 : 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { id } = await context.params;
  if (!id || id.length > 128) {
    return NextResponse.json({ error: "原始告警标识无效" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const row = await getRawAlertRecordDetail(id);
    if (!row) return NextResponse.json({ error: "原始告警不存在" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ row }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "原始告警详情暂不可用" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
