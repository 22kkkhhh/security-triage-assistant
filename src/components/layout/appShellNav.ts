/** AppShell 导航高亮纯函数（可单测；无 Client / Next hooks） */

/** 案件报告页：与报告中心语义一致，不高亮「历史案件」 */
export function isCaseReportPath(path: string): boolean {
  return /^\/cases\/[^/]+\/report(?:\/|$)/.test(path);
}

export function isCaseListNavActive(path: string): boolean {
  if (path === "/cases") return true;
  if (!path.startsWith("/cases/")) return false;
  if (path.startsWith("/cases/new")) return false;
  if (isCaseReportPath(path)) return false;
  return true;
}

export function isReportsNavActive(path: string): boolean {
  return path.startsWith("/reports") || isCaseReportPath(path);
}
