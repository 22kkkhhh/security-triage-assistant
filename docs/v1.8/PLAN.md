# v1.8 Plan

## Theme

Historical Case Correlation + open-source baseline continuity.

## M1 — Historical Case Correlation

- Deterministic Related Cases on Case Workbench（no AI / no probability）
- Dimensions: username, sourceIp, accessedSystems, originalAlertId；alert.source 仅作附加 reason
- Window: last 30 days；cap: 5
- Server-side query under `CASE_READ`；no Prisma migration
