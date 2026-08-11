import { NextResponse } from "next/server";
import {
  checkApplicationReadiness,
  formatReadinessFailureMessage,
} from "@/services/runtime/readiness";

/**
 * Readiness: DB + critical Case schema available.
 * Failures return generic JSON only; sanitized category may go to stderr.
 */
export async function GET(): Promise<NextResponse> {
  const result = await checkApplicationReadiness();

  if (!result.ready) {
    console.error(formatReadinessFailureMessage(result.category));
    return NextResponse.json(
      { status: "not_ready" },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    { status: "ready" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
