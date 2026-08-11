import { auth } from "@/lib/auth";
import { logOperationalEvent } from "@/services/runtime/operationalLogger";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

/**
 * Wrap POST to observe login abuse responses without reading body/username.
 * Only status codes are logged (401/429).
 */
export async function POST(
  request: Request,
): Promise<Response> {
  const response = await handlers.POST(request);
  if (response.status === 429) {
    logOperationalEvent({
      level: "warn",
      event: "auth_rate_limited",
      component: "auth",
      status: "limited",
    });
  }
  return response;
}
