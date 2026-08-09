/**
 * 密码长度策略：与 Better Auth emailAndPassword 配置对齐（单一常量，避免 UI/auth 漂移）。
 * v1.3 不增加复杂度规则 / 过期 / 历史。
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function isPasswordLengthValid(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH
  );
}
