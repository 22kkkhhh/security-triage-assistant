"use server";

import { headers } from "next/headers";
import { UserAdminError } from "@/domain/userAdminErrors";
import {
  requirePermission,
  toAuthActionFailure,
} from "@/services/auth/requirePermission";
import { changeOwnPassword } from "@/services/auth/passwordLifecycleService";
import { parseSelfPasswordInput } from "@/services/auth/userAdminParsers";

export type AccountActionResult =
  | { ok: true; message: string }
  | {
      ok: false;
      error: string;
      code?: "UNAUTHENTICATED" | "FORBIDDEN" | UserAdminError["code"];
    };

export async function changeOwnPasswordAction(
  raw: unknown,
): Promise<AccountActionResult> {
  let user;
  try {
    user = await requirePermission("PASSWORD_SELF_CHANGE");
  } catch (error) {
    return toAuthActionFailure(error);
  }
  try {
    const input = parseSelfPasswordInput(raw);
    const hdrs = await headers();
    await changeOwnPassword({
      authUser: user,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      headers: hdrs,
    });
    return { ok: true, message: "密码已修改。" };
  } catch (error) {
    if (error instanceof UserAdminError) {
      return { ok: false, error: error.message, code: error.code };
    }
    return toAuthActionFailure(error);
  }
}
