/**
 * Step 4 烟测：三种导入确认路径 → createCaseAction → 恢复 / 列表搜索。
 * 结束后删除本脚本创建的案件，避免污染 dev.db。
 */
import { createCaseAction } from "../src/app/(app)/cases/actions";
import {
  applyFieldMapping,
  parseCsv,
  suggestFieldMapping,
} from "../src/services/normalization/csv";
import { normalizeRecord } from "../src/services/normalization/normalize";
import { parsePastedText } from "../src/services/normalization/textParser";
import { prisma } from "../src/lib/prisma";
import {
  getCaseById,
  listCases,
} from "../src/services/persistence/caseRepository";
import { restoreWorkbenchFromPersisted } from "../src/services/persistence/restoreWorkbench";
import { formatDateTimeForDisplay } from "../src/lib/formatDateTimeForDisplay";

async function main() {
  const createdIds: string[] = [];

  // A. 手工
  const manual = normalizeRecord({
    sourceType: "MANUAL",
    pairs: [
      { rawKey: "alertName", rawValue: "Smoke手工告警" },
      { rawKey: "alertTime", rawValue: "2026-08-08 02:36" },
      { rawKey: "username", rawValue: "smoke_manual_user" },
      { rawKey: "sourceIp", rawValue: "10.20.16.87" },
      { rawKey: "accessedSystems", rawValue: "CRM_PROD" },
    ],
  }).input;
  const a = await createCaseAction(manual);
  if (!a.ok) throw new Error(`手工创建失败: ${a.error}`);
  createdIds.push(a.id);
  const viewA = restoreWorkbenchFromPersisted((await getCaseById(a.id))!);
  if (viewA.draft.identityContext.accountName !== "smoke_manual_user") {
    throw new Error("手工恢复失败");
  }

  // B. 文本
  const text = parsePastedText(
    [
      "告警名称：Smoke文本告警",
      "告警时间：2026-08-08 02:36",
      "账号：smoke_text_user",
      "源IP：172.16.8.23",
      "访问系统：HR系统,ERP系统",
    ].join("\n"),
    "DATABASE_AUDIT",
  ).input;
  const b = await createCaseAction(text);
  if (!b.ok) throw new Error(`文本创建失败: ${b.error}`);
  createdIds.push(b.id);
  const foundB = await listCases({ search: "smoke_text_user" });
  if (!foundB.some((item) => item.id === b.id)) {
    throw new Error("文本案件搜索失败");
  }

  // C. CSV
  const csv = parseCsv(
    [
      "alert_name,alert_time,src_ip,username,systems",
      "SmokeCSV告警,2026-08-08 02:36,10.30.1.9,smoke_csv_user,CRM_PROD",
    ].join("\n"),
  );
  const pairs = applyFieldMapping(csv.rows[0], suggestFieldMapping(csv.headers));
  const csvInput = normalizeRecord({
    sourceType: "DATABASE_AUDIT",
    pairs,
  }).input;
  const c = await createCaseAction(csvInput);
  if (!c.ok) throw new Error(`CSV 创建失败: ${c.error}`);
  createdIds.push(c.id);
  const viewC = restoreWorkbenchFromPersisted((await getCaseById(c.id))!);
  const listC = await listCases({ search: c.caseNumber });
  if (listC.length === 0) throw new Error("CSV 列表未找到");

  const display = formatDateTimeForDisplay("2026-08-08T01:30:00+08:00");
  if (display.includes("T") || display.includes("Z") || display.includes("+")) {
    throw new Error(`时间展示仍含 ISO: ${display}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        manual: { id: a.id, caseNumber: a.caseNumber },
        text: { id: b.id, caseNumber: b.caseNumber },
        csv: {
          id: c.id,
          caseNumber: c.caseNumber,
          title: viewC.title,
          status: listC[0]?.status,
        },
        timeDisplay: display,
      },
      null,
      2,
    ),
  );

  // 清理本脚本创建的记录
  await prisma.caseRecord.deleteMany({ where: { id: { in: createdIds } } });
  console.log("cleaned", createdIds.length, "smoke cases");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
