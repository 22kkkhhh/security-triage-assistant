"use client";

import { useMemo, useRef, useState } from "react";
import {
  addHandoffNoteAction,
  loadMoreCaseAuditLogsAction,
} from "@/app/(app)/cases/commandActions";
import { HANDOFF_NOTE_MAX_LENGTH } from "@/domain/audit";
import {
  formatAuditActionLabel,
  formatAuditActorName,
  formatAuditChangesForDisplay,
  formatAuditTime,
  formatHandoffNoteBody,
} from "@/services/audit/formatAuditDisplay";
import type { CaseAuditLogView } from "@/services/persistence/auditRepository";
import { Panel } from "@/components/common";

function mergeByIdDesc(
  current: CaseAuditLogView[],
  incoming: CaseAuditLogView[],
): CaseAuditLogView[] {
  const map = new Map<string, CaseAuditLogView>();
  for (const item of [...incoming, ...current]) {
    map.set(item.id, item);
  }
  return [...map.values()].sort((a, b) => {
    const t = b.createdAt.localeCompare(a.createdAt);
    if (t !== 0) return t;
    return b.id.localeCompare(a.id);
  });
}

/**
 * 操作记录与交接：最新交接卡片 + 添加交接 + Activity Feed（Timeline 之后）。
 */
export function CaseActivityPanel({
  caseId,
  initialItems,
  initialNextCursor,
  initialHasMore,
  initialLatestHandoff,
}: {
  caseId: string;
  initialItems: CaseAuditLogView[];
  initialNextCursor: string | null;
  initialHasMore: boolean;
  initialLatestHandoff: CaseAuditLogView | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [latestHandoff, setLatestHandoff] = useState(initialLatestHandoff);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const operationIdRef = useRef<string | null>(null);

  const handoffBody = useMemo(
    () => (latestHandoff ? formatHandoffNoteBody(latestHandoff) : ""),
    [latestHandoff],
  );

  const handleAddHandoff = async () => {
    if (submitting) return;
    setHandoffError(null);
    if (!operationIdRef.current) {
      operationIdRef.current = crypto.randomUUID();
    }
    setSubmitting(true);
    try {
      const result = await addHandoffNoteAction(
        caseId,
        note,
        operationIdRef.current,
      );
      if (!result.ok) {
        setHandoffError(result.error || "交接记录添加失败，请重试。");
        return;
      }
      setLatestHandoff(result.audit);
      setItems((prev) => mergeByIdDesc(prev, [result.audit]));
      setNote("");
      operationIdRef.current = null;
    } catch {
      setHandoffError("交接记录添加失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || !nextCursor) return;
    setLoadError(null);
    setLoadingMore(true);
    try {
      const result = await loadMoreCaseAuditLogsAction(
        caseId,
        nextCursor,
        40,
      );
      if (!result.ok) {
        setLoadError(result.error || "操作记录加载失败，请重试。");
        return;
      }
      setItems((prev) => mergeByIdDesc(prev, result.result.items));
      setNextCursor(result.result.nextCursor);
      setHasMore(result.result.hasMore);
    } catch {
      setLoadError("操作记录加载失败，请重试。");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Panel title="操作记录与交接">
      <div className="space-y-5">
        <section className="rounded border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-medium text-slate-600">最新交接</div>
          {latestHandoff ? (
            <div className="mt-2 space-y-1.5">
              <div className="text-xs text-neutral-500">
                {formatAuditActorName(latestHandoff)} ·{" "}
                {formatAuditTime(latestHandoff.createdAt)}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-900">
                {handoffBody}
              </p>
            </div>
          ) : (
            <div className="mt-2 space-y-1">
              <p className="text-sm text-neutral-700">暂无交接记录</p>
              <p className="text-xs text-neutral-500">
                如需交由下一班继续处理，可在下方补充当前进展和待办事项。
              </p>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-xs font-medium text-neutral-600">交接说明</div>
            <div className="text-xs text-neutral-400">
              请勿录入未经授权的真实敏感数据。
            </div>
          </div>
          <textarea
            className="h-28 w-full rounded border border-neutral-300 px-3 py-2 text-sm leading-6"
            value={note}
            maxLength={HANDOFF_NOTE_MAX_LENGTH}
            placeholder="例如：已完成账号核实；已联系业务负责人；下一班重点核查出口网络日志。"
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-neutral-400">
              {note.trim().length}/{HANDOFF_NOTE_MAX_LENGTH}
            </div>
            <button
              type="button"
              disabled={submitting || !note.trim()}
              onClick={() => void handleAddHandoff()}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40"
            >
              {submitting ? "正在添加…" : "添加交接记录"}
            </button>
          </div>
          {handoffError && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {handoffError}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="text-xs font-medium text-neutral-600">最近操作</div>
          {items.length === 0 ? (
            <p className="text-sm text-neutral-500">暂无操作记录。</p>
          ) : (
            <ol className="relative space-y-3 border-l border-neutral-200 pl-4">
              {items.map((log) => {
                const detailLines = formatAuditChangesForDisplay(log);
                return (
                  <li key={log.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-500" />
                    <div className="text-xs text-neutral-500">
                      {formatAuditTime(log.createdAt).slice(11)} ·{" "}
                      {formatAuditActorName(log)}
                    </div>
                    <div className="mt-0.5 text-sm font-medium text-neutral-900">
                      {formatAuditActionLabel(log.actionType)}
                    </div>
                    {detailLines.map((line) => (
                      <p
                        key={`${log.id}-${line}`}
                        className="text-xs leading-5 text-neutral-600"
                      >
                        {line}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ol>
          )}

          {loadError && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {loadError}
            </div>
          )}

          {hasMore && (
            <div className="pt-1">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void handleLoadMore()}
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                {loadingMore ? "加载中…" : "加载更多"}
              </button>
            </div>
          )}
        </section>
      </div>
    </Panel>
  );
}
