import { redirect } from "next/navigation";

/**
 * 应用入口：进入轻量运营总览。
 * 总览只复用案件队列数据，不另建 Dashboard 数据模型。
 */
export default function HomePage() {
  redirect("/overview");
}
