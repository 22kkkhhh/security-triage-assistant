import { describe, expect, it } from "vitest";
import {
  InvalidAuthUserStateError,
  toAuthUser,
} from "@/services/auth/toAuthUser";

const base = {
  id: "user-1",
  username: "analyst.one",
  name: "测试分析员",
  email: "analyst@example.test",
  role: "ANALYST",
  enabled: true,
};

describe("toAuthUser", () => {
  it("valid VIEWER / ANALYST / ADMIN → maps", () => {
    expect(toAuthUser({ ...base, role: "VIEWER" }).role).toBe("VIEWER");
    expect(toAuthUser({ ...base, role: "ANALYST" }).role).toBe("ANALYST");
    const admin = toAuthUser({ ...base, role: "ADMIN" });
    expect(admin.role).toBe("ADMIN");
    expect(admin.displayName).toBe("测试分析员");
    expect(admin.username).toBe("analyst.one");
  });

  it("allows enabled=false（结构合法；授权由 authorize 拒绝）", () => {
    const user = toAuthUser({ ...base, enabled: false });
    expect(user.enabled).toBe(false);
  });

  it("rejects invalid / lowercase / multi role", () => {
    expect(() => toAuthUser({ ...base, role: "admin" })).toThrow(
      InvalidAuthUserStateError,
    );
    expect(() => toAuthUser({ ...base, role: "user" })).toThrow(
      InvalidAuthUserStateError,
    );
    expect(() => toAuthUser({ ...base, role: "ADMIN,ANALYST" })).toThrow(
      InvalidAuthUserStateError,
    );
    expect(() => toAuthUser({ ...base, role: null })).toThrow(
      InvalidAuthUserStateError,
    );
  });

  it("rejects missing username / email / name / non-boolean enabled", () => {
    expect(() => toAuthUser({ ...base, username: null })).toThrow(
      InvalidAuthUserStateError,
    );
    expect(() => toAuthUser({ ...base, email: "" })).toThrow(
      InvalidAuthUserStateError,
    );
    expect(() => toAuthUser({ ...base, name: "  " })).toThrow(
      InvalidAuthUserStateError,
    );
    expect(() => toAuthUser({ ...base, enabled: null })).toThrow(
      InvalidAuthUserStateError,
    );
  });
});
