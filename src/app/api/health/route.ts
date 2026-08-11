import { NextResponse } from "next/server";

/**
 * Liveness: process can respond. No DB / env / path disclosure.
 * Unauthenticated — for process managers.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { status: "ok" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
