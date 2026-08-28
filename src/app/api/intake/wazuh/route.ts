import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ingestAlertObject } from "@/services/intake/ingestAlertObject";

const MAX_BODY_BYTES = 1_000_000;
const MAX_ALERTS = 100;
const REPLAY_WINDOW_SECONDS = 300;

function unauthorized(message = "签名无效"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401, headers: { "Cache-Control": "no-store" } });
}

export function validSignature(signature: string | null, timestamp: string | null, body: string, secret: string, nowMs = Date.now()): boolean {
  if (!signature || !timestamp || !/^\d{10,13}$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp.length === 13 ? timestamp.slice(0, 10) : timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) > REPLAY_WINDOW_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const supplied = signature.replace(/^sha256=/i, "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

/** Signed Wazuh intake endpoint. Configure WAZUH_WEBHOOK_SECRET out-of-band. */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.WAZUH_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Webhook 未配置" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return NextResponse.json({ error: "请求体超过大小限制" }, { status: 413 });
  if (!validSignature(request.headers.get("x-wazuh-signature") ?? request.headers.get("x-signature"), request.headers.get("x-wazuh-timestamp") ?? request.headers.get("x-webhook-timestamp"), body, secret)) return unauthorized();

  let parsed: unknown;
  try { parsed = JSON.parse(body) as unknown; } catch { return NextResponse.json({ error: "JSON 格式无效" }, { status: 400 }); }
  const records = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && Array.isArray((parsed as { alerts?: unknown }).alerts) ? (parsed as { alerts: unknown[] }).alerts : [parsed]);
  if (records.length === 0 || records.length > MAX_ALERTS || records.some((record) => !record || typeof record !== "object" || Array.isArray(record))) return NextResponse.json({ error: "告警格式或数量无效" }, { status: 400 });

  const bodyHash = createHmac("sha256", "operation").update(body).digest("hex").slice(0, 32);
  const webhookId = request.headers.get("x-webhook-id")?.trim().slice(0, 120);
  const results = [];
  for (let index = 0; index < records.length; index += 1) {
    results.push(await ingestAlertObject({ value: records[index] as Record<string, unknown>, sourceType: "WAZUH", operationId: `wazuh-webhook:${webhookId || bodyHash}:${index}` }));
  }
  const created = results.filter((item) => item.status === "CREATED").length;
  const duplicate = results.filter((item) => item.status === "DUPLICATE").length;
  const rejected = results.filter((item) => item.status === "REJECTED").length;
  return NextResponse.json({ accepted: results.length, created, duplicate, rejected }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
