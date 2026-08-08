import { redirect } from "next/navigation";

/**
 * 应用入口：默认进入历史案件列表。
 * 原单页 Demo App 由路由化 Shell 承接，Workbench 接入见后续步骤。
 */
export default function HomePage() {
  redirect("/cases");
}
