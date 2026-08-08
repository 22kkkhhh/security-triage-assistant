/**
 * 报告导出前的敏感信息检查与脱敏。
 * 仅识别格式特征明显的数据：中国大陆手机号、身份证号、Email。
 * 不擅自隐藏 IP 或账号，是否脱敏由人工在导出时选择。
 */

export type SensitiveType = "PHONE" | "ID_CARD" | "EMAIL";

export const sensitiveTypeLabels: Record<SensitiveType, string> = {
  PHONE: "手机号",
  ID_CARD: "身份证号",
  EMAIL: "电子邮箱",
};

export interface SensitiveFinding {
  type: SensitiveType;
  value: string;
  masked: string;
}

const PHONE_PATTERN = /(?<!\d)(1[3-9]\d)(\d{4})(\d{4})(?!\d)/g;
const ID_CARD_PATTERN = /(?<!\d)(\d{6})\d{8}(\d{3}[\dXx])(?!\d)/g;
const EMAIL_PATTERN = /([\w.+-])([\w.+-]*)(@[\w-]+\.[\w.]+)/g;

export function maskPhone(value: string): string {
  return value.replace(PHONE_PATTERN, "$1****$3");
}

export function maskIdCard(value: string): string {
  return value.replace(ID_CARD_PATTERN, "$1********$2");
}

export function maskEmail(value: string): string {
  return value.replace(EMAIL_PATTERN, "$1***$3");
}

/** 扫描文本中可能存在的敏感信息 */
export function scanSensitive(text: string): SensitiveFinding[] {
  const findings: SensitiveFinding[] = [];
  for (const match of text.matchAll(new RegExp(ID_CARD_PATTERN))) {
    findings.push({
      type: "ID_CARD",
      value: match[0],
      masked: maskIdCard(match[0]),
    });
  }
  for (const match of text.matchAll(new RegExp(PHONE_PATTERN))) {
    findings.push({
      type: "PHONE",
      value: match[0],
      masked: maskPhone(match[0]),
    });
  }
  for (const match of text.matchAll(new RegExp(EMAIL_PATTERN))) {
    findings.push({
      type: "EMAIL",
      value: match[0],
      masked: maskEmail(match[0]),
    });
  }
  return findings;
}

/** 对文本应用脱敏（先身份证后手机号，避免重叠误判） */
export function maskSensitiveText(text: string): string {
  return maskEmail(maskPhone(maskIdCard(text)));
}
